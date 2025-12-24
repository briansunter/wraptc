import { describe, test, expect } from "bun:test";
import { CodexProvider } from "../../../providers/codex";

describe("Simple Codex Test", () => {
  test("can create CodexProvider", () => {
    const config = {
      binary: "cdx",
      args: [],
      jsonMode: "none" as const,
      streamingMode: "line" as const,
      capabilities: ["generate", "edit", "test"],
    };

    const provider = new CodexProvider(config);
    expect(provider.id).toBe("codex");
    expect(provider.displayName).toBe("Codex CLI");
  });
});
