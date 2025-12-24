import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInvokeOptions,
} from "../types";
import { ProcessProvider } from "./index";

export class GeminiProvider extends ProcessProvider {
  constructor(config: ProviderConfig) {
    super("gemini", "Gemini CLI", config);
  }

  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
    const args = this.buildArgs(req, opts);
    const result = await this.executeProcess(args, req.prompt, opts);

    if (result.exitCode !== 0) {
      throw new Error(`Gemini CLI failed with code ${result.exitCode}: ${result.stderr}`);
    }

    if (this.config.jsonMode !== "none") {
      return this.parseJsonOutput(result.stdout);
    }

    return { text: result.stdout };
  }

  async *runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();
    yield { type: "start", provider: this.id, requestId };

    const args = this.buildArgs(req, opts);
    let fullText = "";

    try {
      for await (const chunk of this.streamProcess(args, req.prompt, opts)) {
        if (chunk.type === "stdout") {
          fullText += chunk.data;

          if (this.config.jsonMode !== "none" && this.config.streamingMode === "jsonl") {
            for (const line of chunk.data.split("\n").filter(Boolean)) {
              try {
                const parsed = JSON.parse(line);
                yield { type: "chunk", text: JSON.stringify(parsed) };
              } catch {
                yield { type: "delta", text: line };
              }
            }
          } else {
            yield { type: "delta", text: chunk.data };
          }
        }
      }

      const result = this.config.jsonMode !== "none" ? this.parseJsonOutput(fullText) : { text: fullText };
      yield { type: "complete", provider: this.id, text: result.text, usage: result.usage };
    } catch (error) {
      const err = error as Error;
      yield {
        type: "error",
        provider: this.id,
        code: this.classifyError({ stderr: err.message }),
        message: err.message,
      };
    }
  }

  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";
    const combined = (stderr + stdout).toLowerCase();

    if (combined.includes("quota exceeded") || combined.includes("out of quota")) {
      return "OUT_OF_CREDITS";
    }
    if (combined.includes("rate limit") || combined.includes("429")) {
      return "RATE_LIMIT";
    }
    if (combined.includes("400") || combined.includes("bad request")) {
      return "BAD_REQUEST";
    }
    if (combined.includes("500") || combined.includes("internal error")) {
      return "INTERNAL";
    }
    return "TRANSIENT";
  }
}
