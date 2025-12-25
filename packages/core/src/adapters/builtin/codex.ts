/**
 * Codex CLI Adapter
 *
 * Wraps the OpenAI Codex CLI tool for code generation
 */

import { defineAdapter } from "../define";

export default defineAdapter({
  id: "codex",
  binary: "codex",
  displayName: "Codex CLI",
  description: "OpenAI Codex CLI for code generation",

  // Codex uses subcommand + positional
  subcommand: "exec",
  input: "positional",

  // Text output
  output: "text",

  // Line-based streaming
  streaming: "line",

  // Error patterns specific to Codex/OpenAI
  errorPatterns: {
    RATE_LIMIT: ["rate_limit_exceeded", "429", "too many requests"],
    UNAUTHORIZED: ["401", "invalid_api_key", "unauthorized"],
    OUT_OF_CREDITS: ["quota exceeded", "insufficient_quota", "billing"],
    CONTEXT_LENGTH: ["maximum context length", "too long"],
  },

  // Supported capabilities
  capabilities: ["generate", "edit", "test"],
});
