/**
 * Built-in Adapter Exports
 */

export { default as geminiAdapter } from "./gemini";
export { default as qwenAdapter } from "./qwen";
export { default as codexAdapter } from "./codex";

import geminiAdapter from "./gemini";
import qwenAdapter from "./qwen";
import codexAdapter from "./codex";
import type { AdapterDefinition } from "../types";

/**
 * All built-in adapters
 */
export const builtInAdapters: AdapterDefinition[] = [
	geminiAdapter,
	qwenAdapter,
	codexAdapter,
];

/**
 * Get a built-in adapter by ID
 */
export function getBuiltInAdapter(id: string): AdapterDefinition | undefined {
	return builtInAdapters.find((a) => a.id === id);
}

/**
 * Get all built-in adapter IDs
 */
export function getBuiltInAdapterIds(): string[] {
	return builtInAdapters.map((a) => a.id);
}
