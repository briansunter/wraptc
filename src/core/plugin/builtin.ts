/**
 * Built-in Plugins
 *
 * Wraps the built-in adapters as plugins for the registry.
 */

import { codexAdapter, geminiAdapter, qwenAdapter } from "../adapters/builtin";
import { createProviderFromAdapter } from "../adapters/provider-bridge";
import { PluginRegistry } from "./registry";
import type { PluginDefinition } from "./types";

/**
 * Gemini CLI plugin
 */
export const geminiPlugin: PluginDefinition = {
  type: "gemini",
  displayName: "Gemini CLI",
  description: "Google Gemini CLI for AI-assisted coding",
  version: "1.0.0",
  binary: "gemini",
  capabilities: ["generate", "edit", "explain", "test"],
  hasLifecycle: false,
  factory: () => createProviderFromAdapter(geminiAdapter),
};

/**
 * Qwen Code CLI plugin
 */
export const qwenCodePlugin: PluginDefinition = {
  type: "qwen-code",
  displayName: "Qwen Code CLI",
  description: "Qwen Code CLI for AI-assisted coding",
  version: "1.0.0",
  binary: "qwen",
  capabilities: ["generate", "edit", "explain", "test"],
  hasLifecycle: false,
  factory: () => createProviderFromAdapter(qwenAdapter),
};

/**
 * Codex CLI plugin
 */
export const codexPlugin: PluginDefinition = {
  type: "codex",
  displayName: "Codex CLI",
  description: "OpenAI Codex CLI for code generation",
  version: "1.0.0",
  binary: "codex",
  capabilities: ["generate", "edit", "test"],
  hasLifecycle: false,
  factory: () => createProviderFromAdapter(codexAdapter),
};

/**
 * All built-in plugins
 */
export const builtInPlugins: PluginDefinition[] = [geminiPlugin, qwenCodePlugin, codexPlugin];

/**
 * Register all built-in plugins
 */
export async function registerBuiltInPlugins(
  registry: PluginRegistry = PluginRegistry.getInstance(),
): Promise<void> {
  for (const plugin of builtInPlugins) {
    const result = registry.registerSync(plugin, { builtIn: true });
    if (!result.success) {
      console.warn(`Failed to register built-in plugin ${plugin.type}:`, result.message);
    }
  }
}

/**
 * Check if built-in plugins are registered
 */
export function areBuiltInPluginsRegistered(
  registry: PluginRegistry = PluginRegistry.getInstance(),
): boolean {
  return builtInPlugins.every((plugin) => registry.has(plugin.type));
}

/**
 * Get built-in plugin types
 */
export function getBuiltInPluginTypes(): string[] {
  return builtInPlugins.map((p) => p.type);
}
