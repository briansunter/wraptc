/**
 * defineAdapter - Simple helper for creating adapter definitions
 *
 * @example
 * ```typescript
 * export default defineAdapter({
 *   id: 'gemini',
 *   binary: 'gemini',
 *   input: 'positional',
 *   args: ['-o', 'json', '--yolo'],
 *   output: 'json',
 *   errorPatterns: { RATE_LIMIT: ['429', 'quota exceeded'] },
 * });
 * ```
 */

import type { AdapterConfig, AdapterDefinition, AdapterHooks } from "./types";

/**
 * Define a terminal coder adapter with sensible defaults
 *
 * @param config - Adapter configuration with optional hooks
 * @returns Complete adapter definition
 */
export function defineAdapter(config: AdapterConfig & Partial<AdapterHooks>): AdapterDefinition {
  // Apply sensible defaults
  return {
    // Defaults
    input: "stdin",
    output: "text",
    streaming: "none",
    timeoutMs: 60000,
    allowedExitCodes: [0],
    capabilities: ["generate"],

    // User config (overrides defaults)
    ...config,

    // Ensure displayName defaults to id
    displayName: config.displayName ?? config.id,
  };
}

/**
 * Type helper to check if a definition is valid at compile time
 */
export type ValidAdapterDefinition = Required<Pick<AdapterDefinition, "id" | "binary">> &
  Partial<Omit<AdapterDefinition, "id" | "binary">>;
