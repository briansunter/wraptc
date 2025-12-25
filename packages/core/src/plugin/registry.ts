/**
 * PluginRegistry - Central registry for terminal coder plugins
 *
 * Singleton pattern with lifecycle management and provider creation.
 */

import { binaryExists } from "../provider-factory";
import type { Provider } from "../providers/index";
import type {
  CreateProviderOptions,
  IPluginRegistry,
  ManagedProvider,
  PluginContext,
  PluginDefinition,
  PluginInfo,
  PluginRegistrationOptions,
  PluginRegistrationResult,
} from "./types";

/**
 * PluginRegistry - Manages plugin registration and provider creation
 */
export class PluginRegistry implements IPluginRegistry {
  private static instance: PluginRegistry | null = null;

  /** Registered plugins by type */
  private plugins = new Map<string, PluginDefinition>();

  /** Track built-in plugins */
  private builtInTypes = new Set<string>();

  /** Track initialized providers for lifecycle management */
  private initializedProviders = new Map<string, ManagedProvider>();

  /** Default context */
  private defaultContext: PluginContext;

  private constructor() {
    this.defaultContext = {
      registry: this,
      cwd: process.cwd(),
    };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (PluginRegistry.instance) {
      // Clean up initialized providers
      PluginRegistry.instance.shutdownAll().catch(console.warn);
    }
    PluginRegistry.instance = null;
  }

