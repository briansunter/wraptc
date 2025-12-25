/**
 * Mock Coder Adapter Integration Tests
 *
 * Tests the full adapter system end-to-end using a bash script mock coder.
 * This validates that the adapter wrapper can properly:
 * - Execute the underlying binary
 * - Pass input via stdin, positional args, or flags
 * - Parse output (text or JSON)
 * - Handle streaming output
 * - Classify errors correctly
 */

import { beforeAll, describe, expect, test } from "bun:test";
import {
  mockCoderFlag,
  mockCoderJson,
  mockCoderPositional,
  mockCoderRateLimit,
  mockCoderStdin,
  mockCoderStreamJson,
  mockCoderStreamText,
  mockCoderUnauthorized,
} from "../../adapters/builtin/mock-coder";
import { AdapterProviderBridge } from "../../adapters/provider-bridge";
import { AdapterError, AdapterRunner } from "../../adapters/runner";

// Ensure mock-coder.sh is executable
beforeAll(async () => {
  const mockCoderPath = new URL("../../../test-fixtures/mock-coder.sh", import.meta.url).pathname;

  // Make executable if not already
  const proc = Bun.spawn(["chmod", "+x", mockCoderPath]);
  await proc.exited;
});

describe("Mock Coder Adapter - Input Methods", () => {
  test("should handle stdin input", async () => {
    const runner = new AdapterRunner(mockCoderStdin);
    const result = await runner.run("hello world", {});

    expect(result.text).toContain("Mock Coder");
    expect(result.text).toContain("Hello");
  });

  test("should handle positional input", async () => {
    const runner = new AdapterRunner(mockCoderPositional);
    const result = await runner.run("hello", {});

    expect(result.text).toContain("Mock Coder");
  });

  test("should handle flag input", async () => {
    const runner = new AdapterRunner(mockCoderFlag);
    const result = await runner.run("hello", {});

    expect(result.text).toContain("Mock Coder");
  });
});

describe("Mock Coder Adapter - Output Formats", () => {
  test("should parse text output", async () => {
    const runner = new AdapterRunner(mockCoderPositional);
    const result = await runner.run("explain something", {});

    expect(result.text).toBeTruthy();
    expect(typeof result.text).toBe("string");
  });

  test("should parse JSON output", async () => {
    const runner = new AdapterRunner(mockCoderJson);
    const result = await runner.run("hello", {});

    expect(result.text).toContain("Mock Coder");
    expect(result.usage).toBeDefined();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.usage?.outputTokens).toBeGreaterThan(0);
  });
});

describe("Mock Coder Adapter - Streaming", () => {
  test("should stream text output line by line", async () => {
    const runner = new AdapterRunner(mockCoderStreamText);
    const chunks: string[] = [];

    for await (const chunk of runner.runStream("hello", {})) {
      if (chunk.type === "text") {
        chunks.push(chunk.content);
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.join("");
    expect(fullText).toContain("Mock Coder");
  });

  test("should stream JSON output as JSONL", async () => {
    const runner = new AdapterRunner(mockCoderStreamJson);
    const chunks: unknown[] = [];

    for await (const chunk of runner.runStream("hello", {})) {
      if (chunk.type === "json") {
        chunks.push(chunk.data);
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe("Mock Coder Adapter - Error Handling", () => {
  test("should classify rate limit error", async () => {
    const runner = new AdapterRunner(mockCoderRateLimit);

    try {
      await runner.run("test", {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.kind).toBe("RATE_LIMIT");
      expect(adapterError.isRetryable).toBe(true);
    }
  });

  test("should classify unauthorized error", async () => {
    const runner = new AdapterRunner(mockCoderUnauthorized);

    try {
      await runner.run("test", {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.kind).toBe("UNAUTHORIZED");
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.isUserError).toBe(true);
    }
  });
});

describe("Mock Coder Adapter - Provider Bridge", () => {
  test("should work through provider bridge (runOnce)", async () => {
    const bridge = new AdapterProviderBridge(mockCoderPositional);

    expect(bridge.id).toBe("mock-coder-positional");
    expect(bridge.displayName).toBe("Mock Coder (positional)");

    const result = await bridge.runOnce({ prompt: "hello", mode: "generate" }, {});

    expect(result.text).toContain("Mock Coder");
  });

  test("should work through provider bridge (runStream)", async () => {
    const bridge = new AdapterProviderBridge(mockCoderStreamText);

    expect(bridge.supportsStreaming).toBe(true);

    const events: string[] = [];
    for await (const event of bridge.runStream({ prompt: "hello", mode: "generate" }, {})) {
      events.push(event.type);
      if (event.type === "text_delta") {
        expect(event.text).toBeTruthy();
      }
    }

    expect(events).toContain("start");
    expect(events).toContain("text_delta");
    expect(events).toContain("complete");
  });

  test("should classify errors through bridge", () => {
    const bridge = new AdapterProviderBridge(mockCoderStdin);

    expect(
      bridge.classifyError({
        error: new Error("Rate limit exceeded"),
        stderr: "Error 429: Rate limit exceeded",
        exitCode: 1,
      }),
    ).toBe("RATE_LIMIT");

    expect(
      bridge.classifyError({
        error: new Error("Auth failed"),
        stderr: "Error 401: Unauthorized",
        exitCode: 1,
      }),
    ).toBe("UNAUTHORIZED");
  });

  test("should report capabilities through getInfo", () => {
    const bridge = new AdapterProviderBridge(mockCoderStdin);
    const info = bridge.getInfo();

    expect(info.capabilities).toContain("generate");
    expect(info.capabilities).toContain("edit");
    expect(info.capabilities).toContain("explain");
    expect(info.supportsStreaming).toBe(false);
  });
});

describe("Mock Coder Adapter - Different Prompts", () => {
  test("should handle code generation prompt", async () => {
    const runner = new AdapterRunner(mockCoderPositional);
    const result = await runner.run("write a function to greet", {});

    expect(result.text).toContain("function");
    expect(result.text).toContain("greet");
  });

  test("should handle explanation prompt", async () => {
    const runner = new AdapterRunner(mockCoderPositional);
    const result = await runner.run("explain this code", {});

    expect(result.text).toContain("code does the following");
  });

  test("should handle generic prompt", async () => {
    const runner = new AdapterRunner(mockCoderPositional);
    const result = await runner.run("do something random", {});

    expect(result.text).toContain("I received your prompt");
  });
});

describe("Mock Coder Adapter - Runner Info", () => {
  test("should expose adapter info", () => {
    const runner = new AdapterRunner(mockCoderStdin);
    const info = runner.getInfo();

    expect(info.id).toBe("mock-coder-stdin");
    expect(info.displayName).toBe("Mock Coder (stdin)");
    expect(info.supportsStreaming).toBe(false);
    expect(info.capabilities).toContain("generate");
  });

  test("should report streaming capability", () => {
    const runner = new AdapterRunner(mockCoderStreamText);
    const info = runner.getInfo();

    expect(info.supportsStreaming).toBe(true);
  });
});
