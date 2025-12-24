/**
 * ProviderFactory - Lazy loading and caching for providers
 *
 * Performance optimizations:
 * - Lazy instantiation: Providers are only created when first used
 * - Binary validation caching: `which` lookups are cached
 * - Provider instance caching: Reuse provider instances
 *
 * New: Supports user-defined providers from .ts config files
 */

import type { Provider } from "./providers/index";
import type { ProviderConfig, Config } from "./types";
import type { ProviderDefinition } from "./define-provider";
import { loadProviderConfigs } from "./provider-loader";
import { createConfigurableProvider } from "./providers/configurable";

// Provider creator function type (factory function that creates providers)
type ProviderCreator = (id: string, config: ProviderConfig) => Provider;

// Cache for binary path lookups
const binaryPathCache = new Map<string, string | null>();

// Cache for binary existence checks
const binaryExistsCache = new Map<string, boolean>();

/**
 * Check if a binary exists in PATH (cached)
 */
export async function binaryExists(binary: string): Promise<boolean> {
  if (binaryExistsCache.has(binary)) {
    return binaryExistsCache.get(binary)!;
  }

  try {
    const proc = Bun.spawn(["which", binary], {
      stdout: "pipe",
      stderr: "ignore",
    });
    await proc.exited;
    const exists = proc.exitCode === 0;
    binaryExistsCache.set(binary, exists);
    return exists;
  } catch {
    binaryExistsCache.set(binary, false);
    return false;
  }
}

/**
 * Get the full path to a binary (cached)
 */
export async function getBinaryPath(binary: string): Promise<string | null> {
  if (binaryPathCache.has(binary)) {
    return binaryPathCache.get(binary)!;
  }

  try {
    const proc = Bun.spawn(["which", binary], {
      stdout: "pipe",
      stderr: "ignore",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 0) {
      const path = output.trim();
      binaryPathCache.set(binary, path);
      return path;
    }

    binaryPathCache.set(binary, null);
    return null;
  } catch {
    binaryPathCache.set(binary, null);
    return null;
  }
}

/**
 * Clear the binary caches (useful for testing or when PATH changes)
 */
export function clearBinaryCache(): void {
  binaryPathCache.clear();
  binaryExistsCache.clear();
}

/**
 * ProviderFactory with lazy loading and caching
 *
 * Supports three provider sources:
 * 1. Built-in providers (registered with registerProvider)
 * 2. Config-defined providers (from config.providers)
 * 3. User-defined providers (from ~/.config/wrap-terminalcoder/providers/*.ts)
 */
export class ProviderFactory {
  private config: Config;
  private providerCache: Map<string, Provider> = new Map();
  private providerCreators: Map<string, ProviderCreator> = new Map();
  private loadingPromises: Map<string, Promise<Provider>> = new Map();

  // User-defined providers loaded from .ts config files
  private userProviders: Map<string, ProviderDefinition> = new Map();
  private userProvidersLoaded = false;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Load user-defined providers from .ts config files
   * Call this during initialization
   */
  async loadUserProviders(): Promise<void> {
    if (this.userProvidersLoaded) {
      return;
    }

    try {
      this.userProviders = await loadProviderConfigs();
      this.userProvidersLoaded = true;
    } catch (err) {
      console.warn("Failed to load user providers:", err);
      this.userProvidersLoaded = true;
    }
  }

  /**
   * Get all user-defined provider IDs
   */
  getUserProviderIds(): string[] {
    return Array.from(this.userProviders.keys());
  }

  /**
   * Register a provider creator for a specific provider ID
   */
  registerProvider(id: string, creator: ProviderCreator): void {
    this.providerCreators.set(id, creator);
  }

  /**
   * Register the default CustomProvider creator for fallback
   */
  registerCustomProvider(creator: ProviderCreator): void {
    this.providerCreators.set("__custom__", creator);
  }

  /**
   * Get a provider instance (lazy loaded and cached)
   */
  async getProvider(id: string): Promise<Provider | null> {
    // Check cache first
    if (this.providerCache.has(id)) {
      return this.providerCache.get(id)!;
    }

    // Check if already loading (prevent duplicate instantiation)
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!;
    }

    // Start loading
    const loadPromise = this.loadProvider(id);
    this.loadingPromises.set(id, loadPromise);

    try {
      const provider = await loadPromise;
      return provider;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  private async loadProvider(id: string): Promise<Provider | null> {
    // Ensure user providers are loaded
    await this.loadUserProviders();

    // Priority 1: Check for registered built-in provider creator
    if (this.providerCreators.has(id)) {
      const providerConfig = this.config.providers[id];
      if (providerConfig) {
        const exists = await binaryExists(providerConfig.binary);
        if (!exists) {
          console.warn(`Provider ${id}: binary '${providerConfig.binary}' not found in PATH`);
          return null;
        }
        const creator = this.providerCreators.get(id)!;
        const provider = creator(id, providerConfig);
        this.providerCache.set(id, provider);
        return provider;
      }
    }

    // Priority 2: Check for user-defined provider from .ts config file
    const userDef = this.userProviders.get(id);
    if (userDef) {
      const exists = await binaryExists(userDef.binary);
      if (!exists) {
        console.warn(`Provider ${id}: binary '${userDef.binary}' not found in PATH`);
        return null;
      }
      const provider = createConfigurableProvider(userDef);
      this.providerCache.set(id, provider);
      return provider;
    }

    // Priority 3: Check for config-defined provider with custom fallback
    const providerConfig = this.config.providers[id];
    if (providerConfig) {
      const exists = await binaryExists(providerConfig.binary);
      if (!exists) {
        console.warn(`Provider ${id}: binary '${providerConfig.binary}' not found in PATH`);
        return null;
      }

      // Use custom fallback creator if registered
      const creator = this.providerCreators.get("__custom__");
      if (creator) {
        const provider = creator(id, providerConfig);
        this.providerCache.set(id, provider);
        return provider;
      }
    }

    console.warn(`Provider ${id}: no creator or definition found`);
    return null;
  }

  /**
   * Preload providers in parallel (optional optimization for startup)
   */
  async preloadProviders(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.getProvider(id)));
  }

  /**
   * Get all cached providers
   */
  getCachedProviders(): Map<string, Provider> {
    return new Map(this.providerCache);
  }

  /**
   * Check if a provider is available (binary exists)
   */
  async isProviderAvailable(id: string): Promise<boolean> {
    const providerConfig = this.config.providers[id];
    if (!providerConfig) {
      return false;
    }
    return binaryExists(providerConfig.binary);
  }

  /**
   * Get available provider IDs (those with valid binaries)
   * Includes both config-defined and user-defined providers
   */
  async getAvailableProviderIds(): Promise<string[]> {
    // Ensure user providers are loaded
    await this.loadUserProviders();

    // Combine config providers and user providers
    const configIds = Object.keys(this.config.providers);
    const userIds = Array.from(this.userProviders.keys());
    const allIds = [...new Set([...configIds, ...userIds])];

    const availability = await Promise.all(
      allIds.map(async (id) => {
        // Check user providers first
        const userDef = this.userProviders.get(id);
        if (userDef) {
          return binaryExists(userDef.binary);
        }
        // Then config providers
        const providerConfig = this.config.providers[id];
        if (providerConfig) {
          return binaryExists(providerConfig.binary);
        }
        return false;
      })
    );

    return allIds.filter((_, i) => availability[i]);
  }

  /**
   * Get all registered provider IDs (including user-defined)
   */
  async getAllProviderIds(): Promise<string[]> {
    await this.loadUserProviders();
    const configIds = Object.keys(this.config.providers);
    const userIds = Array.from(this.userProviders.keys());
    return [...new Set([...configIds, ...userIds])];
  }
}

