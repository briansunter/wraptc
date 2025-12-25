/**
 * ConfigurableProvider - Provider implementation driven by ProviderDefinition
 *
 * This is the core implementation that enables config-only providers.
 * Users can add new CLI tools by creating a .ts file with defineProvider().
 *
 * Phase 2 features:
 * - Environment variables with ${VAR} interpolation
 * - Timeout configuration with AbortController
 * - System prompt support (flag or combined method)
 * - Request parameters (maxTokens, temperature, language)
 * - Subcommand support
 * - Non-zero exit code handling (allowedExitCodes)
 * - Retry logic with exponential backoff
 * - Default working directory
 */

import { DEFAULT_ERROR_PATTERNS, type ProviderDefinition } from "../define-provider";
import type {
  CodingEvent,
  CodingRequest,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInfo,
  TokenUsage,
} from "../types";
import type { Provider, ProviderInvokeOptions } from "./index";

// Default timeout: 60 seconds
const DEFAULT_TIMEOUT_MS = 60_000;

export class ConfigurableProvider implements Provider {
  public readonly id: string;
  public readonly displayName: string;
  public readonly supportsStreaming: boolean;
  public readonly prefersJson: boolean;
  public readonly capabilities?: string[];

  private readonly definition: ProviderDefinition;
  private readonly maxOutputSize: number = 100 * 1024 * 1024; // 100MB

  constructor(definition: ProviderDefinition) {
    this.definition = definition;
    this.id = definition.id;
    this.displayName = definition.displayName || definition.id;
    this.supportsStreaming = definition.streaming.mode !== "none";
    this.prefersJson = definition.output.format !== "text";
    this.capabilities = definition.capabilities;
  }

