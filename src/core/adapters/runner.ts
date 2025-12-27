/**
 * AdapterRunner - Core execution engine for adapters
 *
 * Handles process execution, input/output handling, streaming, and error classification.
 */

import { DEFAULT_ERROR_PATTERNS } from "../define-provider";
import type { ProviderErrorKind, TokenUsage } from "../types";
import type {
  AdapterDefinition,
  AdapterInvokeOptions,
  AdapterResult,
  InputMethod,
  OutputFormat,
  StreamChunk,
} from "./types";

/**
 * AdapterRunner executes adapter definitions against CLI tools
 */
export class AdapterRunner {
  private def: AdapterDefinition;

  constructor(definition: AdapterDefinition) {
    this.def = definition;
  }

  /**
   * Run the adapter and return the result
   */
  async run(prompt: string, opts: AdapterInvokeOptions = {}): Promise<AdapterResult> {
    const args = this.buildArgs(prompt, opts);
    const stdin = this.getStdin(prompt);
    const timeout = opts.timeoutMs ?? this.def.timeoutMs ?? 60000;

    // Set up timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build command array
      const command = [this.def.binary];
      if (this.def.subcommand) {
        command.push(this.def.subcommand);
      }
      command.push(...args);

      // Spawn the process
      const proc = Bun.spawn(command, {
        cwd: opts.cwd,
        env: { ...process.env, ...this.def.env, ...opts.env },
        stdin: stdin !== undefined ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });

      // Write stdin if provided
      if (stdin !== undefined && proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      // Handle abort signals
      const combinedSignal =
        opts.signal && controller.signal
          ? AbortSignal.any([opts.signal, controller.signal])
          : (opts.signal ?? controller.signal);

      combinedSignal.addEventListener("abort", () => proc.kill());

      // Read stdout and stderr
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Check for errors
      const allowed = this.def.allowedExitCodes ?? [0];
      if (!allowed.includes(exitCode ?? -1)) {
        const kind = this.classifyError(stderr, stdout, exitCode);
        const error = new AdapterError(
          `${this.def.displayName ?? this.def.id} failed with exit code ${exitCode}: ${stderr || stdout}`,
          kind,
          this.def.id,
          { stderr, stdout, exitCode },
        );
        throw error;
      }

      return this.parseOutput(stdout);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Run the adapter with streaming output
   */
  async *runStream(prompt: string, opts: AdapterInvokeOptions = {}): AsyncGenerator<StreamChunk> {
    const requestId = crypto.randomUUID();
    yield { type: "start", requestId };

    const args = this.buildArgs(prompt, opts);
    const stdin = this.getStdin(prompt);
    const timeout = opts.timeoutMs ?? this.def.timeoutMs ?? 60000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build command array
      const command = [this.def.binary];
      if (this.def.subcommand) {
        command.push(this.def.subcommand);
      }
      command.push(...args);

      const proc = Bun.spawn(command, {
        cwd: opts.cwd,
        env: { ...process.env, ...this.def.env, ...opts.env },
        stdin: stdin !== undefined ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });

      if (stdin !== undefined && proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      const combinedSignal =
        opts.signal && controller.signal
          ? AbortSignal.any([opts.signal, controller.signal])
          : (opts.signal ?? controller.signal);

      combinedSignal.addEventListener("abort", () => proc.kill());

      // Stream stdout
      const fullTextChunks: string[] = [];
      const streamingMode = this.def.streaming ?? "none";

      if (proc.stdout) {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            fullTextChunks.push(text);

            if (streamingMode === "none") {
              // No streaming - just accumulate
              continue;
            }

            if (streamingMode === "line" || streamingMode === "jsonl") {
              // Line-based streaming
              buffer += text;
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

              for (const line of lines) {
                if (!line.trim()) continue;
                const chunk = this.parseStreamLine(line);
                if (chunk) yield chunk;
              }
            }
          }

          // Handle remaining buffer
          if (buffer.trim() && streamingMode !== "none") {
            const chunk = this.parseStreamLine(buffer);
            if (chunk) yield chunk;
          }
        } finally {
          reader.releaseLock();
        }
      }

      // Collect stderr
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Check for errors
      const allowed = this.def.allowedExitCodes ?? [0];
      if (!allowed.includes(exitCode ?? -1)) {
        const kind = this.classifyError(stderr, fullTextChunks.join(""), exitCode);
        yield {
          type: "error",
          message: stderr || `Exit code ${exitCode}`,
          kind,
        };
        return;
      }

      // Emit complete event
      const fullText = fullTextChunks.join("");
      const result = this.parseOutput(fullText);
      yield { type: "complete", text: result.text, usage: result.usage };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build command line arguments
   */
  private buildArgs(prompt: string, opts: AdapterInvokeOptions): string[] {
    // Use custom hook if provided
    if (this.def.buildArgs) {
      return this.def.buildArgs(prompt, opts);
    }

    const args: string[] = [];

    // Add static args
    if (this.def.args) {
      args.push(...this.def.args);
    }

    // Add prompt based on input method
    const input = this.def.input ?? "stdin";

    if (input === "positional") {
      args.push(prompt);
    } else if (typeof input === "object" && input.flag) {
      args.push(input.flag, prompt);
    }
    // stdin: handled separately via getStdin

    return args;
  }

  /**
   * Get stdin input for the process
   */
  private getStdin(prompt: string): string | undefined {
    // Use custom hook if provided
    if (this.def.getStdin) {
      return this.def.getStdin(prompt);
    }

    const input = this.def.input ?? "stdin";
    return input === "stdin" ? prompt : undefined;
  }

  /**
   * Parse output from the process
   */
  private parseOutput(stdout: string): AdapterResult {
    // Use custom hook if provided
    if (this.def.parseOutput) {
      return this.def.parseOutput(stdout);
    }

    const output = this.def.output ?? "text";

    if (output === "text") {
      return { text: stdout.trim() };
    }

    if (output === "json") {
      return this.parseJsonOutput(stdout);
    }

    // jsonPath extraction
    if (typeof output === "object" && output.jsonPath) {
      try {
        const parsed = JSON.parse(stdout);
        const text = this.getJsonPath(parsed, output.jsonPath);
        return { text: String(text ?? stdout.trim()) };
      } catch {
        return { text: stdout.trim() };
      }
    }

    return { text: stdout.trim() };
  }

  /**
   * Parse JSON output with common field extraction
   */
  private parseJsonOutput(stdout: string): AdapterResult {
    try {
      const parsed = JSON.parse(stdout);

      // Try common text fields
      const textFields = ["text", "response", "output", "content", "result", "message"];
      let text = stdout.trim();

      for (const field of textFields) {
        if (typeof parsed[field] === "string") {
          text = parsed[field];
          break;
        }
      }

      // Extract usage if present
      const usage = parsed.usage as TokenUsage | undefined;

      return { text, usage };
    } catch {
      return { text: stdout.trim() };
    }
  }

  /**
   * Parse a streaming line
   */
  private parseStreamLine(line: string): StreamChunk | null {
    // Use custom hook if provided
    if (this.def.parseStreamChunk) {
      return this.def.parseStreamChunk(line);
    }

    const streamingMode = this.def.streaming ?? "line";

    if (streamingMode === "jsonl") {
      try {
        const parsed = JSON.parse(line);
        return { type: "json", data: parsed };
      } catch {
        return { type: "text", content: line };
      }
    }

    return { type: "text", content: line };
  }

  /**
   * Classify an error based on stderr/stdout content
   */
  private classifyError(
    stderr: string,
    stdout: string,
    exitCode: number | null,
  ): ProviderErrorKind {
    // Use custom hook if provided
    if (this.def.classifyError) {
      return this.def.classifyError(stderr, stdout, exitCode);
    }

    const combined = (stderr + stdout).toLowerCase();

    // Check adapter-specific patterns first
    if (this.def.errorPatterns) {
      for (const [kind, patterns] of Object.entries(this.def.errorPatterns)) {
        if (patterns?.some((p) => combined.includes(p.toLowerCase()))) {
          return kind as ProviderErrorKind;
        }
      }
    }

    // Fall back to default patterns
    for (const [kind, patterns] of Object.entries(DEFAULT_ERROR_PATTERNS)) {
      if (patterns.some((p) => combined.includes(p.toLowerCase()))) {
        return kind as ProviderErrorKind;
      }
    }

    return "TRANSIENT";
  }

  /**
   * Get a nested value from an object by path
   */
  private getJsonPath(obj: unknown, path: string): unknown {
    return path.split(".").reduce((o, k) => {
      if (o === null || o === undefined) return undefined;
      return (o as Record<string, unknown>)[k];
    }, obj);
  }

  /**
   * Get adapter info
   */
  getInfo() {
    return {
      id: this.def.id,
      displayName: this.def.displayName ?? this.def.id,
      description: this.def.description,
      version: this.def.version,
      binary: this.def.binary,
      capabilities: this.def.capabilities ?? ["generate"],
      supportsStreaming: (this.def.streaming ?? "none") !== "none",
    };
  }
}

/**
 * Custom error class for adapter failures
 */
export class AdapterError extends Error {
  readonly kind: ProviderErrorKind;
  readonly adapterId: string;
  readonly context: {
    stderr?: string;
    stdout?: string;
    exitCode?: number | null;
  };

  constructor(
    message: string,
    kind: ProviderErrorKind,
    adapterId: string,
    context: { stderr?: string; stdout?: string; exitCode?: number | null },
  ) {
    super(message);
    this.name = "AdapterError";
    this.kind = kind;
    this.adapterId = adapterId;
    this.context = context;
  }

  get isRetryable(): boolean {
    return ["TRANSIENT", "RATE_LIMIT", "TIMEOUT"].includes(this.kind);
  }

  get isUserError(): boolean {
    return ["BAD_REQUEST", "UNAUTHORIZED", "CONTEXT_LENGTH", "CONTENT_FILTER"].includes(this.kind);
  }
}

/**
 * Test helper interface that exposes private methods for testing.
 * Only use this in test files.
 */
// @ts-ignore - Test helper accessing private methods
export interface AdapterRunnerTestHelper extends AdapterRunner {
  buildArgs(prompt: string, opts: AdapterInvokeOptions): string[];
  getStdin(prompt: string): string | undefined;
  parseOutput(stdout: string): AdapterResult;
  parseJsonOutput(stdout: string): AdapterResult;
  parseStreamLine(line: string): StreamChunk | null;
}
