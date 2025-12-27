/**
 * CodexProvider - Simplified provider using ProcessProvider defaults
 *
 * Codex CLI uses:
 * - exec subcommand: codex exec <prompt>
 * - Text output (no JSON mode)
 */
import type {
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInvokeOptions,
} from "../types";
import { ProcessProvider } from "./index";

export class CodexProvider extends ProcessProvider {
  constructor(config: ProviderConfig) {
    super("codex", "Codex CLI", {
      ...config,
      binary: config.binary || "codex",
    });
  }

  /**
   * Codex uses positional prompt (not stdin)
   */
  protected getStdinInput(): string | undefined {
    return undefined;
  }

  /**
   * Build args: codex exec [...args] <prompt>
   */
  protected buildArgs(req: CodingRequest, _opts: ProviderInvokeOptions): string[] {
    const args: string[] = ["exec"];
    args.push(...this.config.args);
    args.push(req.prompt);
    return args;
  }

  /**
   * Codex has specific error patterns for plan limits
   */
  classifyError(error: ProviderErrorContext): ProviderErrorKind {
    const combined = ((error.stderr || "") + (error.stdout || "")).toLowerCase();

    // Codex-specific: plan limits
    if (combined.includes("plan limit") || combined.includes("subscription required")) {
      return "OUT_OF_CREDITS";
    }

    // Use base implementation for common patterns
    return super.classifyError(error);
  }
}
