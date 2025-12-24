/**
 * GeminiProvider - Simplified provider using ProcessProvider defaults
 *
 * Gemini CLI uses:
 * - Positional prompt: gemini [options] <prompt>
 * - JSON output flag: -o json
 */
import type { CodingRequest, ProviderConfig, ProviderInvokeOptions } from "../types";
import { ProcessProvider } from "./index";

export class GeminiProvider extends ProcessProvider {
  constructor(config: ProviderConfig) {
    super("gemini", "Gemini CLI", {
      ...config,
      binary: config.binary || "gemini",
    });
  }

  /**
   * Gemini uses positional prompt (not stdin), so override getStdinInput
   */
  protected getStdinInput(): string | undefined {
    return undefined; // Gemini uses positional prompt
  }

  /**
   * Build args: gemini -o json [...args] <prompt>
   */
  protected buildArgs(req: CodingRequest, _opts: ProviderInvokeOptions): string[] {
    const args: string[] = [];

    if (this.config.jsonMode === "flag") {
      args.push("-o", "json");
    }

    args.push(...this.config.args);
    args.push(req.prompt);

    return args;
  }
}
