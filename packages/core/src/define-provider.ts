/**
 * defineProvider - Helper for creating CLI provider configurations
 *
 * This enables users to add new CLI tools by creating a simple .ts file:
 *
 * ```typescript
 * // ~/.config/wrap-terminalcoder/providers/my-cli.ts
 * import { defineProvider } from "wrap-terminalcoder";
 *
 * export default defineProvider({
 *   id: "my-cli",
 *   binary: "my-cli",
 *   input: { method: "positional" },
 *   output: { format: "json", textField: "response" },
 * });
 * ```
 */

import { z } from "zod";
import type {
  CodingRequest,
  ProviderErrorContext,
  ProviderErrorKind,
  TokenUsage,
} from "./types";

// Input configuration - how to pass the prompt to the CLI
export const InputConfigSchema = z
  .object({
    // stdin: pipe prompt to stdin
    // positional: pass prompt as positional argument
    // flag: pass prompt with a flag (e.g., --prompt "...")
    method: z.enum(["stdin", "positional", "flag"]).default("stdin"),
    // Flag name if method is "flag" (e.g., "--prompt")
    flag: z.string().optional(),
    // Position if method is "positional" (first or last argument)
    position: z.enum(["first", "last"]).default("last"),
  })
  .default({ method: "stdin" });

// Output configuration - how to parse CLI output
export const OutputConfigSchema = z
  .object({
    // text: raw stdout as response
    // json: parse JSON, extract textField
    // jsonl: parse JSON lines
    format: z.enum(["text", "json", "jsonl"]).default("text"),
    // Field containing the text response (for json format)
    textField: z.string().optional(),
    // Field containing usage info (for json format)
    usageField: z.string().optional(),
  })
  .default({ format: "text" });

// Streaming configuration
export const StreamingConfigSchema = z
  .object({
    // none: no streaming support
    // line: emit each line as text_delta
    // jsonl: parse JSON lines and emit as chunks
    mode: z.enum(["none", "line", "jsonl"]).default("none"),
  })
  .default({ mode: "none" });

// Args configuration - how to build command line arguments
export const ArgsConfigSchema = z
  .object({
    // Base arguments always included
    base: z.array(z.string()).default([]),
    // Flag to enable JSON output (e.g., "-o json" or "--format json")
    jsonFlag: z.string().optional(),
    // Flag to enable streaming
    streamFlag: z.string().optional(),
    // Flag for model selection (e.g., "--model")
    modelFlag: z.string().optional(),
    // Flag for file context (e.g., "-f" - will be repeated for each file)
    fileFlag: z.string().optional(),
    // Flag for max tokens (e.g., "--max-tokens")
    maxTokensFlag: z.string().optional(),
    // Flag for temperature (e.g., "--temperature" or "-t")
    temperatureFlag: z.string().optional(),
    // Flag for language (e.g., "--language" or "-l")
    languageFlag: z.string().optional(),
    // Flag for system prompt (e.g., "--system" or "-S")
    systemPromptFlag: z.string().optional(),
    // How to handle system prompt
    systemPromptMethod: z.enum(["flag", "combined"]).optional(),
  })
  .default({ base: [] });

// Error patterns - strings to match in stderr/stdout for error classification
export const ErrorPatternsSchema = z.record(z.array(z.string())).optional();

// Retry configuration schema
export const RetryConfigSchema = z
  .object({
    // Maximum number of retry attempts (1 = no retries)
    maxAttempts: z.number().default(1),
    // Initial delay between retries in milliseconds
    delayMs: z.number().default(1000),
    // Multiplier for exponential backoff
    backoffMultiplier: z.number().default(2),
    // Error kinds that should trigger a retry
    retryOn: z.array(z.string()).default(["TRANSIENT"]),
  })
  .optional();

