import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Provider } from "../../providers/index";
import { Router } from "../../router";
import type { StateManager } from "../../state";
import type { CodingRequest, ProviderErrorContext } from "../../types";
import type { Config } from "../../types";

// Mock Provider for testing
class MockProvider implements Provider {
  readonly id: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly prefersJson: boolean;
  readonly capabilities?: string[];

  private shouldFail = false;
  private shouldStream = false;
  private failWith: Error | null = null;

  constructor(id: string, displayName: string, supportsStreaming = false) {
    this.id = id;
    this.displayName = displayName;
    this.supportsStreaming = supportsStreaming;
    this.prefersJson = true;
    this.capabilities = ["generate", "edit", "explain", "test"];
  }

  setShouldFail(fail: boolean, error?: Error) {
    this.shouldFail = fail;
    this.failWith = error || new Error("Mock failure");
  }

  setShouldStream(stream: boolean) {
    this.shouldStream = stream;
  }

  async runOnce(req: CodingRequest, opts: any): Promise<{ text: string; usage?: any }> {
    if (this.shouldFail && this.failWith) {
      throw this.failWith;
    }
    return {
      text: `Response from ${this.id}`,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }

  async *runStream(req: CodingRequest, opts: any): AsyncGenerator<any> {
    if (this.shouldFail && this.failWith) {
      throw this.failWith;
    }

    yield { type: "start", provider: this.id, requestId: "req-123" };
    yield { type: "delta", text: `Stream from ${this.id}` };
    yield { type: "complete", provider: this.id, text: `Complete response from ${this.id}` };
  }

  classifyError(error: ProviderErrorContext): any {
    const stderr = error.stderr?.toLowerCase() || "";

    if (stderr.includes("rate limit")) return "RATE_LIMIT";
    if (stderr.includes("out of credits")) return "OUT_OF_CREDITS";
    if (stderr.includes("bad request")) return "BAD_REQUEST";
    if (stderr.includes("internal error")) return "INTERNAL";

    return "TRANSIENT";
  }

  getInfo() {
    return {
      id: this.id,
      displayName: this.displayName,
      supportsStreaming: this.supportsStreaming,
      prefersJson: this.prefersJson,
      capabilities: this.capabilities,
    };
  }
}

describe("Router", () => {
  let router: Router;
  let mockProviders: Map<string, MockProvider>;
  let mockStateManager: StateManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockProviders = new Map();

    mockStateManager = {
      getProviderState: mock(async (providerId: string) => ({
        requestsToday: 0,
        lastErrors: [],
        outOfCreditsUntil: undefined,
      })),
      recordSuccess: mock(async () => {}),
      recordError: mock(async () => {}),
      markOutOfCredits: mock(async () => {}),
      initialize: mock(async () => {}),
      resetProvider: mock(async () => {}),
      resetAll: mock(async () => {}),
      getState: mock(() => ({ version: "1.0.0", providers: {} })),
      getStatePath: mock(() => "/test/state.json"),
      save: mock(async () => {}),
    } as any;

    mockConfig = {
      routing: {
        defaultOrder: ["provider1", "provider2", "provider3"],
        perModeOverride: {
          test: ["provider2", "provider1"],
          explain: ["provider3", "provider2"],
        },
      },
      providers: {
        provider1: {
          binary: "binary1",
          args: [],
          jsonMode: "flag",
          jsonFlag: "--json",
          streamingMode: "line",
          capabilities: ["generate", "edit", "explain", "test"],
        },
        provider2: {
          binary: "binary2",
          args: [],
          jsonMode: "flag",
          jsonFlag: "--json",
          streamingMode: "line",
          capabilities: ["generate", "edit", "explain", "test"],
        },
        provider3: {
          binary: "binary3",
          args: [],
          jsonMode: "flag",
          jsonFlag: "--json",
          streamingMode: "line",
          capabilities: ["generate", "edit", "explain", "test"],
        },
      },
      credits: {
        providers: {
          provider1: { dailyRequestLimit: 100, resetHourUtc: 0 },
          provider2: { dailyRequestLimit: 200, resetHourUtc: 0 },
          provider3: { plan: "pro" },
        },
      },
    };

    // Set up mock providers
    const provider1 = new MockProvider("provider1", "Provider 1", true);
    const provider2 = new MockProvider("provider2", "Provider 2", true);
    const provider3 = new MockProvider("provider3", "Provider 3", false);

    mockProviders.set("provider1", provider1);
    mockProviders.set("provider2", provider2);
    mockProviders.set("provider3", provider3);

    router = new Router(mockProviders as any, {
      config: mockConfig,
      stateManager: mockStateManager,
    });
  });

