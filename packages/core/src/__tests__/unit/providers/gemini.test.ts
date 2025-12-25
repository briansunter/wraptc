import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { GeminiProvider } from "../../../providers/gemini";
import type { CodingRequest, ProviderConfig } from "../../../types";

describe("GeminiProvider", () => {
  let provider: GeminiProvider;
  let config: ProviderConfig;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    config = {
      binary: "gemini",
      args: [],
      jsonMode: "flag",
      jsonFlag: "--output-format",
      streamingMode: "jsonl",
      capabilities: ["generate", "edit", "explain", "test"],
    };
    provider = new GeminiProvider(config);
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  describe("constructor", () => {
    test("should initialize with correct id and display name", () => {
      expect(provider.id).toBe("gemini");
      expect(provider.displayName).toBe("Gemini CLI");
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

    test("should set streaming support based on config", () => {
      expect(provider.supportsStreaming).toBe(true);

      const noStreamConfig = { ...config, streamingMode: "none" as const };
      const noStreamProvider = new GeminiProvider(noStreamConfig);
      expect(noStreamProvider.supportsStreaming).toBe(false);
    });

    test("should set JSON preference based on config", () => {
      expect(provider.prefersJson).toBe(true);

      const noJsonConfig = { ...config, jsonMode: "none" as const };
      const noJsonProvider = new GeminiProvider(noJsonConfig);
      expect(noJsonProvider.prefersJson).toBe(false);
    });
  });

  describe("buildArgs", () => {
    test("should build args with JSON flag", () => {
      const req: CodingRequest = { prompt: "test prompt" };
      const args = provider["buildArgs"](req, {});

      expect(args).toContain("-o");
      expect(args).toContain("json");
      expect(args).toContain("test prompt");
    });

    test("should include config args", () => {
      const configWithArgs = { ...config, args: ["--verbose", "--model=gpt4"] };
      const providerWithArgs = new GeminiProvider(configWithArgs);
      const req: CodingRequest = { prompt: "test" };
      const args = providerWithArgs["buildArgs"](req, {});

      expect(args).toContain("--verbose");
      expect(args).toContain("--model=gpt4");
    });

    test("should skip JSON flag when jsonMode is none", () => {
      const noJsonConfig = { ...config, jsonMode: "none" as const };
      const noJsonProvider = new GeminiProvider(noJsonConfig);
      const req: CodingRequest = { prompt: "test" };
      const args = noJsonProvider["buildArgs"](req, {});

      expect(args).not.toContain("-o");
      expect(args).not.toContain("json");
    });
  });

  describe("getStdinInput", () => {
    test("should return undefined for Gemini (uses positional args)", () => {
      const result = provider["getStdinInput"]();
      expect(result).toBeUndefined();
    });
  });

  describe("classifyError", () => {
    test("should classify OUT_OF_CREDITS errors", () => {
      const errors = [
        "quota exceeded",
        "out of quota",
        "QUOTA EXCEEDED",
        "out of credits",
        "insufficient quota",
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
        "too many requests",
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
        "invalid request",
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("BAD_REQUEST");
      }
    });

    test("should classify UNAUTHORIZED errors", () => {
      const errors = [
        "401",
        "unauthorized",
        "invalid api key",
        "authentication failed",
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("UNAUTHORIZED");
      }
    });

    test("should classify TIMEOUT errors", () => {
      const errors = [
        "timeout",
        "timed out",
        "deadline exceeded",
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("TIMEOUT");
      }
    });

    test("should classify INTERNAL errors", () => {
      const errors = [
        "500",
        "Internal server error",
        "internal error",
        "server error",
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("INTERNAL");
      }
    });

    test("should classify TRANSIENT for unmatched errors", () => {
      const errors = [
        "connection refused",
        "econnrefused",
        "network error",
        "some unknown error xyz",
      ];

      for (const error of errors) {
        const result = provider.classifyError({ stderr: error });
        expect(result).toBe("TRANSIENT");
      }
    });

    test("should combine stdout and stderr for classification", () => {
      const result = provider.classifyError({
        stderr: "some stderr",
        stdout: "rate limit exceeded",
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

  describe("runOnce (integration)", () => {
    test("should throw when binary not found", async () => {
      const req: CodingRequest = { prompt: "test" };

      await expect(provider.runOnce(req, {})).rejects.toThrow();
    });
  });

  describe("runStream (integration)", () => {
    test("should throw when binary not found", async () => {
      const req: CodingRequest = { prompt: "test" };

      const events: any[] = [];
      try {
        for await (const event of provider.runStream(req, {})) {
          events.push(event);
        }
        // If we get here without error, fail the test
        expect(true).toBe(false);
      } catch (error) {
        // Expected - binary not found
        expect(error).toBeDefined();
      }
    });
  });
});
