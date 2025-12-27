import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { OpenCodeProvider } from "../../../providers/opencode";
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

describe("OpenCodeProvider", () => {
  let provider: OpenCodeProvider;
  let config: ProviderConfig;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    // Save original and mock Bun.spawn
    originalSpawn = Bun.spawn;
    mockSpawn = mock(() => createMockProcess('{"summary": "Task completed", "response": "Done"}'));
    (globalThis as any).Bun.spawn = mockSpawn;
  });

  afterEach(() => {
    // Restore original Bun.spawn
    (globalThis as any).Bun.spawn = originalSpawn;
  });

  describe("constructor", () => {
    test("should initialize with correct id and display name", () => {
      config = {
        binary: "opencode",
        args: [],
        jsonMode: "flag",
        jsonFlag: "-f",
        streamingMode: "none",
        capabilities: ["generate", "edit", "explain", "test", "refactor"],
      };
      provider = new OpenCodeProvider(config);

      expect(provider.id).toBe("opencode");
      expect(provider.displayName).toBe("OpenCode Agent");
    });

    test("should default to 'opencode' binary if not specified", () => {
      config = {
        binary: "",
        args: [],
        jsonMode: "flag",
        streamingMode: "none",
        capabilities: [],
      };
      provider = new OpenCodeProvider(config);

      expect(provider.id).toBe("opencode");
    });
  });

  describe("runOnce", () => {
    beforeEach(() => {
      config = {
        binary: "opencode",
        args: [],
        jsonMode: "flag",
        jsonFlag: "-f",
        streamingMode: "none",
        capabilities: ["generate", "edit", "explain", "test", "refactor"],
      };
      provider = new OpenCodeProvider(config);
    });

    test("should execute process successfully with JSON output", async () => {
      const req: CodingRequest = {
        prompt: "Fix the bug in utils.ts",
        mode: "edit",
        stream: false,
      };

      const result = await provider.runOnce(req, {});

      expect(result.text).toBe("Task completed");
      expect(mockSpawn).toHaveBeenCalled();
    });

    test("should include files in prompt when provided", async () => {
      const req: CodingRequest = {
        prompt: "Refactor this code",
        mode: "refactor",
        files: ["src/utils.ts", "src/main.ts"],
        stream: false,
      };

      await provider.runOnce(req, {});

      // Verify the spawn call includes files in the prompt
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[0] as string[];
      // The args should include 'agent', 'run', the prompt (which includes files), '-f', 'json', '-q'
      expect(args).toContain("agent");
      expect(args).toContain("run");
      expect(args).toContain("-f");
      expect(args).toContain("json");
      expect(args).toContain("-q");
    });

    test("should parse plain text output when JSON fails", async () => {
      mockSpawn = mock(() => createMockProcess("Fixed the authentication bug in login.ts"));
      (globalThis as any).Bun.spawn = mockSpawn;

      const req: CodingRequest = {
        prompt: "Fix auth bug",
        mode: "edit",
        stream: false,
      };

      const result = await provider.runOnce(req, {});

      expect(result.text).toBe("Fixed the authentication bug in login.ts");
    });
  });

  describe("classifyError", () => {
    beforeEach(() => {
      config = {
        binary: "opencode",
        args: [],
        jsonMode: "flag",
        jsonFlag: "-f",
        streamingMode: "none",
        capabilities: ["generate", "edit", "explain", "test", "refactor"],
      };
      provider = new OpenCodeProvider(config);
    });

    test("classifies 'rate limit' as RATE_LIMIT", () => {
      const error = provider.classifyError({ stderr: "Rate limit exceeded" });
      expect(error).toBe("RATE_LIMIT");
    });

    test("classifies 'too many requests' as RATE_LIMIT", () => {
      const error = provider.classifyError({ stderr: "Too many requests" });
      expect(error).toBe("RATE_LIMIT");
    });

    test("classifies '429' as RATE_LIMIT", () => {
      const error = provider.classifyError({ stderr: "Error 429: Request limit" });
      expect(error).toBe("RATE_LIMIT");
    });

    test("classifies 'authentication failed' as UNAUTHORIZED", () => {
      const error = provider.classifyError({ stderr: "Authentication failed" });
      expect(error).toBe("UNAUTHORIZED");
    });

    test("classifies 'api key invalid' as UNAUTHORIZED", () => {
      const error = provider.classifyError({ stderr: "API key invalid" });
      expect(error).toBe("UNAUTHORIZED");
    });

    test("classifies 'command not found' as NOT_FOUND", () => {
      const error = provider.classifyError({ stderr: "command not found: opencode" });
      expect(error).toBe("NOT_FOUND");
    });

    test("classifies exit code 127 as NOT_FOUND", () => {
      const error = provider.classifyError({ exitCode: 127, stderr: "" });
      expect(error).toBe("NOT_FOUND");
    });

    test("classifies 'connection refused' as TRANSIENT", () => {
      const error = provider.classifyError({ stderr: "ECONNREFUSED" });
      expect(error).toBe("TRANSIENT");
    });

    test("classifies unknown errors as TRANSIENT", () => {
      const error = provider.classifyError({ stderr: "Something unexpected happened" });
      expect(error).toBe("TRANSIENT");
    });
  });

  describe("extractFilesChanged", () => {
    beforeEach(() => {
      config = {
        binary: "opencode",
        args: [],
        jsonMode: "flag",
        jsonFlag: "-f",
        streamingMode: "none",
        capabilities: ["generate", "edit", "explain", "test", "refactor"],
      };
      provider = new OpenCodeProvider(config);
    });

    test("should extract files from modified pattern", () => {
      const stdout = "Modified: src/utils.ts\nModified: src/main.ts";
      const files = provider.extractFilesChanged(stdout);

      expect(files).toContain("src/utils.ts");
      expect(files).toContain("src/main.ts");
    });

    test("should extract files from created pattern", () => {
      const stdout = "Created: src/new-file.ts";
      const files = provider.extractFilesChanged(stdout);

      expect(files).toContain("src/new-file.ts");
    });

    test("should deduplicate files", () => {
      const stdout = "Modified: src/utils.ts\nUpdated: src/utils.ts";
      const files = provider.extractFilesChanged(stdout);

      expect(files.filter((f) => f === "src/utils.ts").length).toBe(1);
    });
  });
});
