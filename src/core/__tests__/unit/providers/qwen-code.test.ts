import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QwenCodeProvider } from "../../../providers/qwen-code";
import type { CodingRequest, ProviderConfig } from "../../../types";

// Mock Bun.spawn for provider tests
const createMockProcess = (stdout: string, stderr = "", exitCode = 0) => {
  const encoder = new TextEncoder();
  const stdoutData = encoder.encode(stdout);
  const stderrData = encoder.encode(stderr);

  return {
    stdin: {
      write: mock(() => {}),
      end: mock(() => {}),
    },
    stdout: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (!read) {
              read = true;
              return { done: false, value: stdoutData };
            }
            return { done: true, value: undefined };
          },
          releaseLock: () => {},
        };
      },
    },
    stderr: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (!read && stderr) {
              read = true;
              return { done: false, value: stderrData };
            }
            return { done: true, value: undefined };
          },
          releaseLock: () => {},
        };
      },
    },
    exited: Promise.resolve(exitCode),
    kill: mock(() => {}),
  };
};

let mockSpawn: ReturnType<typeof mock>;

describe("QwenCodeProvider", () => {
  let provider: QwenCodeProvider;
  let config: ProviderConfig;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    // Save original and mock Bun.spawn
    originalSpawn = Bun.spawn;
    mockSpawn = mock(() => createMockProcess("test output"));
    (globalThis as any).Bun.spawn = mockSpawn;
  });

  afterEach(() => {
    // Restore original Bun.spawn
    (globalThis as any).Bun.spawn = originalSpawn;
  });

  describe("constructor", () => {
    test("should initialize with correct id and display name", () => {
      config = {
        binary: "qwen",
        args: [],
        jsonMode: "flag",
        jsonFlag: "--json",
        streamingMode: "jsonl",
        capabilities: ["generate", "edit", "explain", "test"],
      };
      provider = new QwenCodeProvider(config);

      expect(provider.id).toBe("qwen-code");
      expect(provider.displayName).toBe("Qwen Code CLI");
    });
  });

  describe("runOnce", () => {
    beforeEach(() => {
      config = {
        binary: "qwen",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate", "edit", "explain", "test"],
      };
      provider = new QwenCodeProvider(config);
    });

    test("should execute process successfully", async () => {
      const req: CodingRequest = {
        prompt: "Write hello world",
        mode: "generate",
        stream: false,
      };

      const result = await provider.runOnce(req, {});

      expect(result.text).toBe("test output");
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  describe("runStream", () => {
    beforeEach(() => {
      config = {
        binary: "qwen",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate", "edit", "explain", "test"],
      };
      provider = new QwenCodeProvider(config);
    });

    test("should stream process output successfully", async () => {
      const req: CodingRequest = {
        prompt: "Stream test",
        mode: "generate",
        stream: true,
      };

      const events = [];
      for await (const event of provider.runStream(req, {})) {
        events.push(event);
      }

      // Should have start, text_delta, and complete events
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0]).toEqual({
        type: "start",
        provider: "qwen-code",
        requestId: expect.any(String),
      });
      // Find text_delta event
      const deltaEvent = events.find((e: any) => e.type === "text_delta");
      expect(deltaEvent).toBeDefined();
      expect(deltaEvent.text).toBe("test output");
      // Last event should be complete
      expect(events[events.length - 1].type).toBe("complete");
    });
  });

  describe("classifyError", () => {
    beforeEach(() => {
      config = {
        binary: "qwen",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate", "edit", "explain", "test"],
      };
      provider = new QwenCodeProvider(config);
    });

    test("classifies 'quota exceeded' as OUT_OF_CREDITS", () => {
      const error = provider.classifyError({ stderr: "Quota exceeded" });
      expect(error).toBe("OUT_OF_CREDITS");
    });

    test("classifies 'rate limit' as RATE_LIMIT", () => {
      const error = provider.classifyError({ stderr: "Rate limit exceeded" });
      expect(error).toBe("RATE_LIMIT");
    });

    test("classifies '401 unauthorized' as UNAUTHORIZED", () => {
      const error = provider.classifyError({ stderr: "401 unauthorized" });
      expect(error).toBe("UNAUTHORIZED");
    });

    test("classifies '500 internal error' as INTERNAL", () => {
      const error = provider.classifyError({ stderr: "500 internal server error" });
      expect(error).toBe("INTERNAL");
    });

    test("classifies 'timeout' as TIMEOUT", () => {
      const error = provider.classifyError({ stderr: "Request timeout" });
      expect(error).toBe("TIMEOUT");
    });

    test("classifies unknown errors as TRANSIENT", () => {
      const error = provider.classifyError({ stderr: "Something unexpected happened" });
      expect(error).toBe("TRANSIENT");
    });
  });
});
