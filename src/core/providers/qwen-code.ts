/**
 * QwenCodeProvider - Simplified provider using ProcessProvider defaults
 *
 * Qwen Code CLI uses:
 * - Positional prompt: qwen [options] <prompt>
 * - JSON output flag: -o json
 */
import type { CodingRequest, ProviderConfig, ProviderInvokeOptions } from "../types";
import { ProcessProvider } from "./index";

export class QwenCodeProvider extends ProcessProvider {
  constructor(config: ProviderConfig) {
    super("qwen-code", "Qwen Code CLI", {
      ...config,
      binary: config.binary || "qwen",
    });
  }

  /**
   * Qwen uses positional prompt (not stdin), so override getStdinInput
   */
  protected getStdinInput(): string | undefined {
    return undefined; // Qwen uses positional prompt
  }

  /**
   * Build args: qwen -o json [...args] <prompt>
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