// Main provider definition schema
export const ProviderDefinitionSchema = z.object({
  // Unique identifier for the provider
  id: z.string(),
  // Display name (defaults to id)
  displayName: z.string().optional(),
  // Path to the CLI binary
  binary: z.string(),
  // Subcommand to invoke (e.g., "exec", "run", "chat")
  subcommand: z.string().optional(),

  // Environment variables to set for the process
  env: z.record(z.string()).optional(),
  // Default working directory for the process
  defaultCwd: z.string().optional(),

  // Input handling configuration
  input: InputConfigSchema,
  // Output parsing configuration
  output: OutputConfigSchema,
  // Streaming configuration
  streaming: StreamingConfigSchema,
  // Arguments configuration
  args: ArgsConfigSchema,

  // Error patterns for classification
  errors: ErrorPatternsSchema,
  // Exit codes to treat as success (default: [0])
  allowedExitCodes: z.array(z.number()).default([0]),

  // Timeout in milliseconds (default: 60000 = 1 minute)
  timeoutMs: z.number().optional(),
  // Retry configuration for transient errors
  retry: RetryConfigSchema,

  // Capabilities this provider supports
  capabilities: z.array(z.string()).default(["generate"]),
});

// Inferred type from schema
export type ProviderDefinitionBase = z.infer<typeof ProviderDefinitionSchema>;

// Full provider definition including optional function overrides
export interface ProviderDefinition extends ProviderDefinitionBase {
  /**
   * Custom argument building logic.
   * Called instead of default arg building when provided.
   */
  buildArgs?: (req: CodingRequest) => string[];

  /**
   * Custom output parsing logic.
   * Called instead of default parsing when provided.
   */
  parseOutput?: (stdout: string) => { text: string; usage?: TokenUsage };

  /**
   * Custom error classification logic.
   * Called instead of default pattern matching when provided.
   */
  classifyError?: (ctx: ProviderErrorContext) => ProviderErrorKind;

  /**
   * Custom input handling.
   * Returns the string to pipe to stdin, or undefined to use args only.
   */
  getStdinInput?: (req: CodingRequest) => string | undefined;
}

// Input type for defineProvider (allows partial nested objects)
export type ProviderDefinitionInput = Omit<
  ProviderDefinition,
  "input" | "output" | "streaming" | "args" | "capabilities"
> & {
  input?: Partial<z.infer<typeof InputConfigSchema>>;
  output?: Partial<z.infer<typeof OutputConfigSchema>>;
  streaming?: Partial<z.infer<typeof StreamingConfigSchema>>;
  args?: Partial<z.infer<typeof ArgsConfigSchema>>;
  capabilities?: string[];
};

/**
 * Define a CLI provider with full TypeScript support.
 *
 * @example
 * ```typescript
 * export default defineProvider({
 *   id: "my-cli",
 *   binary: "my-cli",
 *   input: { method: "positional" },
 *   output: { format: "json", textField: "response" },
 * });
 * ```
 */
export function defineProvider(config: ProviderDefinitionInput): ProviderDefinition {
  // Validate base config with Zod
  const validated = ProviderDefinitionSchema.parse(config);

  // Merge with function overrides
  return {
    ...validated,
    buildArgs: config.buildArgs,
    parseOutput: config.parseOutput,
    classifyError: config.classifyError,
    getStdinInput: config.getStdinInput,
  };
}

// Default error patterns used when provider doesn't specify custom patterns
// Note: More specific patterns must be checked BEFORE broader ones
// The classifyError implementation iterates in insertion order
export const DEFAULT_ERROR_PATTERNS: Record<ProviderErrorKind, string[]> = {
  // Check rate limit first (before "limit exceeded" in OUT_OF_CREDITS)
  RATE_LIMIT: ["rate limit", "rate_limit", "429", "too many requests"],
  // Then check credits/quota
  OUT_OF_CREDITS: ["quota exceeded", "out of quota", "credits exhausted", "insufficient quota", "quota limit"],
  // Auth errors
  UNAUTHORIZED: ["401", "unauthorized", "invalid api key", "authentication failed"],
  FORBIDDEN: ["403", "forbidden", "access denied"],
  // Request errors
  BAD_REQUEST: ["400", "bad request", "invalid request", "malformed"],
  NOT_FOUND: ["404", "not found"],
  // Timeouts and limits
  TIMEOUT: ["timeout", "timed out", "deadline exceeded"],
  CONTEXT_LENGTH: ["context length", "too long", "max tokens", "context exceeded"],
  CONTENT_FILTER: ["content filter", "safety filter", "blocked by", "flagged"],
  // Server errors
  INTERNAL: ["500", "internal error", "server error"],
  // Transient/network
  TRANSIENT: ["network error", "connection refused", "econnrefused", "temporary failure"],
  // Unknown (empty, no patterns match)
  UNKNOWN: [],
};
