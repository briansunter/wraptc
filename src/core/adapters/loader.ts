/**
 * AdapterLoader - Load adapter definitions from files
 *
 * Supports loading .ts adapter files from:
 * - ~/.config/wraptc/adapters/
 * - ./.wtc/adapters/
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { builtInAdapters } from "./builtin";
import type { AdapterDefinition } from "./types";

/**
 * Directories to scan for user adapters (in priority order)
 */
const ADAPTER_DIRS = [
  // User adapters (highest priority)
  join(process.env.HOME ?? "~", ".config", "wrap-terminalcoder", "adapters"),
  // Project-local adapters
  "./.wtc/adapters",
];

/**
 * Load a single adapter from a file
 */
async function loadAdapterFile(filePath: string): Promise<AdapterDefinition | null> {
  try {
    // Only support .ts files (TypeScript only approach)
    if (!filePath.endsWith(".ts") && !filePath.endsWith(".js")) {
      return null;
    }

    // Skip test files and declaration files
    if (filePath.includes(".test.") || filePath.endsWith(".d.ts")) {
      return null;
    }

    // Dynamic import the adapter
    const module = await import(filePath);
    const adapter = module.default as AdapterDefinition;

    // Validate minimal requirements
    if (!adapter || !adapter.id || !adapter.binary) {
      console.warn(`Invalid adapter at ${filePath}: missing id or binary`);
      return null;
    }

    return adapter;
  } catch (err) {
    console.warn(`Failed to load adapter from ${filePath}:`, err);
    return null;
  }
}

/**
 * Load all adapters from a directory
 */
async function loadAdaptersFromDir(dir: string): Promise<Map<string, AdapterDefinition>> {
  const adapters = new Map<string, AdapterDefinition>();

  const resolvedDir = dir.startsWith(".") ? join(process.cwd(), dir) : dir;

  if (!existsSync(resolvedDir)) {
    return adapters;
  }

  try {
    const glob = new Bun.Glob("*.ts");

    for await (const file of glob.scan(resolvedDir)) {
      const filePath = join(resolvedDir, file);
      const adapter = await loadAdapterFile(filePath);

      if (adapter) {
        adapters.set(adapter.id, adapter);
      }
    }
  } catch (err) {
    console.warn(`Failed to scan adapter directory ${resolvedDir}:`, err);
  }

  return adapters;
}

/**
 * Load all user adapters from configured directories
 */
export async function loadUserAdapters(): Promise<Map<string, AdapterDefinition>> {
  const adapters = new Map<string, AdapterDefinition>();

  // Load from each directory (later directories override earlier ones)
  for (const dir of ADAPTER_DIRS) {
    const dirAdapters = await loadAdaptersFromDir(dir);
    for (const [id, adapter] of dirAdapters) {
      adapters.set(id, adapter);
    }
  }

  return adapters;
}

/**
 * Load all adapters (built-in + user)
 *
 * User adapters override built-in adapters with the same ID
 */
export async function loadAllAdapters(): Promise<Map<string, AdapterDefinition>> {
  const adapters = new Map<string, AdapterDefinition>();

  // Add built-in adapters first
  for (const adapter of builtInAdapters) {
    adapters.set(adapter.id, adapter);
  }

  // Load user adapters (override built-in)
  const userAdapters = await loadUserAdapters();
  for (const [id, adapter] of userAdapters) {
    adapters.set(id, adapter);
  }

  return adapters;
}

/**
 * Get adapter directories being scanned
 */
export function getAdapterDirectories(): string[] {
  return ADAPTER_DIRS.map((dir) => (dir.startsWith(".") ? join(process.cwd(), dir) : dir));
}

/**
 * Ensure user adapter directory exists
 */
export async function ensureUserAdapterDir(): Promise<string> {
  const userDir = join(process.env.HOME ?? "~", ".config", "wrap-terminalcoder", "adapters");

  if (!existsSync(userDir)) {
    await Bun.$`mkdir -p ${userDir}`.quiet();
  }

  return userDir;
}
