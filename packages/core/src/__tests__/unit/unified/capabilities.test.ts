/**
 * Capabilities Unit Tests
 */

import { describe, expect, test } from "bun:test";
import { Capability, ProviderCapabilities } from "../../../unified/capabilities";

describe("Capability constants", () => {
  test("should have coding mode capabilities", () => {
    expect(Capability.GENERATE).toBe("generate");
    expect(Capability.EDIT).toBe("edit");
    expect(Capability.EXPLAIN).toBe("explain");
    expect(Capability.TEST).toBe("test");
    expect(Capability.REVIEW).toBe("review");
    expect(Capability.REFACTOR).toBe("refactor");
  });

  test("should have input capabilities", () => {
    expect(Capability.FILE_CONTEXT).toBe("file_context");
    expect(Capability.MULTI_FILE).toBe("multi_file");
    expect(Capability.SYSTEM_PROMPT).toBe("system_prompt");
  });

  test("should have output capabilities", () => {
    expect(Capability.STREAMING).toBe("streaming");
    expect(Capability.JSON_OUTPUT).toBe("json_output");
    expect(Capability.USAGE_TRACKING).toBe("usage_tracking");
  });
});

describe("ProviderCapabilities", () => {
  describe("construction", () => {
    test("should create from typed capabilities", () => {
      const caps = new ProviderCapabilities([
        Capability.GENERATE,
        Capability.EDIT,
        Capability.STREAMING,
      ]);

      expect(caps.hasCapability(Capability.GENERATE)).toBe(true);
      expect(caps.hasCapability(Capability.EDIT)).toBe(true);
      expect(caps.hasCapability(Capability.STREAMING)).toBe(true);
      expect(caps.hasCapability(Capability.REVIEW)).toBe(false);
    });

    test("should create from string array", () => {
      const caps = ProviderCapabilities.fromStringArray(["generate", "edit", "explain"]);

      expect(caps.supportedModes.has("generate")).toBe(true);
      expect(caps.supportedModes.has("edit")).toBe(true);
      expect(caps.supportedModes.has("explain")).toBe(true);
    });

    test("should handle case-insensitive strings", () => {
      const caps = ProviderCapabilities.fromStringArray(["GENERATE", "Edit", "explain"]);

      expect(caps.supportedModes.has("generate")).toBe(true);
      expect(caps.supportedModes.has("edit")).toBe(true);
      expect(caps.supportedModes.has("explain")).toBe(true);
    });
  });

  describe("supportedModes", () => {
    test("should return only coding mode capabilities", () => {
      const caps = new ProviderCapabilities([
        Capability.GENERATE,
        Capability.EDIT,
        Capability.STREAMING, // Not a mode
        Capability.JSON_OUTPUT, // Not a mode
      ]);

      const modes = caps.supportedModes;

      expect(modes.size).toBe(2);
      expect(modes.has("generate")).toBe(true);
      expect(modes.has("edit")).toBe(true);
      expect(modes.has("streaming")).toBe(false);
    });
  });

  describe("feature flags", () => {
    test("should report streaming support", () => {
      const withStreaming = new ProviderCapabilities([Capability.STREAMING]);
      const withoutStreaming = new ProviderCapabilities([Capability.GENERATE]);

      expect(withStreaming.supportsStreaming).toBe(true);
      expect(withoutStreaming.supportsStreaming).toBe(false);
    });

    test("should report JSON output support", () => {
      const withJson = new ProviderCapabilities([Capability.JSON_OUTPUT]);
      const withoutJson = new ProviderCapabilities([Capability.GENERATE]);

      expect(withJson.supportsJsonOutput).toBe(true);
      expect(withoutJson.supportsJsonOutput).toBe(false);
    });

    test("should report file context support", () => {
      const withFiles = new ProviderCapabilities([Capability.FILE_CONTEXT]);
      const withoutFiles = new ProviderCapabilities([Capability.GENERATE]);

      expect(withFiles.supportsFileContext).toBe(true);
      expect(withoutFiles.supportsFileContext).toBe(false);
    });

    test("should report multi-file support", () => {
      const withMulti = new ProviderCapabilities([Capability.MULTI_FILE]);
      const withoutMulti = new ProviderCapabilities([Capability.GENERATE]);

      expect(withMulti.supportsMultiFile).toBe(true);
      expect(withoutMulti.supportsMultiFile).toBe(false);
    });

    test("should report system prompt support", () => {
      const withSystem = new ProviderCapabilities([Capability.SYSTEM_PROMPT]);
      const withoutSystem = new ProviderCapabilities([Capability.GENERATE]);

      expect(withSystem.supportsSystemPrompt).toBe(true);
      expect(withoutSystem.supportsSystemPrompt).toBe(false);
    });

    test("should report model selection support", () => {
      const withModel = new ProviderCapabilities([Capability.MODEL_SELECTION]);
      const withoutModel = new ProviderCapabilities([Capability.GENERATE]);

      expect(withModel.supportsModelSelection).toBe(true);
      expect(withoutModel.supportsModelSelection).toBe(false);
    });

    test("should report temperature control support", () => {
      const withTemp = new ProviderCapabilities([Capability.TEMPERATURE_CONTROL]);
      const withoutTemp = new ProviderCapabilities([Capability.GENERATE]);

      expect(withTemp.supportsTemperature).toBe(true);
      expect(withoutTemp.supportsTemperature).toBe(false);
    });

    test("should report max tokens support", () => {
      const withMax = new ProviderCapabilities([Capability.MAX_TOKENS]);
      const withoutMax = new ProviderCapabilities([Capability.GENERATE]);

      expect(withMax.supportsMaxTokens).toBe(true);
      expect(withoutMax.supportsMaxTokens).toBe(false);
    });
  });

  describe("getCapabilities", () => {
    test("should return all capabilities", () => {
      const caps = new ProviderCapabilities([
        Capability.GENERATE,
        Capability.STREAMING,
        Capability.JSON_OUTPUT,
      ]);

      const all = caps.getCapabilities();

      expect(all).toHaveLength(3);
      expect(all).toContain(Capability.GENERATE);
      expect(all).toContain(Capability.STREAMING);
      expect(all).toContain(Capability.JSON_OUTPUT);
    });
  });

  describe("fromProviderInfo", () => {
    test("should create from provider info", () => {
      const caps = ProviderCapabilities.fromProviderInfo({
        capabilities: ["generate", "edit"],
        supportsStreaming: true,
        prefersJson: true,
      });

      expect(caps.supportedModes.has("generate")).toBe(true);
      expect(caps.supportedModes.has("edit")).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsJsonOutput).toBe(true);
    });

    test("should handle missing info", () => {
      const caps = ProviderCapabilities.fromProviderInfo({});

      expect(caps.supportedModes.size).toBe(0);
      expect(caps.supportsStreaming).toBe(false);
      expect(caps.supportsJsonOutput).toBe(false);
    });
  });
});
