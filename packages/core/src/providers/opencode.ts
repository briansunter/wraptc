/**
 * OpenCodeProvider - Provider for OpenCode agent delegation
 *
 * Uses 'opencode agent run' command with JSON output.
 * Provider ID: 'opencode' (also aliased as 'delegate' for compatibility)
 *
 * Key features:
 * - Runs via `opencode agent run <prompt> -f json -q`
 * - Supports file context via prompt injection
 * - JSON output parsing with summary extraction
 * - Files changed detection from output
 */
import type {
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInvokeOptions,
  TokenUsage,
} from "../types";
import { ProcessProvider } from "./index";

// Default error patterns specific to OpenCode
const OPENCODE_ERROR_PATTERNS: Record<ProviderErrorKind, string[]> = {
  RATE_LIMIT: [
    "rate limit",
    "too many requests",
    "429",
    "quota exceeded",
    "api limit exceeded",
  ],
  UNAUTHORIZED: [
    "authentication failed",
    "unauthorized",
    "api key invalid",
    "api key missing",
  ],
  FORBIDDEN: ["permission denied", "forbidden", "access denied"],
  NOT_FOUND: ["command not found", "no such file or directory"],
  TIMEOUT: ["timeout", "timed out", "deadline exceeded"],
  CONTEXT_LENGTH: ["context length", "too long", "max tokens"],
  CONTENT_FILTER: ["content filter", "blocked", "safety"],
  INTERNAL: ["internal error", "server error", "500"],
  TRANSIENT: ["temporarily unavailable", "service unavailable", "connection refused", "econnrefused", "network error"],
  OUT_OF_CREDITS: ["out of credits", "credits exhausted"],
  BAD_REQUEST: ["bad request", "invalid request", "malformed"],
  UNKNOWN: [],
};

export class OpenCodeProvider extends ProcessProvider {
  constructor(config: ProviderConfig) {
    super("opencode", "OpenCode Agent", {
      ...config,
      binary: config.binary || "opencode",
      // OpenCode uses -f json for JSON output
      jsonMode: "flag",
      jsonFlag: "-f",
      streamingMode: "none", // OpenCode doesn't support streaming
      capabilities: config.capabilities || ["generate", "edit", "explain", "test", "refactor"],
    });
  }

  /**
   * OpenCode uses positional prompt with args, not stdin
   */
  protected getStdinInput(): string | undefined {
    return undefined;
  }

  /**
   * Build args: opencode agent run <prompt> -f json -q
   */
  protected buildArgs(req: CodingRequest, _opts: ProviderInvokeOptions): string[] {
    const args: string[] = ["agent", "run"];

    // Build prompt with file context if provided
    let prompt = req.prompt;
    if (req.files && req.files.length > 0) {
      const fileList = req.files
        .map((f) => (typeof f === "string" ? f : f.path))
        .join("\n");
      prompt = `${prompt}\n\nFiles to consider:\n${fileList}`;
    }

    args.push(prompt);

    // Add JSON output flag and quiet mode
    args.push("-f", "json", "-q");

    // Add any additional args from config
    args.push(...this.config.args);

    return args;
  }

  /**
   * Parse OpenCode JSON output to extract text and usage
   */
  protected parseOutput(stdout: string): { text: string; usage?: TokenUsage } {
    try {
      const output = JSON.parse(stdout);

      // Extract text from various possible fields
      const text =
        output.summary ||
        output.response ||
        output.message ||
        output.output ||
        output.text ||
        this.extractSummaryFromText(stdout);

      return {
        text,
        usage: output.usage,
      };
    } catch {
      // Not JSON, extract summary from plain text
      return {
        text: this.extractSummaryFromText(stdout),
      };
    }
  }

  /**
   * Extract a summary from plain text output
   */
  private extractSummaryFromText(stdout: string): string {
    const lines = stdout.split("\n").filter((l) => l.trim());

    // Look for summary-like patterns
    for (const line of lines) {
      if (line.match(/completed|fixed|added|updated|created|implemented/i)) {
        return line.substring(0, 500);
      }
    }

    // Fallback: first non-empty line or truncated output
    return lines[0]?.substring(0, 500) || stdout.substring(0, 500);
  }

  /**
   * Classify errors with OpenCode-specific patterns
   */
  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const combined = ((error.stderr || "") + (error.stdout || "")).toLowerCase();

    for (const [kind, patterns] of Object.entries(OPENCODE_ERROR_PATTERNS)) {
      if (patterns.some((p) => combined.includes(p))) {
        return kind as ProviderErrorKind;
      }
    }

    // Check exit code for common error types
    if (error.exitCode === 127) {
      return "NOT_FOUND"; // Command not found
    }

    return "TRANSIENT";
  }

  /**
   * Extract files changed from OpenCode output (for result enrichment)
   */
  extractFilesChanged(stdout: string): string[] {
    const files: string[] = [];

    const filePatterns = [
      /(?:modified|changed|updated|created|edited):\s*([^\s]+)/gi,
      /File:\s*([^\s]+)/gi,
      /→\s*([^\s]+\.[a-z]{2,4})/gi,
      /```[\w]*\s*([^\s]+)/gi,
      /\[.*?\]\(([^)]+\.[a-z]{2,4})\)/gi,
    ];

    for (const pattern of filePatterns) {
      const matches = stdout.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          files.push(match[1]);
        }
      }
    }

    return [...new Set(files)];
  }
}

/**
 * Create an OpenCode provider with default or custom config
 */
export function createOpenCodeProvider(config?: Partial<ProviderConfig>): OpenCodeProvider {
  return new OpenCodeProvider({
    binary: "opencode",
    args: [],
    jsonMode: "flag",
    jsonFlag: "-f",
    streamingMode: "none",
    capabilities: ["generate", "edit", "explain", "test", "refactor"],
    ...config,
  });
}
