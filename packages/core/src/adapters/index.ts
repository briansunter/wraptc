/**
 * Adapter System Exports
 *
 * The adapter system provides a lightweight way to wrap terminal coding tools.
 */

// Types
export type {
	AdapterConfig,
	AdapterDefinition,
	AdapterHooks,
	AdapterInvokeOptions,
	AdapterResult,
	AdapterInfo,
	InputMethod,
	OutputFormat,
	StreamingMode,
	StreamChunk,
	ErrorPatterns,
} from "./types";

// Core functionality
export { defineAdapter, type ValidAdapterDefinition } from "./define";
export { AdapterRunner, AdapterError } from "./runner";
export {
	loadUserAdapters,
	loadAllAdapters,
	getAdapterDirectories,
	ensureUserAdapterDir,
} from "./loader";

// Provider bridge
export { AdapterProviderBridge, createProviderFromAdapter } from "./provider-bridge";

// Built-in adapters
export {
	geminiAdapter,
	qwenAdapter,
	codexAdapter,
	builtInAdapters,
	getBuiltInAdapter,
	getBuiltInAdapterIds,
} from "./builtin";
