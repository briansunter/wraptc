/**
 * AdapterProviderBridge - Wrap adapters as Provider interface
 *
 * Enables adapters to work with the existing Router and ProviderFactory
 * for backward compatibility.
 */

import type { Provider, ProviderInvokeOptions } from "../providers/index";
import type {
  CodingEvent,
  CodingRequest,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInfo,
} from "../types";
import { AdapterError, AdapterRunner } from "./runner";
import type { AdapterDefinition } from "./types";

/**
 * Bridge that wraps an AdapterDefinition as a Provider
 */
export class AdapterProviderBridge implements Provider {
  readonly id: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly prefersJson: boolean;
  readonly capabilities?: string[];

  private runner: AdapterRunner;
  private def: AdapterDefinition;

  constructor(definition: AdapterDefinition) {
    this.def = definition;
    this.runner = new AdapterRunner(definition);

    this.id = definition.id;
    this.displayName = definition.displayName ?? definition.id;
    this.supportsStreaming = (definition.streaming ?? "none") !== "none";
    this.prefersJson = definition.output === "json";
    this.capabilities = definition.capabilities;
  }

  /**
   * Run the adapter once (non-streaming)
   */
  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions,
  ): Promise<{
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  }> {
    try {
      const result = await this.runner.run(req.prompt, {
        signal: opts.signal,
        cwd: opts.cwd,
        env: opts.env,
        timeoutMs: opts.timeoutMs,
      });

      return {
        text: result.text,
        usage: result.usage,
      };
    } catch (err) {
      // Re-throw adapter errors with proper context
      if (err instanceof AdapterError) {
        throw err;
      }
      throw err;
    }
  }

  /**
   * Run the adapter with streaming
   */
  async *runStream(req: CodingRequest, opts: ProviderInvokeOptions): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();

    yield {
      type: "start",
      provider: this.id,
      requestId,
    };

    try {
      for await (const chunk of this.runner.runStream(req.prompt, {
        signal: opts.signal,
        cwd: opts.cwd,
        env: opts.env,
        timeoutMs: opts.timeoutMs,
      })) {
        switch (chunk.type) {
          case "start":
            // Already emitted start, skip
            break;

          case "text":
            yield { type: "text_delta", text: chunk.content };
            break;

          case "json":
            yield { type: "chunk", data: chunk.data };
            break;

          case "complete":
            yield {
              type: "complete",
              provider: this.id,
              text: chunk.text,
              usage: chunk.usage,
            };
            break;

          case "error":
            yield {
              type: "error",
              provider: this.id,
              code: chunk.kind,
              message: chunk.message,
            };
            break;
        }
      }
    } catch (err) {
      const error = err as Error;
      const kind =
        err instanceof AdapterError ? err.kind : this.classifyError({ stderr: error.message });

      yield {
        type: "error",
        provider: this.id,
        code: kind,
        message: error.message,
      };
    }
  }

  /**
   * Classify an error
   */
  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const combined = ((error.stderr ?? "") + (error.stdout ?? "")).toLowerCase();

    // Check adapter-specific patterns first
    if (this.def.errorPatterns) {
      for (const [kind, patterns] of Object.entries(this.def.errorPatterns)) {
        if (patterns?.some((p) => combined.includes(p.toLowerCase()))) {
          return kind as ProviderErrorKind;
        }
      }
    }

    // Fall back to generic classification
    if (combined.includes("rate limit") || combined.includes("429")) {
      return "RATE_LIMIT";
    }
    if (combined.includes("unauthorized") || combined.includes("401")) {
      return "UNAUTHORIZED";
    }
    if (combined.includes("quota") || combined.includes("credits")) {
      return "OUT_OF_CREDITS";
    }
    if (combined.includes("timeout")) {
      return "TIMEOUT";
    }

    return "TRANSIENT";
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      id: this.id,
      displayName: this.displayName,
      supportsStreaming: this.supportsStreaming,
      prefersJson: this.prefersJson,
      capabilities: this.capabilities,
    };
  }
}

/**
 * Create a Provider from an AdapterDefinition
 */
export function createProviderFromAdapter(definition: AdapterDefinition): Provider {
  return new AdapterProviderBridge(definition);
}