/**
 * Request deduplication for identical concurrent requests
 */
export class RequestDeduplicator {
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 100) {
    this.ttlMs = ttlMs;
  }

  /**
   * Generate a cache key for a request
   */
  private getKey(providerId: string, prompt: string, mode?: string): string {
    return `${providerId}:${mode || "default"}:${prompt.substring(0, 100)}`;
  }

  /**
   * Deduplicate a request - if an identical request is in-flight, return its promise
   */
  async dedupe<T>(
    providerId: string,
    prompt: string,
    mode: string | undefined,
    executor: () => Promise<T>
  ): Promise<T> {
    const key = this.getKey(providerId, prompt, mode);

    // Check if identical request is already in-flight
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)! as Promise<T>;
    }

    // Execute and cache the promise
    const promise = executor().finally(() => {
      // Remove from cache after TTL
      setTimeout(() => {
        this.pendingRequests.delete(key);
      }, this.ttlMs);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear();
  }

  /**
   * Get count of pending requests
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }
}

/**
 * Streaming buffer pool for memory efficiency
 */
export class BufferPool {
  private pool: string[][] = [];
  private readonly maxPoolSize: number;

  constructor(maxPoolSize: number = 10) {
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get a buffer from the pool or create a new one
   */
  acquire(): string[] {
    return this.pool.pop() || [];
  }

  /**
   * Return a buffer to the pool
   */
  release(buffer: string[]): void {
    if (this.pool.length < this.maxPoolSize) {
      buffer.length = 0; // Clear the array
      this.pool.push(buffer);
    }
  }

  /**
   * Get current pool size
   */
  get size(): number {
    return this.pool.length;
  }
}

// Global buffer pool instance
export const globalBufferPool = new BufferPool();
