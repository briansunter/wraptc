/**
 * Mock Coder Adapter
 *
 * Used for testing the adapter system with a simple bash script.
 * This demonstrates how to wrap any terminal coder tool.
 */

import { defineAdapter } from "../define";
import type { AdapterDefinition } from "../types";

// Path to mock-coder.sh relative to package root (for testing)
const MOCK_CODER_PATH = new URL(
	"../../../test-fixtures/mock-coder.sh",
	import.meta.url,
).pathname;

/**
 * Mock coder with stdin input (default)
 */
export const mockCoderStdin = defineAdapter({
	id: "mock-coder-stdin",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (stdin)",
	input: "stdin",
	output: "text",
	streaming: "none",
	capabilities: ["generate", "edit", "explain"],
	errorPatterns: {
		RATE_LIMIT: ["429", "Rate limit exceeded"],
		UNAUTHORIZED: ["401", "Unauthorized", "Invalid API key"],
		TIMEOUT: ["timed out"],
		CONTEXT_LENGTH: ["Context length exceeded"],
	},
});

/**
 * Mock coder with positional argument input
 */
export const mockCoderPositional = defineAdapter({
	id: "mock-coder-positional",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (positional)",
	input: "positional",
	output: "text",
	streaming: "none",
	capabilities: ["generate"],
});

/**
 * Mock coder with -p flag input
 */
export const mockCoderFlag = defineAdapter({
	id: "mock-coder-flag",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (flag)",
	input: { flag: "-p" },
	output: "text",
	streaming: "none",
	capabilities: ["generate"],
});

/**
 * Mock coder with JSON output
 */
export const mockCoderJson = defineAdapter({
	id: "mock-coder-json",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (JSON)",
	input: "positional",
	args: ["-o", "json"],
	output: "json",
	streaming: "none",
	capabilities: ["generate"],
});

/**
 * Mock coder with streaming text output
 */
export const mockCoderStreamText = defineAdapter({
	id: "mock-coder-stream-text",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (stream text)",
	input: "positional",
	args: ["-s", "-d", "10"], // Fast delay for tests
	output: "text",
	streaming: "line",
	capabilities: ["generate"],
});

/**
 * Mock coder with streaming JSON output
 */
export const mockCoderStreamJson = defineAdapter({
	id: "mock-coder-stream-json",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (stream JSON)",
	input: "positional",
	args: ["-o", "json", "-s", "-d", "10"],
	output: "json",
	streaming: "jsonl",
	capabilities: ["generate"],
});

/**
 * Mock coder that simulates rate limit error
 */
export const mockCoderRateLimit = defineAdapter({
	id: "mock-coder-rate-limit",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (rate limit)",
	input: "positional",
	args: ["--error", "rate_limit"],
	output: "text",
	streaming: "none",
	capabilities: ["generate"],
	errorPatterns: {
		RATE_LIMIT: ["429", "Rate limit exceeded"],
	},
});

/**
 * Mock coder that simulates auth error
 */
export const mockCoderUnauthorized = defineAdapter({
	id: "mock-coder-unauthorized",
	binary: MOCK_CODER_PATH,
	displayName: "Mock Coder (unauthorized)",
	input: "positional",
	args: ["--error", "auth"],
	output: "text",
	streaming: "none",
	capabilities: ["generate"],
	errorPatterns: {
		UNAUTHORIZED: ["401", "Unauthorized"],
	},
});

// Export all mock coders as a collection for testing
export const mockCoders: Record<string, AdapterDefinition> = {
	stdin: mockCoderStdin,
	positional: mockCoderPositional,
	flag: mockCoderFlag,
	json: mockCoderJson,
	streamText: mockCoderStreamText,
	streamJson: mockCoderStreamJson,
	rateLimit: mockCoderRateLimit,
	unauthorized: mockCoderUnauthorized,
};

// Default export
export default mockCoderStdin;
