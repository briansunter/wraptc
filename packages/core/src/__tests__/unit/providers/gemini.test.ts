import { describe, test, expect, beforeEach, mock } from "bun:test";
import { GeminiProvider } from "../../../providers/gemini";
import type { CodingRequest, ProviderConfig } from "../../../types";

// Mock child_process at the module level
const mockSpawn = mock();
mock.module("node:child_process", () => ({
  spawn: mockSpawn,
}));

describe("GeminiProvider", () => {
  let provider: GeminiProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    mockSpawn.mockClear();
    config = {
      binary: "gemini",
      args: [],
      jsonMode: "flag",
      jsonFlag: "--output-format",
      streamingMode: "jsonl",
      capabilities: ["generate", "edit", "explain", "test"],
    };
    provider = new GeminiProvider(config);
  });

  describe("constructor", () => {
    test("should initialize with correct id and display name", () => {
      expect(provider.id).toBe("gemini");
      expect(provider.displayName).toBe("Gemini CLI");
      expect(provider.config).toBe(config);
    });

    test("should set binary path from config", () => {
      const customBinaryConfig = { ...config, binary: "/custom/gemini" };
      const customProvider = new GeminiProvider(customBinaryConfig);
      expect(customProvider["binaryPath"]).toBe("/custom/gemini");
    });

    test("should set default binary if not provided", () => {
      const defaultConfig = { ...config, binary: "" };
      const defaultProvider = new GeminiProvider(defaultConfig);
      expect(defaultProvider["binaryPath"]).toBe("gemini");
    });
  });

  describe("runOnce", () => {
    test("should handle successful execution", async () => {
      const req: CodingRequest = {
        prompt: "Write a function",
        stream: false,
      };

      // Mock the process
      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: {
          on: mock((event: string, handler: Function) => {
            if (event === "data") {
              setTimeout(() => handler(Buffer.from("function hello() { return 'world'; }")), 0);
            }
          })
        },
        stderr: {
          on: mock((event: string, handler: Function) => {
            if (event === "data") {
              // No error
            }
          })
        },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.runOnce(req, {});
      expect(result.text).toBe("function hello() { return 'world'; }");
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe("gemini");
      expect(spawnCall[1]).toEqual(["--output-format"]);
    });

    test("should handle JSON output", async () => {
      const req: CodingRequest = {
        prompt: "Write a function",
        stream: false,
      };

      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: {
          on: mock((event: string, handler: Function) => {
            if (event === "data") {
              setTimeout(() => handler(Buffer.from('{"text": "function test() {}", "usage": {"inputTokens": 10}}')), 0);
            }
          })
        },
        stderr: { on: mock() },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.runOnce(req, {});
      expect(result.text).toBe("function test() {}");
      expect(result.usage).toEqual({ inputTokens: 10 });
    });

    test("should handle non-zero exit code", async () => {
      const req: CodingRequest = {
        prompt: "Write a function",
        stream: false,
      };

      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: { on: mock() },
        stderr: {
          on: mock((event: string, handler: Function) => {
            if (event === "data") {
              setTimeout(() => handler(Buffer.from("API key invalid")), 0);
            }
          })
        },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(1), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      await expect(provider.runOnce(req, {})).rejects.toThrow("Gemini CLI failed with code 1: API key invalid");
    });

    test("should handle stdin input", async () => {
      let inputData = "";
      const req: CodingRequest = {
        prompt: "Test prompt",
        stream: false,
      };

      const mockProcess = {
        stdin: {
          write: mock((data: string) => { inputData = data; }),
          end: mock()
        },
        stdout: { on: mock() },
        stderr: { on: mock() },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      await provider.runOnce(req, {});
      expect(inputData).toBe("Test prompt");
    });

    test("should handle abort signal", async () => {
      const req: CodingRequest = {
        prompt: "Write a function",
        stream: false,
      };

      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: { on: mock() },
        stderr: { on: mock() },
        on: mock(),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const abortController = new AbortController();
      const resultPromise = provider.runOnce(req, { signal: abortController.signal });

      abortController.abort();

      await expect(resultPromise).rejects.toThrow("Aborted");
    });
  });

  describe("runStream", () => {
    test("should yield streaming events", async () => {
      const req: CodingRequest = {
        prompt: "Write a long function",
        stream: true,
      };

      const mockStdout = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('{"chunk": "part1"}');
          yield Buffer.from('\n{"chunk": "part2"}');
          yield Buffer.from('\ninvalid json');
          yield Buffer.from('\n');
        },
      };

      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: mockStdout,
        stderr: {
          [Symbol.asyncIterator]: async function* () {
            // No stderr
          },
        },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const events = [];
      for await (const event of provider.runStream(req, {})) {
        events.push(event);
      }

      expect(events).toHaveLength(5); // start + 2 chunks + 1 delta + complete
      expect(events[0].type).toBe("start");
      expect(events[1].type).toBe("chunk");
      expect(events[2].type).toBe("chunk");
      expect(events[3].type).toBe("delta");
      expect(events[4].type).toBe("complete");
    });

    test("should handle JSONL streaming mode", async () => {
      const req: CodingRequest = {
        prompt: "Test",
        stream: true,
      };

      const mockStdout = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('{"response": "Hello"}');
          yield Buffer.from('\n{"response": "World"}');
        },
      };

      const mockProcess = {
        stdin: { write: mock(), end: mock() },
        stdout: mockStdout,
        stderr: {
          [Symbol.asyncIterator]: async function* () {},
        },
        on: mock((event: string, handler: Function) => {
          if (event === "close") {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: mock(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const events = [];
      for await (const event of provider.runStream(req, {})) {
        events.push(event);
      }

      const chunkEvents = events.filter(e => e.type === "chunk");
      expect(chunkEvents).toHaveLength(2);
      expect(JSON.parse(chunkEvents[0].text)).toEqual({ response: "Hello" });
      expect(JSON.parse(chunkEvents[1].text)).toEqual({ response: "World" });
    });
  });

  describe("classifyError", () => {
    test("should classify OUT_OF_CREDITS errors", () => {
      const errors = [
        "quota exceeded",
        "out of quota",
        "QUOTA EXCEEDED",
        "You've exceeded your quota"
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("OUT_OF_CREDITS");
      }
    });

    test("should classify RATE_LIMIT errors", () => {
      const errors = [
        "rate limit exceeded",
        "Rate limit exceeded",
        "429",
        "too many requests"
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("RATE_LIMIT");
      }
    });

    test("should classify BAD_REQUEST errors", () => {
      const errors = [
        "400",
        "Bad request",
        "bad request",
        "invalid request"
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("BAD_REQUEST");
      }
    });

    test("should classify INTERNAL errors", () => {
      const errors = [
        "500",
        "Internal server error",
        "internal error",
        "server error"
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("INTERNAL");
      }
    });

    test("should classify TRANSIENT as default", () => {
      const errors = [
        "network timeout",
        "connection failed",
        "unexpected error",
        "unknown error"
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("TRANSIENT");
      }
    });

    test("should combine stdout and stderr for classification", () => {
      const result = provider.classifyError({
        stderr: "some stderr",
        stdout: "rate limit exceeded"
      });

      expect(result).toBe("RATE_LIMIT");
    });

    test("should handle empty error context", () => {
      const result = provider.classifyError({});
      expect(result).toBe("TRANSIENT");
    });
  });

  describe("getInfo", () => {
    test("should return provider information", () => {
      const info = provider.getInfo();

      expect(info).toEqual({
        id: "gemini",
        displayName: "Gemini CLI",
        supportsStreaming: true,
        prefersJson: true,
        capabilities: ["generate", "edit", "explain", "test"],
      });
    });

    test("should handle different streaming modes", () => {
      const noStreamConfig = { ...config, streamingMode: "none" as const };
      const noStreamProvider = new GeminiProvider(noStreamConfig);

      const info = noStreamProvider.getInfo();
      expect(info.supportsStreaming).toBe(false);
    });

    test("should handle different JSON modes", () => {
      const noJsonConfig = { ...config, jsonMode: "none" as const };
      const noJsonProvider = new GeminiProvider(noJsonConfig);

      const info = noJsonProvider.getInfo();
      expect(info.prefersJson).toBe(false);
    });
  });
});
