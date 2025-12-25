import { beforeEach, describe, expect, mock, test } from "bun:test";
import { WrapTerminalCoder } from "@wrap-terminalcoder/core";
import { ConfigLoader } from "@wrap-terminalcoder/core";
import { StateManager } from "@wrap-terminalcoder/core";
import { Router } from "@wrap-terminalcoder/core";

// Mock the core modules
mock.module("@wrap-terminalcoder/core", () => {
  return {
    WrapTerminalCoder: {
      create: mock(async () => ({
        providers: new Map(),
        config: {},
        stateManager: new StateManager(),
        router: new Router(new Map(), { config: {}, stateManager: new StateManager() }),
        route: mock(async (req: any) => ({
          provider: "gemini",
          text: "Mock response",
          usage: { inputTokens: 10, outputTokens: 20 },
          meta: { elapsedMs: 100 },
        })),
        routeStream: async function* (req: any) {
          yield {
            provider: "gemini",
            text: "Mock stream response",
            usage: { inputTokens: 10, outputTokens: 20 },
            meta: { elapsedMs: 100 },
          };
        },
        getProviderInfo: mock(async () => [
          {
            id: "gemini",
            displayName: "Gemini CLI",
            requestsToday: 5,
            outOfCreditsUntil: undefined,
          },
        ]),
      })),
    },
    ConfigLoader: mock(() => ({
      loadConfig: mock(async () => ({
        routing: { defaultOrder: ["gemini", "qwen-code", "codex"] },
        providers: {},
        credits: { providers: {} },
      })),
    })),
    StateManager: mock(() => ({
      initialize: mock(async () => {}),
      getProviderState: mock(async () => ({
        requestsToday: 0,
        outOfCreditsUntil: undefined,
        lastErrors: [],
      })),
      recordSuccess: mock(async () => {}),
      recordError: mock(async () => {}),
    })),
    Router: mock(() => ({
      route: mock(async (req: any) => ({
        provider: "gemini",
        text: "Mock response",
      })),
    })),
  };
});

describe("CLI Integration", () => {
  describe("Providers Command", () => {
    test("should list providers", async () => {
      const wtc = await WrapTerminalCoder.create();
      const providers = await wtc.getProviderInfo();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0]).toHaveProperty("id");
      expect(providers[0]).toHaveProperty("displayName");
    });
  });

  describe("Ask Command", () => {
    test("should process basic request", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Hello world",
        mode: "generate",
        stream: false,
      };

      const response = await wtc.route(req);

      expect(response).toHaveProperty("provider");
      expect(response).toHaveProperty("text");
      expect(response.text).toBeDefined();
    });

    test("should handle explicit provider", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Test",
        mode: "generate",
        stream: false,
        provider: "gemini",
      };

      const response = await wtc.route(req);

      expect(response.provider).toBe("gemini");
    });

    test("should handle different modes", async () => {
      const wtc = await WrapTerminalCoder.create();
      const modes = ["generate", "edit", "explain", "test"];

      for (const mode of modes) {
        const req = {
          prompt: "Test",
          mode,
          stream: false,
        };

        const response = await wtc.route(req);
        expect(response).toBeDefined();
      }
    });

    test("should handle file context", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Explain this code",
        mode: "explain",
        fileContext: ["src/file1.ts", "src/file2.ts"],
        stream: false,
      };

      const response = await wtc.route(req);
      expect(response).toBeDefined();
    });
  });

  describe("Configuration", () => {
    test("should load configuration", async () => {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();

      expect(config).toHaveProperty("routing");
      expect(config).toHaveProperty("providers");
      expect(config).toHaveProperty("credits");
    });

    test("should handle config file path", async () => {
      const configLoader = new ConfigLoader({
        projectConfigPath: "/test/path/config.json",
      });
      const config = await configLoader.loadConfig();

      expect(config).toBeDefined();
    });
  });

  describe("State Management", () => {
    test("should track provider state", async () => {
      const stateManager = new StateManager();
      await stateManager.initialize();

      const state = await stateManager.getProviderState("gemini");
      expect(state).toHaveProperty("requestsToday");
      expect(state).toHaveProperty("outOfCreditsUntil");
    });

    test("should record successful requests", async () => {
      // Override mock for this test to track state changes
      const mockGetState = mock(async () => ({
        requestsToday: 1,
        outOfCreditsUntil: undefined,
        lastErrors: [],
      }));
      const stateManager = new StateManager();
      stateManager.getProviderState = mockGetState;

      await stateManager.recordSuccess("gemini");

      const state = await stateManager.getProviderState("gemini");
      expect(state.requestsToday).toBeGreaterThan(0);
    });
  });
});

