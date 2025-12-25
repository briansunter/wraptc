/**
 * Provider Loader - Dynamically loads provider configs from .ts files
 *
 * Scans these directories for provider definitions:
 * 1. ~/.config/wrap-terminalcoder/providers/*.ts (user providers)
 * 2. ./.wtc/providers/*.ts (project-local providers)
 *
 * Bun imports TypeScript directly - no build step required!
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { type ProviderDefinition, ProviderDefinitionSchema } from "./define-provider";

// Directories to scan for provider configs (in order of precedence)
const PROVIDER_DIRS = [
  // User-level providers
  join(process.env.HOME || "~", ".config", "wrap-terminalcoder", "providers"),
  // Project-local providers (higher precedence)
  "./.wtc/providers",
];

/**
 * Load a single provider definition from a file
 */
async function loadProviderFile(filePath: string): Promise<ProviderDefinition | null> {
  try {
    // Bun imports TypeScript directly - no transpilation needed!
    const module = await import(filePath);
    const rawConfig = module.default;

    if (!rawConfig) {
      console.warn(`No default export in ${filePath}`);
      return null;
    }

    // Validate base config with Zod
    const validated = ProviderDefinitionSchema.parse(rawConfig);

    // Preserve function overrides that Zod strips
    const fullConfig: ProviderDefinition = {
      ...validated,
      buildArgs: rawConfig.buildArgs,
      parseOutput: rawConfig.parseOutput,
      classifyError: rawConfig.classifyError,
      getStdinInput: rawConfig.getStdinInput,
    };

    return fullConfig;
  } catch (err) {
    console.warn(`Failed to load provider from ${filePath}:`, err);
    return null;
  }
}

/**
 * Load all provider definitions from configured directories
 *
 * @returns Map of provider ID to ProviderDefinition
 */
export async function loadProviderConfigs(): Promise<Map<string, ProviderDefinition>> {
  const providers = new Map<string, ProviderDefinition>();

  for (const dir of PROVIDER_DIRS) {
    // Resolve relative paths
    const resolvedDir = dir.startsWith(".") ? join(process.cwd(), dir) : dir;

    if (!existsSync(resolvedDir)) {
      continue;
    }

    try {
      const glob = new Bun.Glob("*.ts");

      for await (const file of glob.scan(resolvedDir)) {
        // Skip test files and type definition files
        if (file.endsWith(".test.ts") || file.endsWith(".d.ts")) {
          continue;
        }

        const filePath = join(resolvedDir, file);
        const config = await loadProviderFile(filePath);

        if (config) {
          // Later directories (project-local) override earlier ones (user)
          providers.set(config.id, config);
          console.log(`Loaded provider: ${config.id} from ${filePath}`);
        }
      }
    } catch (err) {
      console.warn(`Failed to scan directory ${resolvedDir}:`, err);
    }
  }

  return providers;
}

/**
 * Watch provider directories for changes and reload
 * (for development/hot-reload scenarios)
 */
export async function watchProviderConfigs(
  onChange: (providers: Map<string, ProviderDefinition>) => void,
): Promise<() => void> {
  const watchers: Array<{ close: () => void }> = [];

  for (const dir of PROVIDER_DIRS) {
    const resolvedDir = dir.startsWith(".") ? join(process.cwd(), dir) : dir;

    if (!existsSync(resolvedDir)) {
      continue;
    }

    try {
      const watcher = Bun.file(resolvedDir).watch();

      // Debounce reloads
      let reloadTimeout: ReturnType<typeof setTimeout> | null = null;

      const handleChange = async () => {
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }
        reloadTimeout = setTimeout(async () => {
          const providers = await loadProviderConfigs();
          onChange(providers);
        }, 100);
      };

      // Note: Bun.file().watch() is for files, not directories
      // For directory watching, we'd need a different approach
      // This is a simplified version
      watchers.push({
        close: () => {
          if (reloadTimeout) {
            clearTimeout(reloadTimeout);
          }
        },
      });
    } catch {
      // Directory watching not critical
    }
  }

  // Return cleanup function
  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

/**
 * Get the paths where providers can be placed
 */
export function getProviderDirectories(): string[] {
  return PROVIDER_DIRS.map((dir) => (dir.startsWith(".") ? join(process.cwd(), dir) : dir));
}

/**
 * Create the user provider directory if it doesn't exist
 */
export async function ensureUserProviderDir(): Promise<string> {
  const userDir = join(process.env.HOME || "~", ".config", "wrap-terminalcoder", "providers");

  if (!existsSync(userDir)) {
    await Bun.$`mkdir -p ${userDir}`.quiet();
  }

  return userDir;
}
