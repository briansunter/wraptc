/**
 * Plugin System Exports
 */

// Types
export type {
  PluginDefinition,
  PluginRegistrationOptions,
  PluginRegistrationResult,
  PluginInfo,
  CreateProviderOptions,
  ManagedProvider,
  PluginContext,
  IPluginRegistry,
  IPluginLifecycle,
  ProviderFactory,
  PluginConfigType,
} from "./types";

export { isLifecycleProvider } from "./types";

// Registry
export { PluginRegistry, getPluginRegistry } from "./registry";

// Built-in plugins
export {
  geminiPlugin,
  qwenCodePlugin,
  codexPlugin,
  builtInPlugins,
  registerBuiltInPlugins,
  areBuiltInPluginsRegistered,
  getBuiltInPluginTypes,
} from "./builtin";
