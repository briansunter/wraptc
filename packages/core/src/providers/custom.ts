import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
} from "../types";
import { BaseProvider, type ProviderInvokeOptions } from "./index";

export class CustomProvider extends BaseProvider {
  // Configurable output size limit (default 100MB)
  private readonly maxOutputSize: number = 100 * 1024 * 1024;

  constructor(id: string, config: ProviderConfig) {
    super(id, id, config);
  }

  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
    const args = this.buildArgs(req, opts);
    const needsStdin = !this.config.argsTemplate || !args.some((arg) => arg.includes(req.prompt));

    // Use Bun.spawn() for better performance
    const proc = Bun.spawn([this.config.binary, ...args], {
      cwd: opts?.cwd,
      stdin: needsStdin && req.prompt ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Send prompt to stdin if not using template
    if (needsStdin && req.prompt && proc.stdin) {
      proc.stdin.write(req.prompt);
      proc.stdin.end();
    }

    // Set up abort handler
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => {
        proc.kill();
      });
    }

    // Use array buffering instead of string concatenation
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let totalSize = 0;

    // Read stdout with size limit
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          stdoutChunks.push(text);
          totalSize += text.length;
          if (totalSize > this.maxOutputSize) {
            proc.kill();
            throw new Error(`Output exceeded maximum size limit of ${this.maxOutputSize} bytes`);
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Read stderr
    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          stderrChunks.push(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Wait for process to exit
    const exitCode = await proc.exited;

    // Check if aborted
    if (opts?.signal?.aborted) {
      throw new Error("Aborted");
    }

    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");

    if (exitCode === 0) {
      if (this.config.jsonMode !== "none") {
        return this.parseJsonOutput(stdout);
      }
      return { text: stdout };
    }

    throw new Error(`${this.displayName} CLI failed with code ${exitCode}: ${stderr}`);
  }

  async *runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();
    yield { type: "start", provider: this.id, requestId };

    const args = this.buildArgs(req, opts);
    const needsStdin = !this.config.argsTemplate || !this.config.argsTemplate.some((arg) => arg.includes("{{prompt}}"));

    // Use Bun.spawn() for streaming
    const proc = Bun.spawn([this.config.binary, ...args], {
      cwd: opts?.cwd,
      stdin: needsStdin && req.prompt ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Send prompt to stdin if not using template
    if (needsStdin && req.prompt && proc.stdin) {
      proc.stdin.write(req.prompt);
      proc.stdin.end();
    }

    // Use array buffering for fullText instead of string concatenation
    const fullTextChunks: string[] = [];
    // Line buffer for handling partial lines in JSONL mode
    let lineBuffer = "";

    // Stream stdout directly without accumulating
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          fullTextChunks.push(text);

          if (this.config.streamingMode === "jsonl") {
            // Buffer partial lines and emit complete lines
            lineBuffer += text;
            const lines = lineBuffer.split("\n");
            // Keep the last (potentially incomplete) line in the buffer
            lineBuffer = lines.pop() ?? "";

            for (const line of lines.filter(Boolean)) {
              try {
                const parsed = JSON.parse(line);
                yield { type: "chunk", data: parsed };
              } catch {
                yield { type: "text_delta", text: line };
              }
            }
          } else if (this.config.streamingMode === "line") {
            // Emit each line as a text_delta
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                yield { type: "text_delta", text: line + "\n" };
              }
            }
          } else {
            yield { type: "text_delta", text };
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Emit any remaining buffered line
    if (lineBuffer.trim()) {
      try {
        const parsed = JSON.parse(lineBuffer);
        yield { type: "chunk", data: parsed };
      } catch {
        yield { type: "text_delta", text: lineBuffer };
      }
    }

    // Collect stderr with array buffering (with 1MB limit)
    const stderrChunks: string[] = [];
    let stderrSize = 0;
    const maxStderrSize = 1024 * 1024; // 1MB limit

    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (stderrSize + text.length <= maxStderrSize) {
            stderrChunks.push(text);
            stderrSize += text.length;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Wait for process to exit
    const exitCode = await proc.exited;
    const fullText = fullTextChunks.join("");
    const stderr = stderrChunks.join("");

    if (exitCode === 0) {
      const result = this.config.jsonMode !== "none" ? this.parseJsonOutput(fullText) : { text: fullText };
      yield { type: "complete", provider: this.id, text: result.text, usage: result.usage };
    } else {
      yield {
        type: "error",
        provider: this.id,
        code: this.classifyError({ stderr, exitCode: exitCode || undefined }),
        message: stderr || `Process exited with code ${exitCode}`,
      };
    }
  }

  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";
    const combined = (stderr + stdout).toLowerCase();
    const exitCode = error.exitCode;
    const httpStatus = error.httpStatus;

    // HTTP status code based classification
    if (httpStatus) {
      if (httpStatus === 401) return "UNAUTHORIZED";
      if (httpStatus === 403) return "FORBIDDEN";
      if (httpStatus === 404) return "NOT_FOUND";
      if (httpStatus === 429) return "RATE_LIMIT";
      if (httpStatus >= 500) return "INTERNAL";
    }

    // Check for credit/rate limit errors
    if (combined.includes("quota") || combined.includes("credits") || combined.includes("limit exceeded")) {
      return "OUT_OF_CREDITS";
    }
    if (combined.includes("rate limit") || combined.includes("429") || combined.includes("too many requests")) {
      return "RATE_LIMIT";
    }

    // Authentication errors
    if (combined.includes("401") || combined.includes("unauthorized") || combined.includes("api key")) {
      return "UNAUTHORIZED";
    }
    if (combined.includes("403") || combined.includes("forbidden") || combined.includes("permission")) {
      return "FORBIDDEN";
    }

    // Content/context errors
    if (combined.includes("context length") || combined.includes("too long") || combined.includes("max.*token")) {
      return "CONTEXT_LENGTH";
    }
    if (combined.includes("content filter") || combined.includes("safety") || combined.includes("blocked")) {
      return "CONTENT_FILTER";
    }

    // Timeout errors
    if (combined.includes("timeout") || combined.includes("timed out") || combined.includes("deadline")) {
      return "TIMEOUT";
    }

    // Bad request
    if (combined.includes("400") || exitCode === 2 || combined.includes("invalid")) {
      return "BAD_REQUEST";
    }
    if (combined.includes("404") || combined.includes("not found")) {
      return "NOT_FOUND";
    }

    // Server errors
    if (combined.includes("500") || combined.includes("internal error") || combined.includes("server error")) {
      return "INTERNAL";
    }

    // Network or transient errors
    if (combined.includes("network") || combined.includes("connection") || combined.includes("econnrefused")) {
      return "TRANSIENT";
    }

    return "UNKNOWN";
  }

  protected buildArgs(req: CodingRequest, opts: ProviderInvokeOptions): string[] {
    // If argsTemplate is provided, use it with variable substitution
    if (this.config.argsTemplate && this.config.argsTemplate.length > 0) {
      return this.config.argsTemplate.map((arg) => {
        return arg
          .replace("{{prompt}}", req.prompt)
          .replace("{{mode}}", req.mode || "generate")
          .replace("{{language}}", req.language || "")
          .replace("{{temperature}}", req.temperature?.toString() || "0.7");
      });
    }

    // Otherwise use standard args with optional JSON flag
    const args = [...this.config.args];

    if (this.config.jsonMode === "flag" && this.config.jsonFlag) {
      args.push(this.config.jsonFlag);
    }

    return args;
  }
}
