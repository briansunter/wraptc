import { ConfigLoader } from "./config";
import { StateManager } from "./state";
import { Router } from "./router";
import { GeminiProvider } from "./providers/gemini";
import { QwenCodeProvider } from "./providers/qwen-code";
import { CodexProvider } from "./providers/codex";
import { CustomProvider } from "./providers/custom";
import { ProviderFactory, RequestDeduplicator } from "./provider-factory";
import type { CodingRequest, CodingResponse, CodingEvent, Config } from "./types";
import type { Provider } from "./providers/index";

export interface WrapTerminalCoderConfig {
  configPath?: string;
  /** Preload providers at startup (default: false for lazy loading) */
  preloadProviders?: boolean;
  /** Enable request deduplication (default: true) */
  deduplicateRequests?: boolean;
}

export class WrapTerminalCoder {
  private configLoader: ConfigLoader;
  private config: Config;
  private stateManager: StateManager;
  private router: Router;
  private providerFactory: ProviderFactory;
  private deduplicator: RequestDeduplicator | null;

  private constructor(
    configLoader: ConfigLoader,
    config: Config,
    stateManager: StateManager,
    router: Router,
    providerFactory: ProviderFactory,
    deduplicator: RequestDeduplicator | null,
  ) {
    this.configLoader = configLoader;
    this.config = config;
    this.stateManager = stateManager;
    this.router = router;
    this.providerFactory = providerFactory;
    this.deduplicator = deduplicator;
  }

  static async create(config: WrapTerminalCoderConfig = {}): Promise<WrapTerminalCoder> {
    // Load configuration
    const configLoader = new ConfigLoader({
      projectConfigPath: config.configPath,
    });
    const loadedConfig = await configLoader.loadConfig();

    // Initialize state manager
    const stateManager = new StateManager();
    await stateManager.initialize();

    // Create provider factory with lazy loading
    const providerFactory = new ProviderFactory(loadedConfig);

    // Register known provider constructors
    providerFactory.registerProvider("gemini", (id, cfg) => new GeminiProvider(cfg));
    providerFactory.registerProvider("qwen-code", (id, cfg) => new QwenCodeProvider(cfg));
    providerFactory.registerProvider("codex", (id, cfg) => new CodexProvider(cfg));
    providerFactory.registerCustomProvider((id, cfg) => new CustomProvider(id, cfg));

    // Create request deduplicator
    const deduplicator = config.deduplicateRequests !== false ? new RequestDeduplicator() : null;

    // Optionally preload providers (legacy behavior)
    let providers: Map<string, Provider>;
    if (config.preloadProviders) {
      const providerIds = Object.keys(loadedConfig.providers);
      await providerFactory.preloadProviders(providerIds);
      providers = providerFactory.getCachedProviders();
    } else {
      // Create a lazy-loading proxy map for the router
      providers = new LazyProviderMap(providerFactory, Object.keys(loadedConfig.providers));
    }

    // Create router
    const router = new Router(providers, {
      config: loadedConfig,
      stateManager,
    });

    return new WrapTerminalCoder(
      configLoader,
      loadedConfig,
      stateManager,
      router,
      providerFactory,
      deduplicator
    );
  }

  async route(request: CodingRequest): Promise<CodingResponse> {
    return await this.router.route(request);
  }

  async *routeStream(request: CodingRequest): AsyncGenerator<CodingResponse> {
    yield* this.router.routeStream(request);
  }

  async getProviderInfo(): Promise<any[]> {
    const providerInfo = [];
    const providerIds = Object.keys(this.config.providers);

    for (const id of providerIds) {
      const state = await this.stateManager.getProviderState(id);
      const isAvailable = await this.providerFactory.isProviderAvailable(id);
      providerInfo.push({
        id,
        displayName: this.getProviderDisplayName(id),
        requestsToday: state.requestsToday,
        outOfCreditsUntil: state.outOfCreditsUntil,
        available: isAvailable,
      });
    }

    return providerInfo;
  }

  /**
   * Get available provider IDs (those with valid binaries)
   */
  async getAvailableProviders(): Promise<string[]> {
    return this.providerFactory.getAvailableProviderIds();
  }

  getRouter(): Router {
    return this.router;
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  getConfig(): Config {
    return this.config;
  }

  getProviderFactory(): ProviderFactory {
    return this.providerFactory;
  }

  private getProviderDisplayName(id: string): string {
    const displayNames: Record<string, string> = {
      gemini: "Gemini CLI",
      "qwen-code": "Qwen Code CLI",
      codex: "Codex CLI",
    };
    return displayNames[id] || id;
  }
}

/**
 * LazyProviderMap - A Map-like object that lazily loads providers
 *
 * This allows the Router to work with providers without loading them all upfront.
 * Providers are loaded on first access via get().
 */
class LazyProviderMap implements Map<string, Provider> {
  private factory: ProviderFactory;
  private knownIds: Set<string>;
  private cache: Map<string, Provider> = new Map();

  constructor(factory: ProviderFactory, providerIds: string[]) {
    this.factory = factory;
    this.knownIds = new Set(providerIds);
  }

  get(key: string): Provider | undefined {
    // Return from cache if available
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // For lazy loading, we need to handle async loading synchronously
    // The Router will need to be updated to handle async provider loading
    // For now, return undefined and let the Router handle missing providers
    return undefined;
  }

  has(key: string): boolean {
    return this.knownIds.has(key) || this.cache.has(key);
  }

  set(key: string, value: Provider): this {
    this.cache.set(key, value);
    this.knownIds.add(key);
    return this;
  }

  delete(key: string): boolean {
    this.knownIds.delete(key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.knownIds.clear();
    this.cache.clear();
  }

  get size(): number {
    return this.knownIds.size;
  }

  keys(): IterableIterator<string> {
    return this.knownIds.values();
  }

  values(): IterableIterator<Provider> {
    return this.cache.values();
  }

  entries(): IterableIterator<[string, Provider]> {
    return this.cache.entries();
  }

  forEach(callbackfn: (value: Provider, key: string, map: Map<string, Provider>) => void): void {
    this.cache.forEach(callbackfn);
  }

  [Symbol.iterator](): IterableIterator<[string, Provider]> {
    return this.cache[Symbol.iterator]();
  }

  [Symbol.toStringTag] = "LazyProviderMap";

  /**
   * Async method to get a provider (loads if not cached)
   */
  async getAsync(key: string): Promise<Provider | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const provider = await this.factory.getProvider(key);
    if (provider) {
      this.cache.set(key, provider);
    }
    return provider;
  }
}
