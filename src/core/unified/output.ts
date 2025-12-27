/**
 * Unified Output Types
 *
 * Provides a consistent output format across all providers.
 */

import type { TokenUsage } from "../types";

/**
 * Normalized output format - all providers produce this
 */
export interface IOutput {
  /** The text response */
  readonly text: string;

  /** Token usage (if available) */
  readonly usage?: TokenUsage;

  /** Response metadata */
  readonly meta: IOutputMeta;

  /** Original raw output (for debugging) */
  readonly raw?: unknown;
}

/**
 * Output metadata
 */
export interface IOutputMeta {
  readonly provider: string;
  readonly model?: string;
  readonly elapsedMs: number;
  readonly finishReason?: "stop" | "length" | "content_filter" | "error";
  readonly streamingMode?: "none" | "text" | "jsonl";
}

/**
 * Streaming output chunk types (unified)
 */
export type UnifiedStreamChunk =
  | { type: "start"; provider: string; model?: string; requestId: string }
  | { type: "text"; content: string }
  | { type: "json"; data: unknown }
  | { type: "usage"; usage: TokenUsage }
  | { type: "complete"; output: IOutput }
  | { type: "error"; error: IProviderError };

/**
 * Provider error interface
 */
export interface IProviderError {
  readonly message: string;
  readonly kind: string;
  readonly provider: string;
  readonly isRetryable: boolean;
}

/**
 * Output normalizer configuration
 */
export interface NormalizerConfig {
  /** Fields to check for text in JSON output */
  jsonTextFields: string[];
  /** Field containing usage info */
  jsonUsageField?: string;
  /** Fields to check for text in JSONL streaming */
  jsonlTextFields: string[];
}

/**
 * Default normalizer configuration
 */
export const DEFAULT_NORMALIZER_CONFIG: NormalizerConfig = {
  jsonTextFields: ["text", "response", "output", "content", "result", "message"],
  jsonUsageField: "usage",
  jsonlTextFields: ["text", "delta", "content"],
};

/**
 * Output normalizer - converts raw output to unified format
 */
export class OutputNormalizer {
  private config: NormalizerConfig;

  constructor(config: NormalizerConfig = DEFAULT_NORMALIZER_CONFIG) {
    this.config = config;
  }

  /**
   * Normalize raw text output
   */
  normalizeText(stdout: string, meta: Partial<IOutputMeta>): IOutput {
    return {
      text: stdout.trim(),
      meta: this.buildMeta(meta),
      raw: stdout,
    };
  }

  /**
   * Normalize JSON output
   */
  normalizeJson(stdout: string, meta: Partial<IOutputMeta>): IOutput {
    try {
      const parsed = JSON.parse(stdout);
      const text = this.extractTextField(parsed);
      const usage = this.extractUsage(parsed);

      return {
        text,
        usage,
        meta: this.buildMeta(meta),
        raw: parsed,
      };
    } catch {
      // Fall back to text normalization if JSON parsing fails
      return this.normalizeText(stdout, meta);
    }
  }

  /**
   * Normalize JSONL streaming output
   */
  *normalizeJsonl(lines: string[]): Generator<{ text?: string; usage?: TokenUsage }> {
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        const text = this.extractTextField(parsed);
        const usage = this.extractUsage(parsed);

        if (text) yield { text };
        if (usage) yield { usage };
      } catch {
        // Non-JSON line, emit as text
        yield { text: line };
      }
    }
  }

  private extractTextField(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (typeof obj !== "object" || obj === null) return String(obj);

    for (const field of this.config.jsonTextFields) {
      const value = this.getNestedField(obj, field);
      if (typeof value === "string") return value;
    }

    return JSON.stringify(obj);
  }

  private extractUsage(obj: unknown): TokenUsage | undefined {
    if (typeof obj !== "object" || obj === null) return undefined;

    const usageField = this.config.jsonUsageField;
    if (usageField) {
      const usage = this.getNestedField(obj, usageField);
      if (usage && typeof usage === "object") {
        return usage as TokenUsage;
      }
    }

    return undefined;
  }

  private getNestedField(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private buildMeta(partial: Partial<IOutputMeta>): IOutputMeta {
    return {
      provider: partial.provider || "unknown",
      model: partial.model,
      elapsedMs: partial.elapsedMs || 0,
      finishReason: partial.finishReason,
      streamingMode: partial.streamingMode,
    };
  }
}