  /**
   * Interpolate environment variables in a value.
   * Supports ${VAR} syntax, falling back to process.env.
   */
  private interpolateEnvValue(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || "";
    });
  }

  /**
   * Build environment variables object.
   * Merges process.env + provider defaults + invocation overrides.
   * Interpolates ${VAR} syntax in provider-defined values.
   */
  private buildEnv(opts?: ProviderInvokeOptions): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    // Add provider-defined environment variables with interpolation
    if (this.definition.env) {
      for (const [key, value] of Object.entries(this.definition.env)) {
        env[key] = this.interpolateEnvValue(value);
      }
    }

    // Override with invocation-specific environment variables
    if (opts?.env) {
      for (const [key, value] of Object.entries(opts.env)) {
        env[key] = value;
      }
    }

    return env;
  }

  /**
   * Get the effective prompt, handling system prompt combination if needed.
   */
  private getEffectivePrompt(req: CodingRequest): string {
    // If system prompt should be combined with the main prompt
    if (req.systemPrompt && this.definition.args.systemPromptMethod === "combined") {
      return `${req.systemPrompt}\n\n${req.prompt}`;
    }
    return req.prompt;
  }

  /**
   * Build command line arguments based on config
   */
  protected buildArgs(req: CodingRequest): string[] {
    // Use custom buildArgs if provided
    if (this.definition.buildArgs) {
      return this.definition.buildArgs(req);
    }

    const args: string[] = [];
    const config = this.definition;

    // Add subcommand first if configured (e.g., "exec", "run", "chat")
    if (config.subcommand) {
      args.push(config.subcommand);
    }

    // Add base arguments
    args.push(...config.args.base);

    // Add JSON flag if configured
    if (config.args.jsonFlag && config.output.format === "json") {
      // Handle flags like "-o json" (split on space)
      const parts = config.args.jsonFlag.split(" ");
      args.push(...parts);
    }

    // Add model flag if configured and model provided
    if (config.args.modelFlag && req.model) {
      args.push(config.args.modelFlag, req.model);
    }

    // Add system prompt flag if configured and system prompt provided
    if (
      config.args.systemPromptFlag &&
      req.systemPrompt &&
      config.args.systemPromptMethod !== "combined"
    ) {
      args.push(config.args.systemPromptFlag, req.systemPrompt);
    }

    // Add request parameter flags
    if (config.args.maxTokensFlag && req.maxTokens !== undefined) {
      args.push(config.args.maxTokensFlag, String(req.maxTokens));
    }
    if (config.args.temperatureFlag && req.temperature !== undefined) {
      args.push(config.args.temperatureFlag, String(req.temperature));
    }
    if (config.args.languageFlag && req.language) {
      args.push(config.args.languageFlag, req.language);
    }

    // Add file flags if configured
    if (config.args.fileFlag && req.files?.length) {
      for (const file of req.files) {
        const path = typeof file === "string" ? file : file.path;
        args.push(config.args.fileFlag, path);
      }
    }

    // Get effective prompt (may include combined system prompt)
    const effectivePrompt = this.getEffectivePrompt(req);

    // Add prompt based on input method
    if (config.input.method === "positional") {
      if (config.input.position === "first") {
        // Insert after subcommand if present
        const insertIndex = config.subcommand ? 1 : 0;
        args.splice(insertIndex, 0, effectivePrompt);
      } else {
        args.push(effectivePrompt);
      }
    } else if (config.input.method === "flag" && config.input.flag) {
      args.push(config.input.flag, effectivePrompt);
    }
    // stdin method: prompt is piped, not added to args

    return args;
  }

  /**
   * Get stdin input based on config
   */
  protected getStdinInput(req: CodingRequest): string | undefined {
    // Use custom getStdinInput if provided
    if (this.definition.getStdinInput) {
      return this.definition.getStdinInput(req);
    }

    // Only pipe to stdin if method is stdin
    if (this.definition.input.method === "stdin") {
      // Use effective prompt which may include combined system prompt
      return this.getEffectivePrompt(req);
    }

    return undefined;
  }

  /**
   * Check if an exit code is considered successful
   */
  private isSuccessExitCode(exitCode: number | null): boolean {
    if (exitCode === null) return false;
    const allowedCodes = this.definition.allowedExitCodes || [0];
    return allowedCodes.includes(exitCode);
  }

  /**
   * Get the effective timeout in milliseconds
   */
  private getTimeoutMs(opts?: ProviderInvokeOptions): number {
    return opts?.timeoutMs ?? this.definition.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Get the effective working directory
   */
  private getCwd(opts?: ProviderInvokeOptions): string | undefined {
    return opts?.cwd ?? this.definition.defaultCwd;
  }

  /**
   * Parse output based on config
   */
  protected parseOutput(stdout: string): { text: string; usage?: TokenUsage } {
    // Use custom parseOutput if provided
    if (this.definition.parseOutput) {
      return this.definition.parseOutput(stdout);
    }

    const config = this.definition.output;

    if (config.format === "text") {
      return { text: stdout.trim() };
    }

    try {
      const parsed = JSON.parse(stdout);
      const text = config.textField
        ? this.getNestedField(parsed, config.textField)
        : parsed.text || parsed.response || parsed.output || stdout;
      const usage = config.usageField
        ? this.getNestedField(parsed, config.usageField)
        : parsed.usage;

      return { text: String(text), usage };
    } catch {
      // Fall back to raw output if JSON parsing fails
      return { text: stdout.trim() };
    }
  }

  /**
   * Get a nested field from an object using dot notation
   */
  private getNestedField(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Classify an error based on patterns
   */
  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    // Use custom classifyError if provided
    if (this.definition.classifyError) {
      return this.definition.classifyError(error);
    }

    const combined = ((error.stderr || "") + (error.stdout || "")).toLowerCase();

    // Check provider-specific patterns first
    const providerPatterns = this.definition.errors || {};
    for (const [kind, patterns] of Object.entries(providerPatterns)) {
      if (patterns.some((p) => combined.includes(p.toLowerCase()))) {
        return kind as ProviderErrorKind;
      }
    }

    // Then check default patterns
    for (const [kind, patterns] of Object.entries(DEFAULT_ERROR_PATTERNS)) {
      if (patterns.some((p) => combined.includes(p.toLowerCase()))) {
        return kind as ProviderErrorKind;
      }
    }

    return "UNKNOWN";
  }

  /**
   * Execute a single request (internal implementation without retry)
   */
  private async executeOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions,
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const args = this.buildArgs(req);
    const stdin = this.getStdinInput(req);
    const env = this.buildEnv(opts);
    const cwd = this.getCwd(opts);
    const timeoutMs = this.getTimeoutMs(opts);

    // Create AbortController for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine with user-provided signal if any
    const combinedSignal = opts?.signal
      ? AbortSignal.any([opts.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const proc = Bun.spawn([this.definition.binary, ...args], {
        cwd,
        env,
        stdin: stdin ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });

      // Write to stdin if needed
      if (stdin && proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      // Set up abort handler
      combinedSignal.addEventListener("abort", () => {
        proc.kill();
      });

      // Read output with size limit
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let totalSize = 0;

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
              throw new Error("Output exceeded maximum size limit");
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

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

      const exitCode = await proc.exited;
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");

      // Check if timed out
      if (timeoutController.signal.aborted) {
        const error = new Error(`${this.displayName} timed out after ${timeoutMs}ms`);
        (error as Error & { code: string }).code = "TIMEOUT";
        throw error;
      }

      // Check if user aborted
      if (opts?.signal?.aborted) {
        throw new Error("Aborted");
      }

      // Check exit code against allowed codes
      if (!this.isSuccessExitCode(exitCode)) {
        const error = new Error(`${this.displayName} failed with code ${exitCode}: ${stderr}`);
        (error as Error & { exitCode: number; stderr: string }).exitCode = exitCode ?? -1;
        (error as Error & { exitCode: number; stderr: string }).stderr = stderr;
        throw error;
      }

      return this.parseOutput(stdout);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute a single request with retry logic
   */
  async runOnce(
    req: CodingRequest,
    opts: ProviderInvokeOptions,
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const retryConfig = this.definition.retry;
    const maxAttempts = retryConfig?.maxAttempts ?? 1;
    const delayMs = retryConfig?.delayMs ?? 1000;
    const backoffMultiplier = retryConfig?.backoffMultiplier ?? 2;
    const retryOn = retryConfig?.retryOn ?? ["TRANSIENT"];

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeOnce(req, opts);
      } catch (err) {
        lastError = err as Error;

        // Check if user aborted - don't retry
        if (opts?.signal?.aborted) {
          throw err;
        }

        // Classify the error
        const errorKind = this.classifyError({
          stderr: (err as Error & { stderr?: string }).stderr || (err as Error).message,
          exitCode: (err as Error & { exitCode?: number }).exitCode,
        });

        // Check if this error kind should trigger a retry
        if (!retryOn.includes(errorKind)) {
          throw err; // Not retryable
        }

        // Don't retry on last attempt
        if (attempt >= maxAttempts) {
          throw err;
        }

        // Wait before retrying with exponential backoff
        const waitTime = delayMs * backoffMultiplier ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError || new Error("Unknown error");
  }

  /**
   * Execute a streaming request
   */
  async *runStream(req: CodingRequest, opts: ProviderInvokeOptions): AsyncGenerator<CodingEvent> {
    const requestId = crypto.randomUUID();
    yield { type: "start", provider: this.id, requestId };

    const args = this.buildArgs(req);
    const stdin = this.getStdinInput(req);
    const env = this.buildEnv(opts);
    const cwd = this.getCwd(opts);
    const timeoutMs = this.getTimeoutMs(opts);

    // Create AbortController for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine with user-provided signal if any
    const combinedSignal = opts?.signal
      ? AbortSignal.any([opts.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const proc = Bun.spawn([this.definition.binary, ...args], {
        cwd,
        env,
        stdin: stdin ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });

      // Write to stdin if needed
      if (stdin && proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      // Set up abort handler
      combinedSignal.addEventListener("abort", () => {
        proc.kill();
      });

      const fullTextChunks: string[] = [];
      let lineBuffer = "";

      // Stream stdout
      if (proc.stdout) {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            fullTextChunks.push(text);

            const streamMode = this.definition.streaming.mode;

            if (streamMode === "jsonl") {
              // Buffer partial lines
              lineBuffer += text;
              const lines = lineBuffer.split("\n");
              lineBuffer = lines.pop() ?? "";

              for (const line of lines.filter(Boolean)) {
                try {
                  const parsed = JSON.parse(line);
                  yield { type: "chunk", data: parsed };
                } catch {
                  yield { type: "text_delta", text: line };
                }
              }
            } else if (streamMode === "line") {
              for (const line of text.split("\n")) {
                if (line.trim()) {
                  yield { type: "text_delta", text: `${line}\n` };
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

      // Emit remaining buffer
      if (lineBuffer.trim()) {
        try {
          const parsed = JSON.parse(lineBuffer);
          yield { type: "chunk", data: parsed };
        } catch {
          yield { type: "text_delta", text: lineBuffer };
        }
      }

      // Collect stderr
      const stderrChunks: string[] = [];
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

      const exitCode = await proc.exited;
      const fullText = fullTextChunks.join("");
      const stderr = stderrChunks.join("");

      // Check if timed out
      if (timeoutController.signal.aborted) {
        yield {
          type: "error",
          provider: this.id,
          code: "TIMEOUT",
          message: `${this.displayName} timed out after ${timeoutMs}ms`,
        };
        return;
      }

      // Check if user aborted
      if (opts?.signal?.aborted) {
        yield {
          type: "error",
          provider: this.id,
          code: "UNKNOWN",
          message: "Aborted by user",
        };
        return;
      }

      // Check exit code against allowed codes
      if (this.isSuccessExitCode(exitCode)) {
        const result = this.parseOutput(fullText);
        yield {
          type: "complete",
          provider: this.id,
          text: result.text,
          usage: result.usage,
        };
      } else {
        yield {
          type: "error",
          provider: this.id,
          code: this.classifyError({ stderr, exitCode: exitCode ?? undefined }),
          message: stderr || `Process exited with code ${exitCode}`,
        };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

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
 * Create a ConfigurableProvider from a ProviderDefinition
 */
export function createConfigurableProvider(definition: ProviderDefinition): ConfigurableProvider {
  return new ConfigurableProvider(definition);
}
