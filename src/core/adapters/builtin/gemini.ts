/**
 * Gemini CLI Adapter
 *
 * Wraps the Google Gemini CLI tool for code generation
 */

import { defineAdapter } from "../define";

export default defineAdapter({
  id: "gemini",
  binary: "gemini",
  displayName: "Gemini CLI",
  description: "Google Gemini CLI for AI-assisted coding",

  // Gemini uses positional prompt argument
  input: "positional",

  // JSON output with --yolo for auto-confirm
  args: ["-o", "json", "--yolo"],
  output: "json",

  // Streaming via JSONL
  streaming: "jsonl",

  // Error patterns specific to Gemini
  errorPatterns: {
    RATE_LIMIT: ["429", "RESOURCE_EXHAUSTED", "quota exceeded", "rate limit"],
    UNAUTHORIZED: ["401", "invalid api key", "authentication"],
    OUT_OF_CREDITS: ["quota limit", "insufficient quota"],
  },

  // Supported capabilities
  capabilities: ["generate", "edit", "explain", "test"],
});
