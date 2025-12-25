// Types for wrap-terminalcoder
import { z } from "zod";

// Standard coding modes
export const CodingMode = {
  GENERATE: "generate",
  EDIT: "edit",
  EXPLAIN: "explain",
  TEST: "test",
  REVIEW: "review",
  REFACTOR: "refactor",
} as const;

export type CodingModeType = (typeof CodingMode)[keyof typeof CodingMode];

// Provider configuration schema
export const ProviderConfigSchema = z.object({
  binary: z.string(),
  args: z.array(z.string()).default([]),
  jsonMode: z.enum(["none", "flag"]).default("none"),
  jsonFlag: z.string().optional(),
  streamingMode: z.enum(["none", "line", "jsonl"]).default("none"),
  capabilities: z.array(z.string()).default([]),
  argsTemplate: z.array(z.string()).optional(),
  // New: default model for this provider
  defaultModel: z.string().optional(),
});

// Provider configuration type
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Provider invoke options
export interface ProviderInvokeOptions {
  signal?: AbortSignal;
  cwd?: string;
  // Environment variables to pass to the process (merged with provider defaults)
  env?: Record<string, string>;
  // Timeout in milliseconds (overrides provider default)
  timeoutMs?: number;
}

// Main configuration schema
export const ConfigSchema = z.object({
  routing: z.object({
    defaultOrder: z.array(z.string()),
    perModeOverride: z.record(z.array(z.string())).optional(),
  }),
  providers: z.record(ProviderConfigSchema),
  credits: z.object({
    providers: z.record(
      z.union([
        z.object({
          dailyRequestLimit: z.number(),
          resetHourUtc: z.number(),
        }),
        z.object({
          plan: z.string(),
        }),
      ]),
    ),
  }),
});

// Main configuration type
export type Config = z.infer<typeof ConfigSchema>;

// File context for providing code context
export const FileContextSchema = z.object({
  path: z.string(),
  content: z.string().optional(),
  language: z.string().optional(),
});

export type FileContext = z.infer<typeof FileContextSchema>;

// Coding request schema
export const CodingRequestSchema = z.object({
  // Required: the main prompt/instruction
  prompt: z.string(),
  // Optional: coding mode (generate, edit, explain, test, review, refactor)
  mode: z.string().optional(),
  // Optional: specific provider to use (bypasses routing)
  provider: z.string().optional(),
  // Optional: specific model to use (provider-specific)
  model: z.string().optional(),
  // Optional: enable streaming response
  stream: z.boolean().optional(),
  // Optional: file context (renamed from fileContext for consistency)
  files: z.array(z.union([z.string(), FileContextSchema])).optional(),
  // Optional: system prompt / instructions
  systemPrompt: z.string().optional(),
  // Optional: maximum output tokens
  maxTokens: z.number().optional(),
  // Optional: temperature (0-2, default varies by provider)
  temperature: z.number().min(0).max(2).optional(),
  // Optional: target language for code generation
  language: z.string().optional(),
  // Deprecated: use 'files' instead
  fileContext: z.array(z.string()).optional(),
});

// Coding request type
export interface CodingRequest {
  prompt: string;
  mode?: CodingModeType | string;
  provider?: string;
  model?: string;
  stream?: boolean;
  files?: (string | FileContext)[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  language?: string;
  /** @deprecated Use 'files' instead */
  fileContext?: string[];
}

// Token usage information
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// Response metadata
export interface ResponseMeta {
  elapsedMs?: number;
  model?: string;
  finishReason?: "stop" | "length" | "content_filter" | "error";
}

// Coding response type
export interface CodingResponse {
  provider: string;
  model?: string;
  text: string;
  usage?: TokenUsage;
  meta?: ResponseMeta;
}

// Streaming event types - unified naming
export type CodingEvent =
  // Stream started
  | { type: "start"; provider: string; model?: string; requestId: string }
  // Text content delta (incremental text)
  | { type: "text_delta"; text: string }
  // Structured chunk (for JSONL mode - parsed JSON object)
  | { type: "chunk"; data: unknown }
  // Stream completed successfully
  | {
      type: "complete";
      provider: string;
      model?: string;
      text: string;
      usage?: TokenUsage;
      finishReason?: "stop" | "length" | "content_filter";
    }
  // Error occurred
  | { type: "error"; provider: string; code: ProviderErrorKind; message: string };

// Error context type
export interface ProviderErrorContext {
  stderr?: string;
  stdout?: string;
  exitCode?: number | null;
  httpStatus?: number;
}

// Error kind enum - expanded
export type ProviderErrorKind =
  | "OUT_OF_CREDITS" // Provider credits/quota exhausted
  | "RATE_LIMIT" // Rate limit hit, retry after cooldown
  | "BAD_REQUEST" // Invalid request (malformed, missing params)
  | "UNAUTHORIZED" // Authentication failed (bad API key)
  | "FORBIDDEN" // Permission denied
  | "NOT_FOUND" // Resource not found (model, endpoint)
  | "TIMEOUT" // Request timed out
  | "CONTEXT_LENGTH" // Input too long for model
  | "CONTENT_FILTER" // Content blocked by safety filter
  | "INTERNAL" // Provider internal error
  | "TRANSIENT" // Temporary error, safe to retry
  | "UNKNOWN"; // Unknown error type

// Provider info type
export interface ProviderInfo {
  id: string;
  displayName: string;
  supportsStreaming: boolean;
  prefersJson: boolean;
  capabilities?: string[];
}

// Provider state type
export interface ProviderState {
  lastUsedAt?: string;
  requestsToday: number;
  lastReset?: string;
  outOfCreditsUntil?: string;
  lastErrors: string[];
}

// Full state type
export interface FullState {
  version: string;
  providers: Record<string, ProviderState>;
}
