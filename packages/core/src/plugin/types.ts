/**
 * Plugin System Types
 *
 * Provides a formal registry for terminal coder plugins with lifecycle hooks
 * and configuration validation.
 */

import type { Provider } from "../providers/index";

/**
 * Plugin lifecycle interface
 * Providers can optionally implement these for managed lifecycle
 */
export interface IPluginLifecycle {
	/**
	 * Initialize the plugin (async setup, warmup, etc.)
	 * Called once when the plugin is first used
	 */
	init?(): Promise<void>;

	/**
	 * Perform health check
	 * @returns true if healthy
	 */
	healthcheck?(): Promise<boolean>;

	/**
	 * Clean shutdown
	 * Called when the system is shutting down
	 */
	shutdown?(): Promise<void>;
}

/**
 * Factory function type for creating provider instances
 */
export type ProviderFactory<TConfig = unknown> = (
	config: TConfig,
	context?: PluginContext,
) => Provider;

/**
 * Context passed to plugin factory and lifecycle methods
 */
export interface PluginContext {
	/** Plugin registry for accessing other plugins */
	registry: IPluginRegistry;
	/** Configuration path (if loaded from file) */
	configPath?: string;
	/** Working directory */
	cwd?: string;
}

/**
 * Plugin definition interface
 *
 * This is the main interface for defining a terminal coder plugin.
 * For simple tools, use the adapter system instead.
 */
export interface PluginDefinition<TConfig = unknown> {
	/**
	 * Unique type identifier for this plugin
	 * Used as discriminator in config and registry lookup
	 */
	readonly type: string;

	/**
	 * Human-readable name for display
	 */
	readonly displayName: string;

	/**
	 * Brief description of the plugin
	 */
	readonly description?: string;

	/**
	 * URL to documentation
	 */
	readonly docsUrl?: string;

	/**
	 * Version of the plugin (semver)
	 */
	readonly version?: string;

	/**
	 * Factory function to create provider instances
	 */
	readonly factory: ProviderFactory<TConfig>;

	/**
	 * Whether this provider implements IPluginLifecycle
	 * If true, init/shutdown will be called during lifecycle management
	 */
	readonly hasLifecycle: boolean;

	/**
	 * Capabilities this plugin supports
	 * e.g., ["generate", "edit", "explain", "test", "review"]
	 */
	readonly capabilities?: string[];

	/**
	 * Binary required by this plugin
	 * Used for availability checking
	 */
	readonly binary?: string;

	/**
	 * Hook called when plugin is registered
	 * Use for one-time setup or validation
	 */
	onRegister?(context: PluginContext): void | Promise<void>;

	/**
	 * Hook called when plugin is unregistered
	 * Use for cleanup
	 */
	onUnregister?(context: PluginContext): void | Promise<void>;
}

/**
 * Registration options
 */
export interface PluginRegistrationOptions {
	/** Whether to overwrite if plugin type already exists */
	overwrite?: boolean;
	/** Mark as built-in plugin */
	builtIn?: boolean;
}

/**
 * Registration result
 */
export interface PluginRegistrationResult {
	success: boolean;
	type: string;
	message?: string;
	overwritten?: boolean;
}

/**
 * Plugin metadata for queries
 */
export interface PluginInfo {
	type: string;
	displayName: string;
	description?: string;
	docsUrl?: string;
	version?: string;
	capabilities?: string[];
	binary?: string;
	hasLifecycle: boolean;
	isBuiltIn: boolean;
	isAvailable?: boolean;
}

/**
 * Options for creating a provider
 */
export interface CreateProviderOptions {
	/** Plugin context */
	context?: PluginContext;
	/** Skip config validation */
	skipValidation?: boolean;
}

/**
 * Extended provider type with optional lifecycle
 */
export type ManagedProvider = Provider & Partial<IPluginLifecycle>;

/**
 * Type guard for lifecycle providers
 */
export function isLifecycleProvider(
	provider: Provider,
): provider is Provider & IPluginLifecycle {
	return (
		provider != null &&
		typeof provider === "object" &&
		"init" in provider &&
		typeof (provider as IPluginLifecycle).init === "function"
	);
}

/**
 * Helper type to extract config type from plugin
 */
export type PluginConfigType<T> = T extends PluginDefinition<infer C>
	? C
	: never;

/**
 * Plugin registry interface (for dependency injection)
 */
export interface IPluginRegistry {
	register(
		plugin: PluginDefinition,
		options?: PluginRegistrationOptions,
	): Promise<PluginRegistrationResult>;
	registerSync(
		plugin: PluginDefinition,
		options?: PluginRegistrationOptions,
	): PluginRegistrationResult;
	unregister(type: string): Promise<boolean>;
	has(type: string): boolean;
	get(type: string): PluginDefinition | undefined;
	getTypes(): string[];
	listPlugins(): PluginInfo[];
	createProvider(
		type: string,
		config: unknown,
		options?: CreateProviderOptions,
	): ManagedProvider;
}
