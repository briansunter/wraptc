/**
 * PluginRegistry Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PluginRegistry } from "../../../plugin/registry";
import type { PluginDefinition, ManagedProvider } from "../../../plugin/types";
import type { Provider } from "../../../providers";
import type { CodingEvent, ProviderErrorContext } from "../../../types";

// Mock provider for testing
class MockProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly supportsStreaming = false;
	readonly prefersJson = false;
	initCalled = false;
	shutdownCalled = false;

	constructor(config: { id: string }) {
		this.id = config.id;
		this.displayName = `Mock ${config.id}`;
	}

	async runOnce() {
		return { text: "mock response" };
	}

	async *runStream(): AsyncGenerator<CodingEvent> {
		yield { type: "start", provider: this.id, requestId: "req-1" };
		yield { type: "complete", provider: this.id, text: "mock" };
	}

	classifyError(): "UNKNOWN" {
		return "UNKNOWN";
	}

	getInfo() {
		return {
			id: this.id,
			displayName: this.displayName,
			supportsStreaming: false,
			prefersJson: false,
		};
	}

	async init() {
		this.initCalled = true;
	}

	async shutdown() {
		this.shutdownCalled = true;
	}
}

function createMockPlugin(type: string, options?: {
	onRegister?: () => Promise<void>;
	onUnregister?: () => Promise<void>;
}): PluginDefinition {
	return {
		type,
		displayName: `Mock ${type}`,
		hasLifecycle: false,
		factory: (config: any) => new MockProvider({ id: type, ...config }),
		onRegister: options?.onRegister,
		onUnregister: options?.onUnregister,
	};
}

describe("PluginRegistry", () => {
	let registry: PluginRegistry;

	beforeEach(() => {
		PluginRegistry.resetInstance();
		registry = PluginRegistry.getInstance();
	});

	afterEach(async () => {
		await registry.clear();
	});

	describe("singleton pattern", () => {
		test("should return same instance", () => {
			const instance1 = PluginRegistry.getInstance();
			const instance2 = PluginRegistry.getInstance();
			expect(instance1).toBe(instance2);
		});

		test("should reset instance", () => {
			const instance1 = PluginRegistry.getInstance();
			PluginRegistry.resetInstance();
			const instance2 = PluginRegistry.getInstance();
			expect(instance1).not.toBe(instance2);
		});
	});

	describe("registration", () => {
		test("should register a plugin", async () => {
			const plugin = createMockPlugin("test");
			const result = await registry.register(plugin);

			expect(result.success).toBe(true);
			expect(result.type).toBe("test");
			expect(registry.has("test")).toBe(true);
		});

		test("should reject duplicate registration", async () => {
			const plugin = createMockPlugin("test");
			await registry.register(plugin);
			const result = await registry.register(plugin);

			expect(result.success).toBe(false);
			expect(result.message).toContain("already registered");
		});

		test("should allow overwrite", async () => {
			const plugin1 = createMockPlugin("test");
			const plugin2 = createMockPlugin("test");
			plugin2.displayName = "New Test";

			await registry.register(plugin1);
			const result = await registry.register(plugin2, { overwrite: true });

			expect(result.success).toBe(true);
			expect(registry.get("test")?.displayName).toBe("New Test");
		});

		test("should call onRegister hook", async () => {
			let registerCalled = false;
			const plugin = createMockPlugin("test", {
				onRegister: async () => {
					registerCalled = true;
				},
			});

			await registry.register(plugin);
			expect(registerCalled).toBe(true);
		});

		test("should rollback on onRegister failure", async () => {
			const plugin = createMockPlugin("test", {
				onRegister: async () => {
					throw new Error("Registration failed");
				},
			});

			const result = await registry.register(plugin);

			expect(result.success).toBe(false);
			expect(result.message).toContain("Registration failed");
			expect(registry.has("test")).toBe(false);
		});
	});

	describe("sync registration", () => {
		test("should register synchronously", () => {
			const plugin = createMockPlugin("test");
			const result = registry.registerSync(plugin);

			expect(result.success).toBe(true);
			expect(registry.has("test")).toBe(true);
		});

		test("should not call lifecycle hooks for sync registration", () => {
			let hookCalled = false;
			const plugin = createMockPlugin("test", {
				onRegister: async () => {
					hookCalled = true;
				},
			});

			registry.registerSync(plugin);
			expect(hookCalled).toBe(false);
		});
	});

	describe("unregistration", () => {
		test("should unregister a plugin", async () => {
			const plugin = createMockPlugin("test");
			await registry.register(plugin);

			const result = await registry.unregister("test");

			expect(result).toBe(true);
			expect(registry.has("test")).toBe(false);
		});

		test("should return false for non-existent plugin", async () => {
			const result = await registry.unregister("non-existent");
			expect(result).toBe(false);
		});

		test("should call onUnregister hook", async () => {
			let unregisterCalled = false;
			const plugin = createMockPlugin("test", {
				onUnregister: async () => {
					unregisterCalled = true;
				},
			});

			await registry.register(plugin);
			await registry.unregister("test");

			expect(unregisterCalled).toBe(true);
		});
	});

	describe("queries", () => {
		test("should get all types", async () => {
			await registry.register(createMockPlugin("a"));
			await registry.register(createMockPlugin("b"));
			await registry.register(createMockPlugin("c"));

			const types = registry.getTypes();

			expect(types).toHaveLength(3);
			expect(types).toContain("a");
			expect(types).toContain("b");
			expect(types).toContain("c");
		});

		test("should get plugin definition", async () => {
			const plugin = createMockPlugin("test");
			plugin.description = "Test plugin";

			await registry.register(plugin);

			const retrieved = registry.get("test");
			expect(retrieved?.displayName).toBe("Mock test");
			expect(retrieved?.description).toBe("Test plugin");
		});

		test("should list plugins", async () => {
			await registry.register(createMockPlugin("a"));
			await registry.register(createMockPlugin("b"));

			const plugins = registry.listPlugins();

			expect(plugins).toHaveLength(2);
			expect(plugins[0].type).toBe("a");
			expect(plugins[1].type).toBe("b");
		});
	});

	describe("provider creation", () => {
		test("should create provider from plugin", async () => {
			const plugin = createMockPlugin("test");
			await registry.register(plugin);

			const provider = registry.createProvider("test", { id: "test" });

			expect(provider.id).toBe("test");
		});

		test("should throw for unknown type", () => {
			expect(() => registry.createProvider("unknown", {})).toThrow(
				"No plugin registered for type 'unknown'",
			);
		});

		test("should pass config to factory", async () => {
			const plugin: PluginDefinition = {
				type: "test",
				displayName: "Test",
				hasLifecycle: false,
				factory: (config: any) => new MockProvider({ id: config.customId }),
			};
			await registry.register(plugin);

			const provider = registry.createProvider("test", { customId: "custom" });

			expect(provider.id).toBe("custom");
		});
	});

	describe("lifecycle management", () => {
		test("should initialize and track provider", async () => {
			const plugin: PluginDefinition = {
				type: "test",
				displayName: "Test",
				hasLifecycle: true,
				factory: () => new MockProvider({ id: "test" }),
			};
			await registry.register(plugin);

			const provider = (await registry.createAndInitProvider(
				"test",
				{},
			)) as MockProvider;

			expect(provider.initCalled).toBe(true);
		});

		test("should shutdown all providers", async () => {
			const provider1 = new MockProvider({ id: "a" });
			const provider2 = new MockProvider({ id: "b" });

			const plugin1: PluginDefinition = {
				type: "a",
				displayName: "A",
				hasLifecycle: true,
				factory: () => provider1,
			};
			const plugin2: PluginDefinition = {
				type: "b",
				displayName: "B",
				hasLifecycle: true,
				factory: () => provider2,
			};

			await registry.register(plugin1);
			await registry.register(plugin2);

			await registry.createAndInitProvider("a", {});
			await registry.createAndInitProvider("b", {});

			await registry.shutdownAll();

			expect(provider1.shutdownCalled).toBe(true);
			expect(provider2.shutdownCalled).toBe(true);
		});
	});

	describe("built-in tracking", () => {
		test("should track built-in plugins", async () => {
			const plugin = createMockPlugin("builtin");
			await registry.register(plugin, { builtIn: true });

			const info = registry.listPlugins().find((p) => p.type === "builtin");
			expect(info?.isBuiltIn).toBe(true);
		});

		test("should not mark regular plugins as built-in", async () => {
			const plugin = createMockPlugin("regular");
			await registry.register(plugin);

			const info = registry.listPlugins().find((p) => p.type === "regular");
			expect(info?.isBuiltIn).toBe(false);
		});
	});

	describe("size", () => {
		test("should return number of registered plugins", async () => {
			expect(registry.size).toBe(0);

			await registry.register(createMockPlugin("a"));
			expect(registry.size).toBe(1);

			await registry.register(createMockPlugin("b"));
			expect(registry.size).toBe(2);

			await registry.unregister("a");
			expect(registry.size).toBe(1);
		});
	});
});
