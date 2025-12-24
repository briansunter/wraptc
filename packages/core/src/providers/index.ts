import { join } from "node:path";
import type {
  CodingEvent,
  CodingRequest,
  CodingResponse,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInfo,
  ProviderInvokeOptions,
  TokenUsage,
} from "../types";
import { DEFAULT_ERROR_PATTERNS } from "../define-provider";

// Re-export ProviderInvokeOptions for convenience
export type { ProviderInvokeOptions };

export interface Provider {
  readonly id: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly prefersJson: boolean;
  readonly capabilities?: string[];

  runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }>;

  runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent>;

  classifyError(error: ProviderErrorContext): ProviderErrorKind;

  getInfo(): ProviderInfo;
}

export abstract class BaseProvider implements Provider {
  public readonly id: string;
  public readonly displayName: string;
  public readonly supportsStreaming: boolean;
  public readonly prefersJson: boolean;
  public readonly capabilities?: string[];
  protected config: ProviderConfig;

  constructor(id: string, displayName: string, config: ProviderConfig) {
    this.id = id;
    this.displayName = displayName;
    this.config = config;
    this.supportsStreaming = config.streamingMode !== "none";
    this.prefersJson = config.jsonMode !== "none";
    this.capabilities = config.capabilities;
  }

  // These are implemented in ProcessProvider with defaults
  // Subclasses can override for custom behavior
  abstract runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: TokenUsage }>;

  abstract runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent>;

  abstract classifyError(error: ProviderErrorContext): ProviderErrorKind;

  getInfo(): ProviderInfo {
    return {
      id: this.id,
      displayName: this.displayName,
      supportsStreaming: this.supportsStreaming,
      prefersJson: this.prefersJson,
      capabilities: this.capabilities,
    };
  }

  protected async ensureConfigDir(): Promise<string> {
    const configDir = join(process.env.HOME || "~", ".config", "wrap-terminalcoder");
    // Use Bun's built-in mkdir via shell
    await Bun.$`mkdir -p ${configDir}`.quiet();
    return configDir;
  }

  protected buildArgs(req: CodingRequest, opts: ProviderInvokeOptions): string[] {
    const args = [...this.config.args];

    if (this.config.argsTemplate) {
      return this.config.argsTemplate.map((arg) => {
        return arg.replace("{{prompt}}", req.prompt);
      });
    }

    if (this.config.jsonMode === "flag" && this.config.jsonFlag) {
      args.push(this.config.jsonFlag);
    }

    return args;
  }

  protected parseJsonOutput(stdout: string): { text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } {
    try {
      const parsed = JSON.parse(stdout);
      return {
        text: parsed.text || parsed.response || parsed.output || stdout,
        usage: parsed.usage,
      };
    } catch {
      return { text: stdout };
    }
  }
}

export abstract class ProcessProvider extends BaseProvider {
  protected readonly binaryPath: string;
  // Configurable output size limit (default 100MB)
  protected readonly maxOutputSize: number = 100 * 1024 * 1024;

  constructor(id: string, displayName: string, config: ProviderConfig) {
    super(id, displayName, config);
    this.binaryPath = config.binary;
  }

  protected async executeProcess(
    args: string[],
    input?: string,
    opts?: ProviderInvokeOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    // Use Bun.spawn() for better performance
    const proc = Bun.spawn([this.binaryPath, ...args], {
      cwd: opts?.cwd,
      stdin: input ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Write input to stdin if provided
    if (input && proc.stdin) {
      proc.stdin.write(input);
      proc.stdin.end();
    }

    // Set up abort handler
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => {
        proc.kill();
      });
    }

    // Read stdout and stderr using Bun's streaming APIs
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let totalSize = 0;

    // Read stdout
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

    return {
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      exitCode,
    };
  }

  protected async *streamProcess(
    args: string[],
    input?: string,
    opts?: ProviderInvokeOptions
  ): AsyncGenerator<{ type: "stdout" | "stderr"; data: string }> {
    // Use Bun.spawn() for streaming
    const proc = Bun.spawn([this.binaryPath, ...args], {
      cwd: opts?.cwd,
      stdin: input ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Write input to stdin if provided
    if (input && proc.stdin) {
      proc.stdin.write(input);
      proc.stdin.end();
    }

    // Stream stdout chunks directly without accumulation
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield { type: "stdout", data: decoder.decode(value, { stream: true }) };
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Collect stderr for error reporting (with 1MB limit)
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

    if (stderrChunks.length > 0) {
      yield { type: "stderr", data: stderrChunks.join("") };
    }

    // Wait for process to complete
    await proc.exited;
  }

  /**
   * Default runOnce implementation.
   * Subclasses can override for custom behavior.
   */
  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const args = this.buildArgs(req, opts);
    const input = this.getStdinInput(req);
    const result = await this.executeProcess(args, input, opts);

    if (result.exitCode !== 0) {
      throw new Error(`${this.displayName} failed with code ${result.exitCode}: ${result.stderr}`);
    }

    return this.parseOutput(result.stdout);
  }

  /**
   * Default runStream implementation.
   * Subclasses can override for custom behavior.
   */
  async *runStream(
    req: CodingRequest,
    opts: ProviderInvokeOptions
  ): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();
    yield { type: "start", provider: this.id, requestId };

    const args = this.buildArgs(req, opts);
    const input = this.getStdinInput(req);
    const fullTextChunks: string[] = [];

    for await (const chunk of this.streamProcess(args, input, opts)) {
      if (chunk.type === "stdout") {
        const text = chunk.data;
        fullTextChunks.push(text);

        if (this.config.streamingMode === "jsonl") {
          // Try to parse as JSONL
          for (const line of text.split("\n").filter(Boolean)) {
            try {
              const parsed = JSON.parse(line);
              yield { type: "chunk", data: parsed };
            } catch {
              yield { type: "text_delta", text: line };
            }
          }
        } else {
          yield { type: "text_delta", text };
        }
      } else if (chunk.type === "stderr") {
        yield {
          type: "error",
          provider: this.id,
          code: this.classifyError({ stderr: chunk.data }),
          message: chunk.data,
        };
      }
    }

    const fullText = fullTextChunks.join("");
    const result = this.parseOutput(fullText);
    yield { type: "complete", provider: this.id, text: result.text, usage: result.usage };
  }

  /**
   * Default error classification using DEFAULT_ERROR_PATTERNS.
   * Subclasses can override for provider-specific patterns.
   */
  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const combined = ((error.stderr || "") + (error.stdout || "")).toLowerCase();

    for (const [kind, patterns] of Object.entries(DEFAULT_ERROR_PATTERNS)) {
      if (patterns.some((p) => combined.includes(p.toLowerCase()))) {
        return kind as ProviderErrorKind;
      }
    }

    return "TRANSIENT";
  }

  /**
   * Get stdin input for the process.
   * Override in subclass if needed.
   */
  protected getStdinInput(req: CodingRequest): string | undefined {
    // Default: pipe prompt to stdin
    return req.prompt;
  }

  /**
   * Parse output from the process.
   * Override in subclass if needed.
   */
  protected parseOutput(stdout: string): { text: string; usage?: TokenUsage } {
    if (this.config.jsonMode !== "none") {
      return this.parseJsonOutput(stdout);
    }
    return { text: stdout.trim() };
  }
}
