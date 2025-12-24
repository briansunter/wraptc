import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ConfigurableProvider, createConfigurableProvider } from "../../../providers/configurable";
import { defineProvider } from "../../../define-provider";
import type { CodingRequest, ProviderDefinition } from "../../../types";

// Mock Bun.spawn for provider tests
const createMockProcess = (stdout: string, stderr: string = "", exitCode: number = 0) => {
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
let originalSpawn: typeof Bun.spawn;

describe("ConfigurableProvider - Phase 2 Features", () => {
  beforeEach(() => {
    originalSpawn = Bun.spawn;
    mockSpawn = mock(() => createMockProcess("test output"));
    (globalThis as any).Bun.spawn = mockSpawn;
  });

  afterEach(() => {
    (globalThis as any).Bun.spawn = originalSpawn;
  });

  describe("buildArgs with subcommand", () => {
    test("should prepend subcommand to arguments", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        subcommand: "exec",
        input: { method: "positional" },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello world", stream: false };

      await provider.runOnce(req, {});

      expect(mockSpawn).toHaveBeenCalled();
      const spawnArgs = mockSpawn.mock.calls[0][0];
      expect(spawnArgs[0]).toBe("test-cli");
      expect(spawnArgs[1]).toBe("exec"); // subcommand should be first
      expect(spawnArgs).toContain("Hello world");
    });
  });

  describe("buildArgs with system prompt", () => {
    test("should add system prompt flag when configured", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        args: {
          systemPromptFlag: "--system",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = {
        prompt: "Hello world",
        systemPrompt: "You are a helpful assistant",
        stream: false,
      };

      await provider.runOnce(req, {});

      const spawnArgs = mockSpawn.mock.calls[0][0];
      expect(spawnArgs).toContain("--system");
      expect(spawnArgs).toContain("You are a helpful assistant");
    });

    test("should combine system prompt with main prompt when method is combined", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        args: {
          systemPromptMethod: "combined",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = {
        prompt: "Hello world",
        systemPrompt: "You are a helpful assistant",
        stream: false,
      };

      await provider.runOnce(req, {});

      const spawnArgs = mockSpawn.mock.calls[0][0];
      // Should contain combined prompt
      expect(spawnArgs.some((arg: string) =>
        arg.includes("You are a helpful assistant") && arg.includes("Hello world")
      )).toBe(true);
    });
  });

  describe("buildArgs with request parameters", () => {
    test("should add maxTokens flag when configured", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        args: {
          maxTokensFlag: "--max-tokens",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = {
        prompt: "Hello",
        maxTokens: 1000,
        stream: false,
      };

      await provider.runOnce(req, {});

      const spawnArgs = mockSpawn.mock.calls[0][0];
      expect(spawnArgs).toContain("--max-tokens");
      expect(spawnArgs).toContain("1000");
    });

    test("should add temperature flag when configured", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        args: {
          temperatureFlag: "--temperature",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = {
        prompt: "Hello",
        temperature: 0.7,
        stream: false,
      };

      await provider.runOnce(req, {});

      const spawnArgs = mockSpawn.mock.calls[0][0];
      expect(spawnArgs).toContain("--temperature");
      expect(spawnArgs).toContain("0.7");
    });

    test("should add language flag when configured", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        args: {
          languageFlag: "--language",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = {
        prompt: "Hello",
        language: "python",
        stream: false,
      };

      await provider.runOnce(req, {});

      const spawnArgs = mockSpawn.mock.calls[0][0];
      expect(spawnArgs).toContain("--language");
      expect(spawnArgs).toContain("python");
    });
  });

  describe("environment variables", () => {
    test("should pass environment variables to process", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        env: {
          API_KEY: "test-key",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await provider.runOnce(req, {});

      const spawnOpts = mockSpawn.mock.calls[0][1];
      expect(spawnOpts.env).toBeDefined();
      expect(spawnOpts.env.API_KEY).toBe("test-key");
    });

    test("should interpolate ${VAR} syntax from process.env", async () => {
      // Set up test environment variable
      process.env.TEST_API_KEY = "interpolated-value";

      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        env: {
          API_KEY: "${TEST_API_KEY}",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await provider.runOnce(req, {});

      const spawnOpts = mockSpawn.mock.calls[0][1];
      expect(spawnOpts.env.API_KEY).toBe("interpolated-value");

      // Clean up
      delete process.env.TEST_API_KEY;
    });

    test("should allow opts.env to override definition env", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        env: {
          API_KEY: "default-key",
        },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await provider.runOnce(req, { env: { API_KEY: "override-key" } });

      const spawnOpts = mockSpawn.mock.calls[0][1];
      expect(spawnOpts.env.API_KEY).toBe("override-key");
    });
  });

  describe("defaultCwd", () => {
    test("should use defaultCwd when no opts.cwd provided", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        defaultCwd: "/tmp/test",
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await provider.runOnce(req, {});

      const spawnOpts = mockSpawn.mock.calls[0][1];
      expect(spawnOpts.cwd).toBe("/tmp/test");
    });

    test("should allow opts.cwd to override defaultCwd", async () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        defaultCwd: "/tmp/test",
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await provider.runOnce(req, { cwd: "/tmp/override" });

      const spawnOpts = mockSpawn.mock.calls[0][1];
      expect(spawnOpts.cwd).toBe("/tmp/override");
    });
  });

  describe("allowedExitCodes", () => {
    test("should treat exit code 0 as success by default", async () => {
      mockSpawn = mock(() => createMockProcess("success output", "", 0));
      (globalThis as any).Bun.spawn = mockSpawn;

      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      const result = await provider.runOnce(req, {});
      expect(result.text).toBe("success output");
    });

    test("should treat exit code 1 as failure by default", async () => {
      mockSpawn = mock(() => createMockProcess("", "error", 1));
      (globalThis as any).Bun.spawn = mockSpawn;

      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      await expect(provider.runOnce(req, {})).rejects.toThrow(/failed with code 1/);
    });

    test("should allow custom exit codes", async () => {
      mockSpawn = mock(() => createMockProcess("warning output", "", 1));
      (globalThis as any).Bun.spawn = mockSpawn;

      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        allowedExitCodes: [0, 1], // Allow warnings
      });

      const provider = new ConfigurableProvider(definition);
      const req: CodingRequest = { prompt: "Hello", stream: false };

      const result = await provider.runOnce(req, {});
      expect(result.text).toBe("warning output");
    });
  });

  describe("error classification", () => {
    test("should classify rate limit errors", () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
      });

      const provider = new ConfigurableProvider(definition);

      expect(provider.classifyError({ stderr: "rate limit exceeded" })).toBe("RATE_LIMIT");
      expect(provider.classifyError({ stderr: "429 Too Many Requests" })).toBe("RATE_LIMIT");
    });

    test("should classify auth errors", () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
      });

      const provider = new ConfigurableProvider(definition);

      expect(provider.classifyError({ stderr: "401 unauthorized" })).toBe("UNAUTHORIZED");
      expect(provider.classifyError({ stderr: "invalid api key" })).toBe("UNAUTHORIZED");
    });

    test("should use provider-specific error patterns first", () => {
      const definition = defineProvider({
        id: "test-cli",
        binary: "test-cli",
        input: { method: "positional" },
        errors: {
          OUT_OF_CREDITS: ["custom quota message"],
        },
      });

      const provider = new ConfigurableProvider(definition);

      expect(provider.classifyError({ stderr: "custom quota message" })).toBe("OUT_OF_CREDITS");
    });
  });

  describe("createConfigurableProvider helper", () => {
    test("should create provider from definition", () => {
      const definition = defineProvider({
        id: "helper-test",
        binary: "helper-cli",
        input: { method: "stdin" },
      });

      const provider = createConfigurableProvider(definition);

      expect(provider).toBeInstanceOf(ConfigurableProvider);
      expect(provider.id).toBe("helper-test");
    });
  });
});
