/**
 * Qwen Code CLI Adapter
 *
 * Wraps the Qwen Code CLI tool for AI-assisted coding
 */

import { defineAdapter } from "../define";

export default defineAdapter({
	id: "qwen-code",
	binary: "qwen",
	displayName: "Qwen Code CLI",
	description: "Qwen Code CLI for AI-assisted coding",

	// Qwen uses -p flag for prompt
	input: { flag: "-p" },

	// Basic args with yolo mode
	args: ["--yolo"],
	output: "text",

	// Line-based streaming
	streaming: "line",

	// Error patterns specific to Qwen
	errorPatterns: {
		RATE_LIMIT: ["429", "rate limit", "API limit exceeded", "too many requests"],
		UNAUTHORIZED: ["unauthorized", "API key", "authentication failed"],
		OUT_OF_CREDITS: ["quota exceeded", "insufficient balance"],
	},

	// Supported capabilities
	capabilities: ["generate", "edit", "explain", "test"],
});