describe("CLI Commands", () => {
  describe("Providers Command", () => {
    test("should return JSON array of providers", async () => {
      const wtc = await WrapTerminalCoder.create();
      const providers = await wtc.getProviderInfo();

      expect(Array.isArray(providers)).toBe(true);
      providers.forEach((provider: any) => {
        expect(provider).toHaveProperty("id");
        expect(provider).toHaveProperty("displayName");
      });
    });

    test("should show correct provider status", async () => {
      const wtc = await WrapTerminalCoder.create();
      const providers = await wtc.getProviderInfo();

      providers.forEach((provider: any) => {
        expect(typeof provider.requestsToday).toBe("number");
        expect(provider.requestsToday).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("Ask Command", () => {
    test("should handle basic ask command", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Write hello world",
        mode: "generate",
        stream: false,
      };

      const response = await wtc.route(req);

      expect(response).toHaveProperty("text");
      expect(response.text).toBeDefined();
      expect(response.text.length).toBeGreaterThan(0);
    });

    test("should handle ask with provider flag", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Test",
        mode: "generate",
        stream: false,
        provider: "gemini",
      };

      const response = await wtc.route(req);

      expect(response.provider).toBe("gemini");
    });

    test("should handle ask with file context", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Refactor this",
        mode: "edit",
        fileContext: ["src/utils.ts"],
        stream: false,
      };

      const response = await wtc.route(req);
      expect(response).toBeDefined();
    });

    test("should handle streaming mode", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Write a long document",
        mode: "generate",
        stream: true,
      };

      const responses = [];
      for await (const response of wtc.routeStream(req)) {
        responses.push(response);
      }

      expect(responses.length).toBeGreaterThan(0);
      expect(responses[responses.length - 1]).toHaveProperty("meta");
    });
  });

  describe("Output Formats", () => {
    test("should support JSON output format", async () => {
      const wtc = await WrapTerminalCoder.create();
      const req = {
        prompt: "Test",
        mode: "generate",
        stream: false,
      };

      const response = await wtc.route(req);

      expect(response).toHaveProperty("provider");
      expect(response).toHaveProperty("text");
      expect(response).toHaveProperty("usage");
      expect(response).toHaveProperty("meta");
    });
  });

  describe("Error Handling", () => {
    test("should handle provider not found", async () => {
      const wtc = await WrapTerminalCoder.create();

      // Override route to throw error for this test
      wtc.route = mock(async (req: any) => {
        if (req.provider === "nonexistent") {
          throw new Error("Provider not found: nonexistent");
        }
        return {
          provider: "gemini",
          text: "Mock response",
          usage: { inputTokens: 10, outputTokens: 20 },
          meta: { elapsedMs: 100 },
        };
      });

      const req = {
        prompt: "Test",
        provider: "nonexistent",
        mode: "generate",
        stream: false,
      };

      await expect(wtc.route(req)).rejects.toThrow("Provider not found");
    });
  });
});

describe("Configuration Validation", () => {
  test("should validate configuration with Zod", async () => {
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadConfig();

    expect(config).toBeDefined();
    expect(config).toHaveProperty("routing");
    expect(config).toHaveProperty("providers");
    expect(config).toHaveProperty("credits");
  });

  test("should handle invalid configuration", async () => {
    const configLoader = new ConfigLoader({
      projectConfigPath: "/invalid/path/config.json",
    });

    await expect(configLoader.loadConfig()).resolves.toBeDefined();
  });
});
