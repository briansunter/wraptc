import { rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { Command } from "commander";
import type { Config } from "./types";
import { ConfigSchema } from "./types";

export interface ConfigLoaderOptions {
  configPath?: string;
  projectConfigPath?: string;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

export class ConfigLoader {
  private options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}) {
    this.options = options;
  }

  async loadConfig(): Promise<Config> {
    // Load configs from different sources in order of precedence
    const configs: Config[] = [];

    // 1. Built-in defaults
    configs.push(this.getDefaultConfig());

    // 2. System config (optional)
    const systemConfig = await this.loadSystemConfig();
    if (systemConfig) {
      configs.push(systemConfig);
    }

    // 3. User config
    const userConfig = await this.loadUserConfig();
    if (userConfig) {
      configs.push(userConfig);
    }

    // 4. Project config
    const projectConfig = await this.loadProjectConfig();
    if (projectConfig) {
      configs.push(projectConfig);
    }

    // 5. Env variables (WTC_*)
    const envConfig = this.loadEnvConfig();
    if (envConfig) {
      configs.push(envConfig);
    }

    // Merge all configs
    const merged = this.mergeConfigs(configs);

    // Validate with Zod
    const result = ConfigSchema.safeParse(merged);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    return result.data;
  }

  private getDefaultConfig(): Config {
    return {
      routing: {
        defaultOrder: ["gemini", "opencode", "qwen-code", "codex"],
        perModeOverride: {
          test: ["codex", "gemini"],
          explain: ["gemini", "qwen-code"],
        },
      },
      providers: {
        gemini: {
          binary: "gemini",
          args: [],
          jsonMode: "flag",
          jsonFlag: "--output-format",
          streamingMode: "jsonl",
          capabilities: ["generate", "edit", "explain", "test"],
        },
        opencode: {
          binary: "opencode",
          args: [],
          jsonMode: "flag",
          jsonFlag: "-f",
          streamingMode: "none",
          capabilities: ["generate", "edit", "explain", "test", "refactor"],
        },
        "qwen-code": {
          binary: "qwen",
          args: [],
          jsonMode: "flag",
          jsonFlag: "--json",
          streamingMode: "jsonl",
          capabilities: ["generate", "edit", "explain", "test"],
        },
        codex: {
          binary: "codex",
          args: [],
          jsonMode: "none",
          streamingMode: "line",
          capabilities: ["generate", "edit", "test"],
        },
      },
      credits: {
        providers: {
          gemini: {
            dailyRequestLimit: 1000,
            resetHourUtc: 0,
          },
          opencode: {
            dailyRequestLimit: 1000,
            resetHourUtc: 0,
          },
          "qwen-code": {
            dailyRequestLimit: 2000,
            resetHourUtc: 0,
          },
          codex: {
            plan: "chatgpt_plus",
          },
        },
      },
    };
  }

  private async loadSystemConfig(): Promise<Config | null> {
    const systemPath = "/etc/wrap-terminalcoder/config.json";
    return this.loadConfigFile(systemPath);
  }

  private async loadUserConfig(): Promise<Config | null> {
    const userPath = join(process.env.HOME || "~", ".config", "wrap-terminalcoder", "config.json");
    return this.loadConfigFile(userPath);
  }

  private async loadProjectConfig(): Promise<Config | null> {
    const projectPath = this.options.projectConfigPath || ".config/wrap-terminalcoder/config.json";
    return this.loadConfigFile(projectPath);
  }

  private async loadConfigFile(filePath: string): Promise<Config | null> {
    try {
      // Use Bun.file() for async file existence check and reading
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (!exists) {
        return null;
      }

      const content = await file.text();
      const parsed = JSON.parse(content);

      if (this.options.debug) {
        console.debug(`[ConfigLoader] Loaded config from ${filePath}`);
      }
      return parsed;
    } catch {
      // Silently fail for missing/invalid config files - they're optional
      return null;
    }
  }

  private loadEnvConfig(): Config | null {
    const envVars = Object.entries(process.env).filter(([key]) => key.startsWith("WTC_"));

    if (envVars.length === 0) {
      return null;
    }

    const config: any = {};

    for (const [key, value] of envVars) {
      // Convert WTC_ROUTING__DEFAULT_ORDER='["qwen-code","gemini"]' to config.routing.defaultOrder
      const path = key
        .replace(/^WTC_/, "")
        .toLowerCase()
        .split("__")
        .map((segment) => this.camelCase(segment));

      this.setNestedProperty(config, path, this.parseEnvValue(value));
    }

    return config;
  }

  private camelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private parseEnvValue(value: string | undefined): any {
    if (!value) return value;
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }

  private setNestedProperty(obj: any, path: string[], value: any): void {
    if (path.length === 0) {
      // For empty path, set the value directly on the object
      obj[""] = value;
      return;
    }

    let current = obj;

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[path[path.length - 1]] = value;
  }

  private mergeConfigs(configs: Config[]): Config {
    // Deep merge all configs, with later configs overriding earlier ones
    const merged = configs.reduce((acc, config) => {
      return this.deepMerge(acc, config);
    }, {} as Config);

    return merged;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  async saveConfig(config: Config, path?: string): Promise<void> {
    const configPath = path || this.options.configPath || this.getDefaultUserConfigPath();

    // Ensure directory exists using Bun shell
    const dir = dirname(configPath);
    await Bun.$`mkdir -p ${dir}`.quiet();

    // Write atomically: write to temp file, then rename
    const tempPath = `${configPath}.tmp`;

    // Use Bun.write() for faster file writing
    await Bun.write(tempPath, JSON.stringify(config, null, 2));

    // Atomic rename
    await rename(tempPath, configPath);
  }

  private getDefaultUserConfigPath(): string {
    return join(process.env.HOME || "~", ".config", "wrap-terminalcoder", "config.json");
  }
}

export function addCLIConfigOverrides(command: Command): void {
  command
    .option("--provider <provider>", "Override provider")
    .option("--routing-default-order <order>", "Override routing default order (JSON array)")
    .option("--config <path>", "Config file path")
    .hook("preAction", async (thisCommand) => {
      const opts = thisCommand.opts();

      // Convert CLI options to env variables temporarily
      if (opts.provider) {
        process.env.WTC_REQUEST__PROVIDER = opts.provider;
      }
      if (opts.routingDefaultOrder) {
        process.env.WTC_ROUTING__DEFAULT_ORDER = opts.routingDefaultOrder;
      }
    });
}
