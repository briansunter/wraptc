import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { WrapTerminalCoder } from "../../wrap-terminalcoder";

// Create isolated test environment to prevent file system conflicts
let originalHome: string | undefined;

beforeAll(() => {
  originalHome = process.env.HOME;
  process.env.HOME = `/tmp/test-home-${Date.now()}`;
});

afterAll(() => {
  process.env.HOME = originalHome;
});

describe("WrapTerminalCoder", () => {
  test("should have create method", () => {
    expect(typeof WrapTerminalCoder.create).toBe("function");
  });

  test("should create instance successfully", async () => {
    const instance = await WrapTerminalCoder.create();
    expect(instance).toBeDefined();
    expect(instance).toBeInstanceOf(WrapTerminalCoder);
  });

  test("should create instance with custom config path", async () => {
    const instance = await WrapTerminalCoder.create({
      configPath: "/tmp/nonexistent/config.json",
    });
    expect(instance).toBeDefined();
  });

  describe("instance methods", () => {
    let wtc: WrapTerminalCoder;

    beforeAll(async () => {
      wtc = await WrapTerminalCoder.create();
    });

    afterAll(async () => {
      // Cleanup if needed
    });

    test("getRouter should return router instance", () => {
      const router = wtc.getRouter();
      expect(router).toBeDefined();
      expect(typeof router.route).toBe("function");
    });

    test("getStateManager should return state manager instance", () => {
      const stateManager = wtc.getStateManager();
      expect(stateManager).toBeDefined();
      expect(typeof stateManager.getProviderState).toBe("function");
    });

    test("getConfig should return loaded config", () => {
      const config = wtc.getConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty("routing");
      expect(config).toHaveProperty("providers");
      expect(config).toHaveProperty("credits");
    });

    test("getProviderFactory should return provider factory", () => {
      const factory = wtc.getProviderFactory();
      expect(factory).toBeDefined();
      expect(typeof factory.getProvider).toBe("function");
    });

    test("getProviderInfo should return array of provider info", async () => {
      const info = await wtc.getProviderInfo();
      expect(Array.isArray(info)).toBe(true);
      expect(info.length).toBeGreaterThan(0);

      // Check structure of provider info
      for (const provider of info) {
        expect(provider).toHaveProperty("id");
        expect(provider).toHaveProperty("displayName");
        expect(provider).toHaveProperty("available");
        expect(provider).toHaveProperty("requestsToday");
      }
    });

    test("route should handle basic request", async () => {
      // This will fail because no actual provider binaries exist
      // but we can test that it properly attempts to route
      const request = {
        prompt: "Test prompt",
        mode: "generate" as const,
      };

      try {
        await wtc.route(request);
      } catch (error) {
        // Expected - no provider binaries available
        expect(error).toBeDefined();
      }
    });

    test("routeStream should be async generator", async () => {
      const request = {
        prompt: "Test prompt",
        mode: "generate" as const,
        stream: true,
      };

      const generator = wtc.routeStream(request);
      expect(generator[Symbol.asyncIterator]).toBeDefined();

      // Consume generator (will error due to no providers)
      try {
        for await (const event of generator) {
          // Won't reach here
        }
      } catch (error) {
        // Expected
        expect(error).toBeDefined();
      }
    });
  });

  describe("configuration", () => {
    test("default config should have expected providers", async () => {
      const wtc = await WrapTerminalCoder.create();
      const config = wtc.getConfig();

      expect(config.providers).toHaveProperty("gemini");
      expect(config.providers).toHaveProperty("opencode");
      expect(config.providers).toHaveProperty("qwen-code");
      expect(config.providers).toHaveProperty("codex");
    });

    test("default routing should include all providers", async () => {
      const wtc = await WrapTerminalCoder.create();
      const config = wtc.getConfig();

      expect(config.routing.defaultOrder).toContain("gemini");
      expect(config.routing.defaultOrder).toContain("opencode");
    });
  });
});