  describe("route", () => {
    test("should route to first available provider on success", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider1");
      expect(response.text).toBe("Response from provider1");
      expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 20);
    });

    test("should use explicit provider when specified", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
        provider: "provider2",
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2");
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 20);
    });

    test("should skip to next provider when first fails with TRANSIENT error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Transient error"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2"); // Should skip provider1 and use provider2
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "TRANSIENT",
        "Transient error",
      );
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 20);
    });

    test("should mark provider as out of credits on OUT_OF_CREDITS error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Out of credits"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2");
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "OUT_OF_CREDITS",
        "Out of credits",
      );
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });

    test("should mark provider as out of credits on RATE_LIMIT error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Rate limit exceeded"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2");
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "RATE_LIMIT",
        "Rate limit exceeded",
      );
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });

    test("should throw immediately on BAD_REQUEST error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Bad request"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      await expect(router.route(req)).rejects.toThrow("Bad request to provider1");
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "BAD_REQUEST",
        "Bad request",
      );
    });

    test("should check daily request limits", async () => {
      // Mock state manager to return high request count
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: providerId === "provider1" ? 100 : 0, // provider1 at limit
        lastErrors: [],
        outOfCreditsUntil: undefined,
      }));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2"); // Should skip provider1 due to limit
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });

    test("should skip providers marked as out of credits", async () => {
      // Mock state manager to return out of credits for provider1
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: 0,
        lastErrors: [],
        outOfCreditsUntil:
          providerId === "provider1" ? new Date(Date.now() + 3600000).toISOString() : undefined,
      }));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2"); // Should skip provider1
    });

    test("should throw error when no providers available", async () => {
      // Create a new router with all providers out of credits
      const outOfCreditsStateManager = {
        ...mockStateManager,
        getProviderState: mock(async (providerId: string) => ({
          requestsToday: 0,
          lastErrors: [],
          outOfCreditsUntil: new Date(Date.now() + 3600000).toISOString(),
        })),
      } as any;

      const failingRouter = new Router(mockProviders as any, {
        config: mockConfig,
        stateManager: outOfCreditsStateManager,
      });

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      await expect(failingRouter.route(req)).rejects.toThrow(/All \d+ providers failed/);
    });

    test("should use per-mode override routing", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "test",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider2"); // test mode uses ["provider2", "provider1"]
    });

    test("should include timing metadata in response", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const response = await router.route(req);

      expect(response.meta?.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof response.meta?.elapsedMs).toBe("number");
    });

    test("should handle missing provider gracefully", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
        provider: "nonexistent",
      };

      await expect(router.route(req)).rejects.toThrow("Provider nonexistent not found");
    });
  });

  describe("routeStream", () => {
    test("should route streaming request to first available provider", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider1");
      expect(events[0].text).toBe("Complete response from provider1");
      // Mock runStream doesn't include usage data, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 0);
    });

    test("should handle streaming provider failure and fallback", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Stream failed"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should fallback to provider2
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "TRANSIENT",
        "Stream failed",
      );
      // Mock runStream doesn't include usage data, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 0);
    });

    test("should include timing metadata in streaming responses", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events[0].meta?.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof events[0].meta?.elapsedMs).toBe("number");
    });

    test("should handle streaming with intermediate events", async () => {
      // Override the mock provider to emit multiple streaming events
      const provider1 = mockProviders.get("provider1")!;
      provider1.runStream = async function* (req: CodingRequest, opts: any) {
        yield { type: "start", provider: this.id, requestId: "req-123" };
        yield { type: "delta", text: `First chunk from ${this.id}` };
        yield { type: "delta", text: `Second chunk from ${this.id}` };
        yield { type: "complete", provider: this.id, text: `Final response from ${this.id}` };
      };

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider1");
      expect(events[0].text).toBe("Final response from provider1");
      // No usage data in custom runStream, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 0);
    });

    test("should handle streaming error events", async () => {
      // Override the mock provider to emit error events
      const provider1 = mockProviders.get("provider1")!;
      provider1.runStream = async function* (req: CodingRequest, opts: any) {
        yield { type: "start", provider: this.id, requestId: "req-123" };
        yield { type: "delta", text: "First chunk" };
        yield {
          type: "error",
          provider: this.id,
          code: "TRANSIENT",
          message: "Temporary error",
        };
        yield { type: "complete", provider: this.id, text: "Final response" };
      };

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider1");
      expect(events[0].text).toBe("Final response");
      // No usage data in custom runStream, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 0);
    });

    test("should handle streaming provider failure with fallback to next provider", async () => {
      // Make provider1 fail during streaming
      const provider1 = mockProviders.get("provider1")!;
      provider1.runStream = async function* (req: CodingRequest, opts: any) {
        yield { type: "start", provider: this.id, requestId: "req-123" };
        yield { type: "delta", text: "First chunk" };
        throw new Error("Streaming error");
      };

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      // Should fallback to provider2 (which uses default mock with no usage)
      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2");
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "TRANSIENT",
        "Streaming error",
      );
      // Mock runStream doesn't include usage data, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 0);
    });

    test("should handle streaming with different streaming modes", async () => {
      // Test with line mode
      const provider1 = mockProviders.get("provider1")!;
      provider1.runStream = async function* (req: CodingRequest, opts: any) {
        yield { type: "start", provider: this.id, requestId: "req-123" };
        yield { type: "chunk", text: "Line 1\n" };
        yield { type: "chunk", text: "Line 2\n" };
        yield { type: "chunk", text: "Line 3\n" };
        yield { type: "complete", provider: this.id, text: "Line 1\nLine 2\nLine 3\n" };
      };

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider1");
      expect(events[0].text).toBe("Line 1\nLine 2\nLine 3\n");
      // No usage data in custom runStream, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 0);
    });

    test("should handle streaming with usage data", async () => {
      // Override the mock provider to include usage data
      const provider1 = mockProviders.get("provider1")!;
      provider1.runStream = async function* (req: CodingRequest, opts: any) {
        yield { type: "start", provider: this.id, requestId: "req-123" };
        yield { type: "delta", text: "Response chunk" };
        yield {
          type: "complete",
          provider: this.id,
          text: "Complete response",
          usage: { inputTokens: 15, outputTokens: 25 },
        };
      };

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider1");
      expect(events[0].text).toBe("Complete response");
      expect(events[0].usage).toEqual({ inputTokens: 15, outputTokens: 25 });
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider1", 25);
    });

    test("should handle streaming with explicit provider", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
        provider: "provider2",
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2");
      expect(events[0].text).toBe("Complete response from provider2");
      // Mock runStream doesn't include usage data, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 0);
    });

    test("should handle streaming with per-mode override", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "test", // Uses ["provider2", "provider1"] override
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should use provider2 first due to override
      expect(events[0].text).toBe("Complete response from provider2");
      // Mock runStream doesn't include usage data, so tokens will be 0
      expect(mockStateManager.recordSuccess).toHaveBeenCalledWith("provider2", 0);
    });

    test("should handle streaming with out of credits provider", async () => {
      // Mock state manager to return out of credits for provider1
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: 0,
        lastErrors: [],
        outOfCreditsUntil:
          providerId === "provider1" ? new Date(Date.now() + 3600000).toISOString() : undefined,
      }));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should skip provider1
      expect(events[0].text).toBe("Complete response from provider2");
    });

    test("should handle streaming with daily request limit exceeded", async () => {
      // Mock state manager to return high request count for provider1
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: providerId === "provider1" ? 100 : 0, // provider1 at limit
        lastErrors: [],
        outOfCreditsUntil: undefined,
      }));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should skip provider1 due to limit
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });

    test("should handle streaming with all providers failing", async () => {
      // Make all providers fail
      const provider1 = mockProviders.get("provider1")!;
      const provider2 = mockProviders.get("provider2")!;
      const provider3 = mockProviders.get("provider3")!;

      provider1.setShouldFail(true, new Error("Provider1 failed"));
      provider2.setShouldFail(true, new Error("Provider2 failed"));
      provider3.setShouldFail(true, new Error("Provider3 failed"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      // Collect all events from the async iterator
      const collectEvents = async () => {
        const events: any[] = [];
        for await (const event of router.routeStream(req)) {
          events.push(event);
        }
        return events;
      };

      await expect(collectEvents()).rejects.toThrow(/All \d+ providers failed/);

      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "TRANSIENT",
        "Provider1 failed",
      );
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider2",
        "TRANSIENT",
        "Provider2 failed",
      );
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider3",
        "TRANSIENT",
        "Provider3 failed",
      );
    });

    test("should handle streaming with bad request error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Bad request"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      // Collect all events from the async iterator
      const collectEvents = async () => {
        const events: any[] = [];
        for await (const event of router.routeStream(req)) {
          events.push(event);
        }
        return events;
      };

      await expect(collectEvents()).rejects.toThrow("Bad request to provider1");

      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "BAD_REQUEST",
        "Bad request",
      );
    });

    test("should handle streaming with rate limit error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Rate limit exceeded"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should fallback to provider2
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "RATE_LIMIT",
        "Rate limit exceeded",
      );
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });

    test("should handle streaming with bad request error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Bad request"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      // Collect all events from the async iterator
      const collectEvents = async () => {
        const events: any[] = [];
        for await (const event of router.routeStream(req)) {
          events.push(event);
        }
        return events;
      };

      await expect(collectEvents()).rejects.toThrow("Bad request to provider1");

      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "BAD_REQUEST",
        "Bad request",
      );
    });

    test("should handle streaming with out of credits error", async () => {
      const provider1 = mockProviders.get("provider1")!;
      provider1.setShouldFail(true, new Error("Out of credits"));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: true,
      };

      const events: any[] = [];
      for await (const event of router.routeStream(req)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe("provider2"); // Should fallback to provider2
      expect(mockStateManager.recordError).toHaveBeenCalledWith(
        "provider1",
        "OUT_OF_CREDITS",
        "Out of credits",
      );
      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });
  });

  describe("getProviderInfo", () => {
    test("should return information for all providers", async () => {
      const info = await (router as any).getProviderInfo();

      expect(info).toHaveLength(3);
      expect(info.map((i: any) => i.id)).toEqual(["provider1", "provider2", "provider3"]);

      const provider1Info = info.find((i: any) => i.id === "provider1");
      expect(provider1Info?.id).toBe("provider1");
      expect(provider1Info?.displayName).toBe("Provider 1");
      expect(provider1Info?.requestsToday).toBe(0);
      expect(provider1Info?.outOfCreditsUntil).toBeUndefined();
    });

    test("should include outOfCreditsUntil in provider info", async () => {
      // Mock state manager to return out of credits for provider1
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: 0,
        lastErrors: [],
        outOfCreditsUntil:
          providerId === "provider1" ? new Date(Date.now() + 3600000).toISOString() : undefined,
      }));

      const info = await (router as any).getProviderInfo();

      const provider1Info = info.find((i: any) => i.id === "provider1");
      expect(provider1Info?.outOfCreditsUntil).toBeInstanceOf(Date);
    });
  });

  describe("Error Classification", () => {
    test("should handle different error types correctly", async () => {
      const testCases = [
        { error: "Rate limit exceeded", expected: "RATE_LIMIT" },
        { error: "Out of credits", expected: "OUT_OF_CREDITS" },
        { error: "Bad request", expected: "BAD_REQUEST" },
        { error: "Internal server error", expected: "TRANSIENT" },
        { error: "Unknown error", expected: "TRANSIENT" },
      ];

      for (const { error, expected } of testCases) {
        // Clear previous calls
        (mockStateManager.recordError as any).mockClear();

        const provider1 = mockProviders.get("provider1")!;
        provider1.setShouldFail(true, new Error(error));

        const req: CodingRequest = {
          prompt: "Test prompt",
          mode: "generate",
          stream: false,
        };

        try {
          await router.route(req);
        } catch {
          // Expected to fail
        }

        expect(mockStateManager.recordError).toHaveBeenCalledWith("provider1", expected, error);
      }
    });
  });

  describe("Configuration Integration", () => {
    test("should respect daily request limits", async () => {
      // Mock state manager to return high request count for provider1
      mockStateManager.getProviderState = mock(async (providerId: string) => ({
        requestsToday: providerId === "provider1" ? 100 : 0,
        lastErrors: [],
        outOfCreditsUntil: undefined,
      }));

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      await router.route(req);

      expect(mockStateManager.markOutOfCredits).toHaveBeenCalledWith("provider1", expect.any(Date));
    });
  });

  describe("Edge Cases", () => {
    test("should handle request with null undefined mode", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: undefined as any,
        stream: false,
      };

      const response = await router.route(req);

      expect(response.provider).toBe("provider1"); // Should use default order
    });

    test("should handle multiple concurrent requests", async () => {
      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const promises = Array(5)
        .fill(null)
        .map(() => router.route(req));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(5);
      responses.forEach((response) => {
        expect(response).toBeDefined();
        expect(response.provider).toBe("provider1");
      });
    });

    test("should handle request with AbortSignal", async () => {
      const abortController = new AbortController();

      const req: CodingRequest = {
        prompt: "Test prompt",
        mode: "generate",
        stream: false,
      };

      const routePromise = router.route(req, { signal: abortController.signal });

      // Abort immediately
      abortController.abort();

      // Should not reject since the mock doesn't handle abort signals
      const response = await routePromise;
      expect(response.provider).toBe("provider1");
    });
  });
});
