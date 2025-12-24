import type {
  CodingRequest,
  CodingResponse,
  ProviderErrorKind,
  ProviderErrorContext,
} from "./types";
import type { Provider } from "./providers/index";
import type { StateManager } from "./state";
import type { Config } from "./types";

export interface RouterOptions {
  config: Config;
  stateManager: StateManager;
}

/**
 * Extended Map interface that supports async provider loading
 */
interface AsyncProviderMap extends Map<string, Provider> {
  getAsync?(key: string): Promise<Provider | null>;
}

export class Router {
  private providers: AsyncProviderMap;
  private config: Config;
  private stateManager: StateManager;

  constructor(providers: AsyncProviderMap, options: RouterOptions) {
    this.providers = providers;
    this.config = options.config;
    this.stateManager = options.stateManager;
  }

  /**
   * Get a provider, supporting both sync and async loading
   */
  private async getProvider(id: string): Promise<Provider | null> {
    // Try async loading first (for lazy-loaded providers)
    if (this.providers.getAsync) {
      return this.providers.getAsync(id);
    }
    // Fall back to sync get
    return this.providers.get(id) || null;
  }

  async route(
    req: CodingRequest,
    opts: { signal?: AbortSignal; cwd?: string } = {},
  ): Promise<CodingResponse> {
    const startTime = Date.now();

    // Build candidate list
    const candidates = this.getCandidateProviders(req);
    if (candidates.length === 0) {
      throw new Error("No available providers configured");
    }

    // Try each provider in order
    const errors: Array<{ provider: string; error: Error; kind: ProviderErrorKind }> = [];

    for (const providerId of candidates) {
      const provider = await this.getProvider(providerId);
      if (!provider) {
        errors.push({
          provider: providerId,
          error: new Error(`Provider ${providerId} not found or unavailable`),
          kind: "NOT_FOUND",
        });
        continue;
      }

      // Check if provider is marked as out of credits
      const state = await this.stateManager.getProviderState(providerId);
      if (state.outOfCreditsUntil && new Date(state.outOfCreditsUntil) > new Date()) {
        errors.push({
          provider: providerId,
          error: new Error(
            `Provider ${providerId} is out of credits until ${state.outOfCreditsUntil}`,
          ),
          kind: "OUT_OF_CREDITS",
        });
        continue;
      }

      // Check daily limit
      const creditConfig = this.config.credits.providers[providerId];
      if (
        creditConfig &&
        "dailyRequestLimit" in creditConfig &&
        state.requestsToday >= creditConfig.dailyRequestLimit
      ) {
        // Mark as out of credits for rest of day
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        await this.stateManager.markOutOfCredits(providerId, tomorrow);

        errors.push({
          provider: providerId,
          error: new Error(`Daily request limit exceeded for ${providerId}`),
          kind: "OUT_OF_CREDITS",
        });
        continue;
      }

      try {
        // Execute request
        const result = await provider.runOnce(req, opts);

        // Update state on success
        await this.stateManager.recordSuccess(providerId);

        return {
          provider: providerId,
          text: result.text,
          usage: result.usage,
          meta: {
            elapsedMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        const err = error as Error;
        const context: ProviderErrorContext = {
          exitCode: "exitCode" in err ? (err as any).exitCode : undefined,
          stderr: err.message,
          stdout: "stdout" in err ? (err as any).stdout : undefined,
        };

        const errorKind = provider.classifyError(context);

        // Update state based on error
        await this.stateManager.recordError(providerId, errorKind, err.message);

        // For OUT_OF_CREDITS or RATE_LIMIT, mark provider as unavailable for cooldown
        if (errorKind === "OUT_OF_CREDITS" || errorKind === "RATE_LIMIT") {
          const cooldownTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await this.stateManager.markOutOfCredits(providerId, cooldownTime);
        }

        // Errors that should fail immediately (user needs to fix request/config)
        if (errorKind === "BAD_REQUEST") {
          throw new Error(`Bad request: ${err.message}`);
        }
        if (errorKind === "UNAUTHORIZED") {
          throw new Error(`Unauthorized: ${err.message}`);
        }
        if (errorKind === "FORBIDDEN") {
          throw new Error(`Forbidden: ${err.message}`);
        }
        if (errorKind === "CONTEXT_LENGTH") {
          throw new Error(`Context too long: ${err.message}`);
        }
        if (errorKind === "CONTENT_FILTER") {
          throw new Error(`Content filtered: ${err.message}`);
        }

        // For other errors, log and continue to next provider
        errors.push({ provider: providerId, error: err, kind: errorKind });
      }
    }

    // All providers failed
    const errorSummary = errors
      .map((e) => `${e.provider} (${e.kind}): ${e.error.message}`)
      .join("; ");
    throw new Error(`All providers failed: ${errorSummary}`);
  }

  async *routeStream(
    req: CodingRequest,
    opts: { signal?: AbortSignal; cwd?: string } = {},
  ): AsyncGenerator<CodingResponse> {
    const startTime = Date.now();

    // Build candidate list
    const candidates = this.getCandidateProviders(req);
    if (candidates.length === 0) {
      throw new Error("No available providers configured");
    }

    // Try each provider in order
    const errors: Array<{ provider: string; error: Error; kind: ProviderErrorKind }> = [];

    for (const providerId of candidates) {
      const provider = await this.getProvider(providerId);
      if (!provider) {
        errors.push({
          provider: providerId,
          error: new Error(`Provider ${providerId} not found or unavailable`),
          kind: "NOT_FOUND",
        });
        continue;
      }

      // Check if provider is marked as out of credits
      const state = await this.stateManager.getProviderState(providerId);
      if (state.outOfCreditsUntil && new Date(state.outOfCreditsUntil) > new Date()) {
        errors.push({
          provider: providerId,
          error: new Error(
            `Provider ${providerId} is out of credits until ${state.outOfCreditsUntil}`,
          ),
          kind: "OUT_OF_CREDITS",
        });
        continue;
      }

      // Check daily limit
      const creditConfig = this.config.credits.providers[providerId];
      if (
        creditConfig &&
        "dailyRequestLimit" in creditConfig &&
        state.requestsToday >= creditConfig.dailyRequestLimit
      ) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        await this.stateManager.markOutOfCredits(providerId, tomorrow);

        errors.push({
          provider: providerId,
          error: new Error(`Daily request limit exceeded for ${providerId}`),
          kind: "OUT_OF_CREDITS",
        });
        continue;
      }

      try {
        let fullText = "";

        // Execute streaming request
        for await (const event of provider.runStream(req, opts)) {
          if (event.type === "complete") {
            await this.stateManager.recordSuccess(providerId);
            yield {
              provider: providerId,
              text: event.text,
              usage: event.usage,
              meta: {
                elapsedMs: Date.now() - startTime,
              },
            };
            return; // Success, exit generator
          }
          // Pass through events (could be extended to yield events too)
        }
      } catch (error) {
        const err = error as Error;
        const context: ProviderErrorContext = {
          exitCode: "exitCode" in err ? (err as any).exitCode : undefined,
          stderr: err.message,
          stdout: "stdout" in err ? (err as any).stdout : undefined,
        };

        const errorKind = provider.classifyError(context);
        await this.stateManager.recordError(providerId, errorKind, err.message);

        if (errorKind === "OUT_OF_CREDITS" || errorKind === "RATE_LIMIT") {
          const cooldownTime = new Date(Date.now() + 60 * 60 * 1000);
          await this.stateManager.markOutOfCredits(providerId, cooldownTime);
        }

        // Errors that should fail immediately (user needs to fix request/config)
        if (errorKind === "BAD_REQUEST") {
          throw new Error(`Bad request: ${err.message}`);
        }
        if (errorKind === "UNAUTHORIZED") {
          throw new Error(`Unauthorized: ${err.message}`);
        }
        if (errorKind === "FORBIDDEN") {
          throw new Error(`Forbidden: ${err.message}`);
        }
        if (errorKind === "CONTEXT_LENGTH") {
          throw new Error(`Context too long: ${err.message}`);
        }
        if (errorKind === "CONTENT_FILTER") {
          throw new Error(`Content filtered: ${err.message}`);
        }

        errors.push({ provider: providerId, error: err, kind: errorKind });
      }
    }

    // All providers failed
    const errorSummary = errors
      .map((e) => `${e.provider} (${e.kind}): ${e.error.message}`)
      .join("; ");
    throw new Error(`All providers failed: ${errorSummary}`);
  }

  private getCandidateProviders(req: CodingRequest): string[] {
    // If provider is explicitly specified, use only that provider
    if (req.provider) {
      return [req.provider];
    }

    // Check for per-mode override
    const mode = req.mode || "generate";
    if (this.config.routing.perModeOverride?.[mode]) {
      return this.config.routing.perModeOverride[mode];
    }

    // Use default order
    return this.config.routing.defaultOrder;
  }

  async getProviderInfo(): Promise<
    Array<{
      id: string;
      displayName: string;
      outOfCreditsUntil?: Date;
      requestsToday: number;
      available: boolean;
    }>
  > {
    const info: Array<{
      id: string;
      displayName: string;
      outOfCreditsUntil?: Date;
      requestsToday: number;
      available: boolean;
    }> = [];

    for (const providerId of this.providers.keys()) {
      const provider = await this.getProvider(providerId);
      const state = await this.stateManager.getProviderState(providerId);

      info.push({
        id: providerId,
        displayName: provider?.displayName || providerId,
        outOfCreditsUntil: state.outOfCreditsUntil ? new Date(state.outOfCreditsUntil) : undefined,
        requestsToday: state.requestsToday,
        available: !!provider,
      });
    }

    return info;
  }
}
