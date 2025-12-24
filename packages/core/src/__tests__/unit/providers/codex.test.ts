import { describe, test, expect, beforeEach, mock } from "bun:test";
import { CodexProvider } from "../../../providers/codex";
import type { CodingRequest, ProviderConfig } from "../../../types";

// Mock child_process
const mockSpawn = mock(() => {
  let stdoutHandler: Function | null = null;
  let closeHandler: Function | null = null;

  const mockProcess = {
    stdout: {
      on: mock((event: string, handler: Function) => {
        if (event === "data") stdoutHandler = handler;
      }),
      [Symbol.asyncIterator]: mock(async function* () {
        yield Buffer.from("test output");
      }),
    },
    stderr: {
      on: mock(),
      [Symbol.asyncIterator]: mock(async function* () {
        yield Buffer.from("");
      }),
    },
    on: mock((event: string, handler: Function) => {
      if (event === "close") closeHandler = handler;
    }),
    kill: mock(),
  };

  // Simulate process completion
  setTimeout(() => {
    if (stdoutHandler) stdoutHandler(Buffer.from("test output"));
    if (closeHandler) closeHandler(0);
  }, 1);

  return mockProcess;
});

mock.module("node:child_process", () => ({
  spawn: mockSpawn,
}));

mock.module("node:child_process", () => ({
  spawn: mockSpawn,
}));

describe("CodexProvider", () => {
  let provider: CodexProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    mockSpawn.mockClear();
  });

  describe("with cdx binary", () => {
    beforeEach(() => {
      config = {
        binary: "cdx",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate", "edit", "test"],
      };
      provider = new CodexProvider(config);
    });

    describe("buildArgs", () => {
      test("uses positional prompt format with cdx", () => {
        const req: CodingRequest = {
          prompt: "Write hello world",
          mode: "generate",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args[0]).toBe("Write hello world");
      });

      test("adds --explain flag for explain mode", () => {
        const req: CodingRequest = {
          prompt: "Explain this code",
          mode: "explain",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args).toContain("--explain");
      });

      test("adds --test flag for test mode", () => {
        const req: CodingRequest = {
          prompt: "Create unit tests",
          mode: "test",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args).toContain("--test");
      });

      test("adds --edit flag for edit mode", () => {
        const req: CodingRequest = {
          prompt: "Refactor this code",
          mode: "edit",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args).toContain("--edit");
      });

      test("adds --file flags for file context", () => {
        const req: CodingRequest = {
          prompt: "Analyze these files",
          mode: "explain",
          fileContext: ["src/file1.ts", "src/file2.ts"],
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args).toContain("--file");
        expect(args).toContain("src/file1.ts");
        expect(args).toContain("src/file2.ts");
      });

      test("includes config args", () => {
        config.args = ["--model", "gpt-4"];
        provider = new CodexProvider(config);

        const req: CodingRequest = {
          prompt: "Test",
          mode: "generate",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args).toContain("--model");
        expect(args).toContain("gpt-4");
      });
    });

    describe("runOnce", () => {
      test("should execute process successfully with cdx binary", async () => {
        const req: CodingRequest = {
          prompt: "Write hello world",
          mode: "generate",
          stream: false,
        };

        const result = await provider.runOnce(req, {});

        expect(result.text).toBe("test output");
        expect(mockSpawn).toHaveBeenCalledWith("cdx", ["Write hello world"], {
          cwd: undefined,
          env: process.env,
        });
      });
    });

    describe("runStream", () => {
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

        // Should have start, delta, and complete events
        expect(events).toHaveLength(3);
        expect(events[0]).toEqual({
          type: "start",
          provider: "codex",
          requestId: expect.any(String),
        });
        expect(events[1]).toEqual({
          type: "delta",
          text: "test output",
        });
        expect(events[2]).toEqual({
          type: "complete",
          provider: "codex",
          text: "",
        });
      });
    });
  });

  describe("with codex binary", () => {
    beforeEach(() => {
      config = {
        binary: "codex",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate", "edit", "test"],
      };
      provider = new CodexProvider(config);
    });

    describe("buildArgs", () => {
      test("uses -p flag for prompt with codex binary", () => {
        const req: CodingRequest = {
          prompt: "Write code",
          mode: "generate",
          stream: false,
        };

        const args = provider["buildArgs"](req, {});

        expect(args[0]).toBe("-p");
        expect(args[1]).toBe("Write code");
      });
    });

    describe("runOnce", () => {
      test("should execute process with codex binary", async () => {
        const req: CodingRequest = {
          prompt: "Write code",
          mode: "generate",
          stream: false,
        };

        const result = await provider.runOnce(req, {});

        expect(result.text).toBe("test output");
        expect(mockSpawn).toHaveBeenCalledWith("codex", ["-p", "Write code"], {
          cwd: undefined,
          env: process.env,
        });
      });
    });
  });

  describe("classifyError", () => {
    test("classifies 'plan limit' as OUT_OF_CREDITS", () => {
      const error = provider.classifyError({ stderr: "You've hit your plan limit" });
      expect(error).toBe("OUT_OF_CREDITS");
    });

    test("classifies 'rate limit' as RATE_LIMIT", () => {
      const error = provider.classifyError({ stderr: "Rate limit exceeded" });
      expect(error).toBe("RATE_LIMIT");
    });

    test("classifies '401 unauthorized' as BAD_REQUEST", () => {
      const error = provider.classifyError({ stderr: "401 unauthorized" });
      expect(error).toBe("BAD_REQUEST");
    });

    test("classifies '500 internal error' as INTERNAL", () => {
      const error = provider.classifyError({ stderr: "500 internal server error" });
      expect(error).toBe("INTERNAL");
    });

    test("classifies 'network timeout' as TRANSIENT", () => {
      const error = provider.classifyError({ stderr: "Network timeout" });
      expect(error).toBe("TRANSIENT");
    });

    test("classifies unknown errors as TRANSIENT", () => {
      const error = provider.classifyError({ stderr: "Something unexpected happened" });
      expect(error).toBe("TRANSIENT");
    });
  });
});
