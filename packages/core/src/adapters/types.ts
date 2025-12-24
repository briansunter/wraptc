/**
 * Adapter Types - Lightweight configuration for terminal coding tools
 *
 * Designed to be simpler than defineProvider while maintaining full functionality.
 * Most adapters should be < 20 lines of TypeScript.
 */

import type { ProviderErrorKind, TokenUsage } from "../types";

/**
 * How to pass the prompt to the CLI tool
 */
export type InputMethod =
	| "stdin" // Pipe prompt to stdin (default)
	| "positional" // Pass as positional argument
	| { flag: string }; // Pass with flag: -p "<prompt>"

/**
 * How to parse CLI output
 */
export type OutputFormat =
	| "text" // Raw stdout as response (default)
	| "json" // Parse JSON, extract text from common fields
	| { jsonPath: string }; // Extract from specific JSON path

/**
 * Streaming mode for real-time output
 */
export type StreamingMode =
	| "none" // No streaming (default)
	| "line" // Emit each line as it arrives
	| "jsonl"; // Parse JSON lines

/**
 * Invoke options passed to adapter execution
 */
export interface AdapterInvokeOptions {
	signal?: AbortSignal;
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
}

/**
 * Streaming chunk types
 */
export type StreamChunk =
	| { type: "start"; requestId: string }
	| { type: "text"; content: string }
	| { type: "json"; data: unknown }
	| { type: "complete"; text: string; usage?: TokenUsage }
	| { type: "error"; message: string; kind: ProviderErrorKind };

/**
 * Error pattern configuration
 * Maps error kind to array of case-insensitive patterns to match
 */
export type ErrorPatterns = Partial<Record<ProviderErrorKind, string[]>>;

/**
 * Core adapter configuration
 *
 * Only `id` and `binary` are required - everything else has sensible defaults.
 */
export interface AdapterConfig {
	// Required fields
	/** Unique identifier for this adapter */
	id: string;
	/** CLI binary name or path */
	binary: string;

	// Display
	/** Human-readable name (defaults to id) */
	displayName?: string;
	/** Description of this adapter */
	description?: string;
	/** Version string */
	version?: string;

	// Input handling
	/** How to pass the prompt (default: 'stdin') */
	input?: InputMethod;

	// Arguments
	/** Static args to always include */
	args?: string[];
	/** Subcommand to invoke (e.g., 'exec', 'run') */
	subcommand?: string;
	/** Environment variables to set */
	env?: Record<string, string>;

	// Output handling
	/** How to parse output (default: 'text') */
	output?: OutputFormat;
	/** Streaming mode (default: 'none') */
	streaming?: StreamingMode;

	// Error handling
	/** Patterns to match for error classification */
	errorPatterns?: ErrorPatterns;
	/** Exit codes to treat as success (default: [0]) */
	allowedExitCodes?: number[];

	// Capabilities
	/** Coding modes this adapter supports */
	capabilities?: string[];

	// Timeouts
	/** Timeout in milliseconds (default: 60000) */
	timeoutMs?: number;
}

/**
 * Optional hooks for custom behavior
 * Use these when declarative config isn't sufficient
 */
export interface AdapterHooks {
	/**
	 * Custom argument building logic
	 * @returns Array of command line arguments
	 */
	buildArgs?: (prompt: string, options: AdapterInvokeOptions) => string[];

	/**
	 * Custom stdin input generation
	 * @returns String to pipe to stdin, or undefined for no stdin
	 */
	getStdin?: (prompt: string) => string | undefined;

	/**
	 * Custom output parsing for non-streaming responses
	 */
	parseOutput?: (stdout: string) => { text: string; usage?: TokenUsage };

	/**
	 * Custom streaming chunk parsing
	 * @returns Parsed chunk, or null to skip the line
	 */
	parseStreamChunk?: (line: string) => StreamChunk | null;

	/**
	 * Custom error classification
	 */
	classifyError?: (
		stderr: string,
		stdout: string,
		exitCode: number | null,
	) => ProviderErrorKind;
}

/**
 * Full adapter definition = config + optional hooks
 */
export type AdapterDefinition = AdapterConfig & Partial<AdapterHooks>;

/**
 * Result from running an adapter
 */
export interface AdapterResult {
	text: string;
	usage?: TokenUsage;
}

/**
 * Metadata about an adapter
 */
export interface AdapterInfo {
	id: string;
	displayName: string;
	description?: string;
	version?: string;
	binary: string;
	capabilities: string[];
	supportsStreaming: boolean;
	isAvailable?: boolean;
}
