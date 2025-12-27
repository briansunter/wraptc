/**
 * AdapterRunner Unit Tests
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { defineAdapter } from "../../../adapters/define";
import {
  AdapterError,
  AdapterRunner,
  type AdapterRunnerTestHelper,
} from "../../../adapters/runner";

describe("AdapterRunner", () => {
  describe("constructor", () => {
    test("should create runner from adapter definition", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
      });

      const runner = new AdapterRunner(adapter);
      const info = runner.getInfo();

      expect(info.id).toBe("test");
      expect(info.binary).toBe("echo");
      expect(info.displayName).toBe("test");
    });

    test("should use displayName when provided", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        displayName: "Test Adapter",
      });

      const runner = new AdapterRunner(adapter);
      expect(runner.getInfo().displayName).toBe("Test Adapter");
    });
  });

  describe("getInfo", () => {
    test("should return adapter info with defaults", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "test-cli",
      });

      const runner = new AdapterRunner(adapter);
      const info = runner.getInfo();

      expect(info.id).toBe("test");
      expect(info.binary).toBe("test-cli");
      expect(info.capabilities).toEqual(["generate"]);
      expect(info.supportsStreaming).toBe(false);
    });

    test("should reflect streaming capability", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "test-cli",
        streaming: "line",
      });

      const runner = new AdapterRunner(adapter);
      expect(runner.getInfo().supportsStreaming).toBe(true);
    });
  });

  describe("input handling", () => {
    test("should use stdin by default", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        // Default input is stdin
      });

      // Access private method via type assertion for testing
      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const stdin = runner.getStdin("test prompt");
      const args = runner.buildArgs("test prompt", {});

      expect(stdin).toBe("test prompt");
      expect(args).not.toContain("test prompt");
    });

    test("should use positional input when configured", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        input: "positional",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const stdin = runner.getStdin("test prompt");
      const args = runner.buildArgs("test prompt", {});

      expect(stdin).toBeUndefined();
      expect(args).toContain("test prompt");
    });

    test("should use flag input when configured", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "test-cli",
        input: { flag: "-p" },
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const stdin = runner.getStdin("my prompt");
      const args = runner.buildArgs("my prompt", {});

      expect(stdin).toBeUndefined();
      expect(args).toContain("-p");
      expect(args).toContain("my prompt");
      expect(args.indexOf("-p")).toBe(args.indexOf("my prompt") - 1);
    });
  });

  describe("args building", () => {
    test("should include static args", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "test-cli",
        args: ["--json", "--verbose"],
        input: "positional",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const args = runner.buildArgs("prompt", {});

      expect(args).toContain("--json");
      expect(args).toContain("--verbose");
    });

    test("should use custom buildArgs hook", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "test-cli",
        buildArgs: (prompt) => ["custom", prompt, "args"],
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const args = runner.buildArgs("test", {});

      expect(args).toEqual(["custom", "test", "args"]);
    });
  });

  describe("output parsing", () => {
    test("should parse text output", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        output: "text",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const result = runner.parseOutput("  hello world  \n");

      expect(result.text).toBe("hello world");
      expect(result.usage).toBeUndefined();
    });

    test("should parse JSON output with common fields", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        output: "json",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;

      // Test various common text fields
      expect(runner.parseOutput('{"text": "hello"}').text).toBe("hello");
      expect(runner.parseOutput('{"response": "world"}').text).toBe("world");
      expect(runner.parseOutput('{"output": "test"}').text).toBe("test");
      expect(runner.parseOutput('{"content": "data"}').text).toBe("data");
    });

    test("should extract usage from JSON", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        output: "json",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const result = runner.parseOutput(
        JSON.stringify({
          text: "response",
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
      );

      expect(result.text).toBe("response");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });

    test("should use jsonPath for extraction", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        output: { jsonPath: "data.result" },
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const result = runner.parseOutput(JSON.stringify({ data: { result: "nested value" } }));

      expect(result.text).toBe("nested value");
    });

    test("should use custom parseOutput hook", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        parseOutput: (stdout) => ({
          text: `CUSTOM: ${stdout.trim()}`,
          usage: { totalTokens: 42 },
        }),
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;
      const result = runner.parseOutput("test output");

      expect(result.text).toBe("CUSTOM: test output");
      expect(result.usage).toEqual({ totalTokens: 42 });
    });
  });

  describe("error classification", () => {
    test("should classify rate limit errors", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        errorPatterns: {
          RATE_LIMIT: ["429", "rate limit"],
        },
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;

      expect(runner.classifyError("Error 429", "", null)).toBe("RATE_LIMIT");
      expect(runner.classifyError("Rate limit exceeded", "", null)).toBe("RATE_LIMIT");
    });

    test("should use custom classifyError hook", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
        classifyError: (stderr) => {
          if (stderr.includes("custom error")) return "INTERNAL";
          return "UNKNOWN";
        },
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;

      expect(runner.classifyError("custom error occurred", "", null)).toBe("INTERNAL");
      expect(runner.classifyError("something else", "", null)).toBe("UNKNOWN");
    });

    test("should fall back to default patterns", () => {
      const adapter = defineAdapter({
        id: "test",
        binary: "echo",
      });

      const runner = new AdapterRunner(adapter) as AdapterRunnerTestHelper;

      expect(runner.classifyError("unauthorized access", "", null)).toBe("UNAUTHORIZED");
      expect(runner.classifyError("timeout error", "", null)).toBe("TIMEOUT");
    });
  });
});

describe("AdapterError", () => {
  test("should create error with kind", () => {
    const error = new AdapterError("Test error", "RATE_LIMIT", "test-adapter", {
      stderr: "rate limit hit",
    });

    expect(error.message).toBe("Test error");
    expect(error.kind).toBe("RATE_LIMIT");
    expect(error.adapterId).toBe("test-adapter");
    expect(error.name).toBe("AdapterError");
  });

  test("should correctly identify retryable errors", () => {
    expect(new AdapterError("", "TRANSIENT", "a", {}).isRetryable).toBe(true);
    expect(new AdapterError("", "RATE_LIMIT", "a", {}).isRetryable).toBe(true);
    expect(new AdapterError("", "TIMEOUT", "a", {}).isRetryable).toBe(true);
    expect(new AdapterError("", "UNAUTHORIZED", "a", {}).isRetryable).toBe(false);
    expect(new AdapterError("", "BAD_REQUEST", "a", {}).isRetryable).toBe(false);
  });

  test("should correctly identify user errors", () => {
    expect(new AdapterError("", "BAD_REQUEST", "a", {}).isUserError).toBe(true);
    expect(new AdapterError("", "UNAUTHORIZED", "a", {}).isUserError).toBe(true);
    expect(new AdapterError("", "CONTEXT_LENGTH", "a", {}).isUserError).toBe(true);
    expect(new AdapterError("", "RATE_LIMIT", "a", {}).isUserError).toBe(false);
  });
});