  /**
   * Register a plugin (async, with lifecycle hooks)
   */
  async register(
    plugin: PluginDefinition,
    options: PluginRegistrationOptions = {},
  ): Promise<PluginRegistrationResult> {
    const { overwrite = false, builtIn = false } = options;

    // Check for existing registration
    if (this.plugins.has(plugin.type)) {
      if (!overwrite) {
        return {
          success: false,
          type: plugin.type,
          message: `Plugin type '${plugin.type}' is already registered.`,
        };
      }

      // Call onUnregister for existing plugin
      const existing = this.plugins.get(plugin.type);
      if (existing?.onUnregister) {
        try {
          await existing.onUnregister(this.defaultContext);
        } catch (error) {
          console.warn(`Error during onUnregister for plugin '${plugin.type}':`, error);
        }
      }
    }

    // Register the plugin
    this.plugins.set(plugin.type, plugin);

    // Mark as built-in if specified
    if (builtIn) {
      this.builtInTypes.add(plugin.type);
    }

    // Call onRegister hook
    if (plugin.onRegister) {
      try {
        await plugin.onRegister(this.defaultContext);
      } catch (error) {
        // Rollback on failure
        this.plugins.delete(plugin.type);
        this.builtInTypes.delete(plugin.type);
        return {
          success: false,
          type: plugin.type,
          message: `Plugin onRegister failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    return {
      success: true,
      type: plugin.type,
      overwritten: this.plugins.has(plugin.type) && overwrite,
    };
  }

  /**
   * Register a plugin synchronously (no lifecycle hooks called)
   */
  registerSync(
    plugin: PluginDefinition,
    options: PluginRegistrationOptions = {},
  ): PluginRegistrationResult {
    const { overwrite = false, builtIn = false } = options;

    if (this.plugins.has(plugin.type) && !overwrite) {
      return {
        success: false,
        type: plugin.type,
        message: `Plugin type '${plugin.type}' is already registered.`,
      };
    }

    this.plugins.set(plugin.type, plugin);
    if (builtIn) {
      this.builtInTypes.add(plugin.type);
    }

    return { success: true, type: plugin.type };
  }

  /**
   * Unregister a plugin
   */
  async unregister(type: string): Promise<boolean> {
    const plugin = this.plugins.get(type);
    if (!plugin) return false;

    // Shutdown any initialized provider
    const provider = this.initializedProviders.get(type);
    if (provider?.shutdown) {
      await provider.shutdown();
      this.initializedProviders.delete(type);
    }

    // Call onUnregister hook
    if (plugin.onUnregister) {
      await plugin.onUnregister(this.defaultContext);
    }

    this.plugins.delete(type);
    this.builtInTypes.delete(type);
    return true;
  }

  /**
   * Check if a plugin type is registered
   */
  has(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Get a plugin definition
   */
  get(type: string): PluginDefinition | undefined {
    return this.plugins.get(type);
  }

  /**
   * Get all registered plugin types
   */
  getTypes(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * List all plugins with metadata
   */
  listPlugins(): PluginInfo[] {
    const infos: PluginInfo[] = [];

    for (const plugin of this.plugins.values()) {
      infos.push({
        type: plugin.type,
        displayName: plugin.displayName,
        description: plugin.description,
        docsUrl: plugin.docsUrl,
        version: plugin.version,
        capabilities: plugin.capabilities,
        binary: plugin.binary,
        hasLifecycle: plugin.hasLifecycle,
        isBuiltIn: this.builtInTypes.has(plugin.type),
      });
    }

    return infos;
  }

  /**
   * Get plugin info by type
   */
  getPluginInfo(type: string): PluginInfo | undefined {
    const plugin = this.plugins.get(type);
    if (!plugin) return undefined;

    return {
      type: plugin.type,
      displayName: plugin.displayName,
      description: plugin.description,
      docsUrl: plugin.docsUrl,
      version: plugin.version,
      capabilities: plugin.capabilities,
      binary: plugin.binary,
      hasLifecycle: plugin.hasLifecycle,
      isBuiltIn: this.builtInTypes.has(type),
    };
  }

  /**
   * Create a provider from a registered plugin
   */
  createProvider(
    type: string,
    config: unknown,
    options: CreateProviderOptions = {},
  ): ManagedProvider {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(
        `No plugin registered for type '${type}'. ` +
          `Available types: ${this.getTypes().join(", ") || "none"}`,
      );
    }

    // Use factory function
    const context = options.context ?? this.defaultContext;
    return plugin.factory(config, context) as ManagedProvider;
  }

  /**
   * Create and initialize a provider with lifecycle management
   */
  async createAndInitProvider(
    type: string,
    config: unknown,
    options: CreateProviderOptions = {},
  ): Promise<ManagedProvider> {
    const provider = this.createProvider(type, config, options);

    // Initialize if lifecycle provider
    if (provider.init) {
      await provider.init();
      this.initializedProviders.set(type, provider);
    }

    return provider;
  }

  /**
   * Check if a plugin's binary is available
   */
  async isAvailable(type: string): Promise<boolean> {
    const plugin = this.plugins.get(type);
    if (!plugin) return false;
    if (!plugin.binary) return true;
    return binaryExists(plugin.binary);
  }

  /**
   * Get all available plugin types (with valid binaries)
   */
  async getAvailableTypes(): Promise<string[]> {
    const types = this.getTypes();
    const availability = await Promise.all(types.map((type) => this.isAvailable(type)));
    return types.filter((_, i) => availability[i]);
  }

  /**
   * Shutdown all initialized providers
   */
  async shutdownAll(): Promise<void> {
    for (const provider of this.initializedProviders.values()) {
      if (provider.shutdown) {
        try {
          await provider.shutdown();
        } catch (error) {
          console.warn("Error during provider shutdown:", error);
        }
      }
    }
    this.initializedProviders.clear();
  }

  /**
   * Clear all plugins
   */
  async clear(): Promise<void> {
    // Shutdown initialized providers
    await this.shutdownAll();

    // Call onUnregister for all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.onUnregister) {
        try {
          await plugin.onUnregister(this.defaultContext);
        } catch (error) {
          console.warn(`Error during onUnregister for plugin '${plugin.type}':`, error);
        }
      }
    }

    this.plugins.clear();
    this.builtInTypes.clear();
  }

  /**
   * Get the number of registered plugins
   */
  get size(): number {
    return this.plugins.size;
  }
}

/**
 * Get the global plugin registry instance
 */
export const getPluginRegistry = (): PluginRegistry => PluginRegistry.getInstance();
