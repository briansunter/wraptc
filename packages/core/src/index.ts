// Main entry point for wrap-terminalcoder core
export * from "./wrap-terminalcoder";
export * from "./router";
export * from "./config";
export * from "./state";
export * from "./types";
export * from "./memory-monitor";
export * from "./provider-factory";

// Provider exports
export * from "./providers/index";
export { CustomProvider } from "./providers/custom";
export { ConfigurableProvider, createConfigurableProvider } from "./providers/configurable";
export { GeminiProvider } from "./providers/gemini";
export { QwenCodeProvider } from "./providers/qwen-code";
export { CodexProvider } from "./providers/codex";

// Provider definition helper - for creating custom providers via .ts config files
export {
  defineProvider,
  type ProviderDefinition,
  type ProviderDefinitionInput,
  ProviderDefinitionSchema,
  InputConfigSchema,
  OutputConfigSchema,
  StreamingConfigSchema,
  ArgsConfigSchema,
  RetryConfigSchema,
  ErrorPatternsSchema,
  DEFAULT_ERROR_PATTERNS,
} from "./define-provider";

// Provider loader - for loading .ts config files
export {
  loadProviderConfigs,
  getProviderDirectories,
  ensureUserProviderDir,
} from "./provider-loader";

// ============================================================================
// NEW: Adapter System - Lightweight terminal coder wrappers
// ============================================================================
export {
  // Types
  type AdapterConfig,
  type AdapterDefinition,
  type AdapterHooks,
  type AdapterInvokeOptions,
  type AdapterResult,
  type AdapterInfo,
  type InputMethod,
  type OutputFormat,
  type StreamingMode,
  type StreamChunk,
  type ErrorPatterns,
  // Core functionality
  defineAdapter,
  AdapterRunner,
  AdapterError,
  // Loading
  loadUserAdapters,
  loadAllAdapters,
  getAdapterDirectories,
  ensureUserAdapterDir,
  // Provider bridge
  AdapterProviderBridge,
  createProviderFromAdapter,
  // Built-in adapters
  geminiAdapter,
  qwenAdapter,
  codexAdapter,
  builtInAdapters,
  getBuiltInAdapter,
  getBuiltInAdapterIds,
} from "./adapters";

// ============================================================================
// NEW: Plugin System - Formal plugin registry with lifecycle hooks
// ============================================================================
export {
  // Types
  type PluginDefinition,
  type PluginRegistrationOptions,
  type PluginRegistrationResult,
  type PluginInfo,
  type CreateProviderOptions,
  type ManagedProvider,
  type PluginContext,
  type IPluginRegistry,
  type IPluginLifecycle,
  type ProviderFactory,
  type PluginConfigType,
  isLifecycleProvider,
  // Registry
  PluginRegistry,
  getPluginRegistry,
  // Built-in plugins
  geminiPlugin,
  qwenCodePlugin,
  codexPlugin,
  builtInPlugins,
  registerBuiltInPlugins,
  areBuiltInPluginsRegistered,
  getBuiltInPluginTypes,
} from "./plugin";

// ============================================================================
// NEW: Unified Interface - Consistent types across all providers
// ============================================================================
export {
  // Capabilities
  Capability,
  type CapabilityType,
  type ICapabilities,
  ProviderCapabilities,
  // Output
  type IOutput,
  type IOutputMeta,
  type UnifiedStreamChunk,
  type NormalizerConfig,
  DEFAULT_NORMALIZER_CONFIG,
  OutputNormalizer,
  // Errors
  type IProviderError,
  ProviderError,
  classifyErrorMessage,
} from "./unified";

// Re-export integration tests for convenience
export { describe, test, expect } from "bun:test";
