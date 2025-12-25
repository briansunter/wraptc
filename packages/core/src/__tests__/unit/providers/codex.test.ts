import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { CodexProvider } from "../../../providers/codex";
import type { CodingRequest, ProviderConfig } from "../../../types";

describe("CodexProvider", () => {
  let provider: CodexProvider;
  let config: ProviderConfig;

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

  describe("constructor", () => {
    test("should initialize with correct id and display name", () => {
      expect(provider.id).toBe("codex");
      expect(provider.displayName).toBe("Codex CLI");
    });

    test("should set binary path from config", () => {
      const customConfig = { ...config, binary: "/custom/codex" };
      const customProvider = new CodexProvider(customConfig);
      expect(customProvider["binaryPath"]).toBe("/custom/codex");
    });

    test("should set default binary if not provided", () => {
      const defaultConfig = { ...config, binary: "" };
      const defaultProvider = new CodexProvider(defaultConfig);
      expect(defaultProvider["binaryPath"]).toBe("codex");
    });

    test("should set streaming support based on config", () => {
      expect(provider.supportsStreaming).toBe(true);

      const noStreamConfig = { ...config, streamingMode: "none" as const };
      const noStreamProvider = new CodexProvider(noStreamConfig);
      expect(noStreamProvider.supportsStreaming).toBe(false);
    });
  });

  describe("buildArgs", () => {
    test("should use exec subcommand with prompt", () => {
      const req: CodingRequest = { prompt: "Write hello world" };
      const args = provider["buildArgs"](req, {});

      expect(args[0]).toBe("exec");
      expect(args).toContain("Write hello world");
    });

    test("should include config args", () => {
      const configWithArgs = { ...config, args: ["--model", "gpt-4"] };
      const providerWithArgs = new CodexProvider(configWithArgs);
      const req: CodingRequest = { prompt: "test" };
      const args = providerWithArgs["buildArgs"](req, {});

      expect(args).toContain("--model");
      expect(args).toContain("gpt-4");
    });

    test("should place prompt after config args", () => {
      const configWithArgs = { ...config, args: ["--verbose"] };
      const providerWithArgs = new CodexProvider(configWithArgs);
      const req: CodingRequest = { prompt: "test prompt" };
      const args = providerWithArgs["buildArgs"](req, {});

      // exec, --verbose, test prompt
      expect(args[0]).toBe("exec");
      expect(args[1]).toBe("--verbose");
      expect(args[2]).toBe("test prompt");
    });
  });

  describe("getStdinInput", () => {
    test("should return undefined for Codex (uses positional args)", () => {
      const result = provider["getStdinInput"]();
      expect(result).toBeUndefined();
    });
  });

  describe("classifyError", () => {
    test("classifies 'plan limit' as OUT_OF_CREDITS", () => {
      const error = provider.classifyError({ stderr: "You've hit your plan limit" });
      expect(error).toBe("OUT_OF_CREDITS");
    });

    test("classifies 'subscription required' as OUT_OF_CREDITS", () => {
      const error = provider.classifyError({ stderr: "Subscription required for this feature" });
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

    test("should combine stdout and stderr for classification", () => {
      const result = provider.classifyError({
        stderr: "some stderr",
        stdout: "plan limit reached",
      });
      expect(result).toBe("OUT_OF_CREDITS");
    });
  });

  describe("getInfo", () => {
    test("should return provider information", () => {
      const info = provider.getInfo();

      expect(info).toEqual({
        id: "codex",
        displayName: "Codex CLI",
        supportsStreaming: true,
        prefersJson: false,
        capabilities: ["generate", "edit", "test"],
      });
    });
  });

  describe("runOnce (integration)", () => {
    test("should throw when binary not found", async () => {
      const req: CodingRequest = { prompt: "test" };
      await expect(provider.runOnce(req, {})).rejects.toThrow();
    });
  });

  describe("runStream (integration)", () => {
    test("should throw when binary not found", async () => {
      const req: CodingRequest = { prompt: "test" };

      try {
        for await (const event of provider.runStream(req, {})) {
          // Should not get here
        }
        expect(true).toBe(false); // Fail if we get here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
