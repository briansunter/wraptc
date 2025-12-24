import { spawn } from "node:child_process";
import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
} from "../types";
import { BaseProvider } from "./index";

// Memory configuration for optimization
interface MemoryConfig {
  maxBufferSize: number; // Maximum size for accumulated data (100MB)
  maxStreamSize: number; // Maximum size for streaming data (1GB)
}

const MEMORY_CONFIG: MemoryConfig = {
  maxBufferSize: 100 * 1024 * 1024, // 100MB
  maxStreamSize: 1024 * 1024 * 1024, // 1GB
};

class MemoryMonitor {
  private currentSize = 0;

  /**
   * Check if adding the specified size would exceed memory limits
   */
  checkLimit(size: number, limit: number = MEMORY_CONFIG.maxBufferSize): void {
    if (this.currentSize + size > limit) {
      throw new Error(`Memory limit exceeded: ${this.currentSize + size} bytes (limit: ${limit} bytes)`);
    }
    this.currentSize += size;
  }

  /**
   * Reset the memory monitor
   */
  reset(): void {
    this.currentSize = 0;
  }

  /**
   * Get current memory usage
   */
  getCurrentSize(): number {
    return this.currentSize;
  }
}

export class CodexProvider extends BaseProvider {
  private binaryPath: string;

  constructor(config: ProviderConfig) {
    super("codex", "Codex CLI", config);
    this.binaryPath = config.binary || "cdx";
  }

  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
    const args = this.buildArgs(req, opts);
    const monitor = new MemoryMonitor();

    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, {
        cwd: opts.cwd,
        env: { ...process.env },
      });

      // Use array buffering instead of string concatenation
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        monitor.checkLimit(text.length);
        stdoutChunks.push(text);
      });

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        monitor.checkLimit(text.length);
        stderrChunks.push(text);
      });

      proc.on("close", (code) => {
        const stdout = stdoutChunks.join("").trim();
        const stderr = stderrChunks.join("");

        if (code === 0) {
          resolve({ text: stdout });
        } else {
          reject(new Error(`Codex CLI failed with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      if (opts.signal) {
        opts.signal.addEventListener("abort", () => {
          proc.kill();
          reject(new Error("Aborted"));
        });
      }
    });
  }

  async *runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();
    yield { type: "start", provider: this.id, requestId };

    const proc = spawn(this.binaryPath, this.buildArgs(req, opts), {
      cwd: opts.cwd,
      env: { ...process.env },
    });

    const monitor = new MemoryMonitor();

    try {
      // Stream stdout directly without accumulation
      for await (const chunk of proc.stdout) {
        const text = chunk.toString();
        monitor.checkLimit(text.length, MEMORY_CONFIG.maxStreamSize);
        yield { type: "delta", text };
      }

      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on("close", resolve);
      });

      if (exitCode === 0) {
        // Only send completion event, don't accumulate full text
        yield { type: "complete", provider: this.id, text: "" };
      } else {
        // Only accumulate stderr for errors (typically smaller than stdout)
        let stderr = "";
        for await (const chunk of proc.stderr) {
          const text = chunk.toString();
          monitor.checkLimit(text.length);
          stderr += text;
        }
        yield {
          type: "error",
          provider: this.id,
          code: this.classifyError({ stderr, exitCode: exitCode || undefined }),
          message: stderr || `Process exited with code ${exitCode}`,
        };
      }
    } catch (error) {
      proc.kill();
      // Re-throw the error after cleaning up
      throw error;
    }
  }

  protected buildArgs(req: CodingRequest, opts: ProviderInvokeOptions): string[] {
    // Codex CLI supports non-interactive mode with -p flag or cdx wrapper
    const args: string[] = [];

    if (this.binaryPath === "cdx") {
      // cdx "prompt" format
      args.push(req.prompt);
      args.push(...this.config.args);
    } else {
      // codex -p "prompt" format
      args.push("-p", req.prompt);
      args.push(...this.config.args);
    }

    // Add mode-specific flags if available
    if (req.mode === "explain" && !args.includes("--explain")) {
      args.push("--explain");
    } else if (req.mode === "test" && !args.includes("--test")) {
      args.push("--test");
    } else if (req.mode === "edit" && !args.includes("--edit")) {
      args.push("--edit");
    }

    // File context
    if (req.fileContext && req.fileContext.length > 0) {
      for (const file of req.fileContext) {
        args.push("--file", file);
      }
    }

    return args;
  }

  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";
    const combined = (stderr + stdout).toLowerCase();
    const exitCode = error.exitCode;

    // Codex specific error patterns based on plan limits
    if (
      combined.includes("plan limit") ||
      combined.includes("quota exceeded") ||
      combined.includes("subscription required") ||
      combined.includes("insufficient quota")
    ) {
      return "OUT_OF_CREDITS";
    }
    if (
      combined.includes("rate limit") ||
      combined.includes("429") ||
      combined.includes("too many requests") ||
      combined.includes("rate_limit")
    ) {
      return "RATE_LIMIT";
    }
    if (combined.includes("401") || combined.includes("unauthorized") || combined.includes("api key")) {
      return "BAD_REQUEST";
    }
    if (combined.includes("400") || exitCode === 2) {
      return "BAD_REQUEST";
    }
    if (
      combined.includes("500") ||
      combined.includes("internal error") ||
      combined.includes("server error")
    ) {
      return "INTERNAL";
    }
    // Network or transient errors
    if (combined.includes("network") || combined.includes("timeout") || combined.includes("connection")) {
      return "TRANSIENT";
    }
    // Codex specific errors
    if (combined.includes("no such file") || combined.includes("command not found")) {
      return "BAD_REQUEST";
    }
    if (combined.includes("permission denied")) {
      return "INTERNAL";
    }

    return "TRANSIENT";
  }
}
