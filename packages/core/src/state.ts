import { rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FullState, ProviderErrorKind, ProviderState } from "./types";

export interface StateManagerOptions {
  statePath?: string;
}

export class StateManager {
  private statePath: string;
  private state: FullState;
  private isDirty: boolean = false;
  private saveTimer?: Timer;
  private initialized: boolean = false;

  constructor(options: StateManagerOptions = {}) {
    this.statePath = options.statePath || this.getDefaultStatePath();
    this.state = this.createInitialState();
  }

  private getDefaultStatePath(): string {
    return join(process.env.HOME || "~", ".config", "wrap-terminalcoder", "state.json");
  }

  private createInitialState(): FullState {
    return {
      version: "1.0.0",
      providers: {},
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Use Bun.file() for faster file reading
      const file = Bun.file(this.statePath);
      const exists = await file.exists();

      if (exists) {
        const data = await file.text();
        this.state = JSON.parse(data);

        // Reset daily counters if needed
        await this.resetDailyCountersIfNeeded();
      }
    } catch (error) {
      // If parsing fails or other error, start with initial state
      console.error("Failed to load state, starting fresh:", error);
    }

    this.initialized = true;
  }

  private async resetDailyCountersIfNeeded(): Promise<void> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const [_providerId, state] of Object.entries(this.state.providers)) {
      const lastReset = state.lastReset ? new Date(state.lastReset) : null;

      if (!lastReset || lastReset < today) {
        state.requestsToday = 0;
        state.lastReset = now.toISOString();
        state.outOfCreditsUntil = undefined;
        // Reset daily tokens saved counter
        state.tokensSavedToday = 0;
        this.isDirty = true;
      }
    }

    if (this.isDirty) {
      await this.save();
    }
  }

  async getProviderState(providerId: string): Promise<ProviderState> {
    await this.initialize();

    if (!this.state.providers[providerId]) {
      this.state.providers[providerId] = {
        lastUsedAt: undefined,
        requestsToday: 0,
        lastReset: undefined,
        outOfCreditsUntil: undefined,
        lastErrors: [],
        consecutiveErrors: 0,
        tokensSavedToday: 0,
        totalTokensSaved: 0,
      };
      this.isDirty = true;
    }

    // Ensure new fields exist on existing states (migration)
    const state = this.state.providers[providerId];
    if (state.consecutiveErrors === undefined) {
      state.consecutiveErrors = 0;
      this.isDirty = true;
    }
    if (state.tokensSavedToday === undefined) {
      state.tokensSavedToday = 0;
      this.isDirty = true;
    }
    if (state.totalTokensSaved === undefined) {
      state.totalTokensSaved = 0;
      this.isDirty = true;
    }

    return state;
  }

  async recordSuccess(providerId: string, tokensSaved: number = 0): Promise<void> {
    const state = await this.getProviderState(providerId);
    const now = new Date();

    state.lastUsedAt = now.toISOString();
    state.requestsToday++;
    state.lastErrors = []; // Clear errors on success
    state.consecutiveErrors = 0; // Reset error counter on success
    state.tokensSavedToday += tokensSaved;
    state.totalTokensSaved += tokensSaved;
    this.isDirty = true;

    await this.scheduleSave();
  }

  async recordError(providerId: string, kind: ProviderErrorKind, message: string): Promise<void> {
    const state = await this.getProviderState(providerId);

    state.lastErrors.push(`[${new Date().toISOString()}] ${kind}: ${message}`);
    state.consecutiveErrors++;

    // Keep only last 10 errors
    if (state.lastErrors.length > 10) {
      state.lastErrors = state.lastErrors.slice(-10);
    }

    this.isDirty = true;

    await this.scheduleSave();
  }

  /**
   * Check if provider should be blacklisted based on error threshold
   */
  async shouldBlacklist(providerId: string, errorThreshold: number): Promise<boolean> {
    const state = await this.getProviderState(providerId);
    return state.consecutiveErrors >= errorThreshold;
  }

  /**
   * Blacklist a provider for a specified duration
   */
  async blacklistProvider(providerId: string, durationHours: number): Promise<void> {
    const until = new Date();
    until.setHours(until.getHours() + durationHours);
    await this.markOutOfCredits(providerId, until);
  }

  /**
   * Get total tokens saved across all providers
   */
  async getTotalTokensSaved(): Promise<number> {
    await this.initialize();
    return Object.values(this.state.providers).reduce(
      (sum, state) => sum + (state.totalTokensSaved || 0),
      0
    );
  }

  /**
   * Get tokens saved today across all providers
   */
  async getTokensSavedToday(): Promise<number> {
    await this.initialize();
    return Object.values(this.state.providers).reduce(
      (sum, state) => sum + (state.tokensSavedToday || 0),
      0
    );
  }

  async markOutOfCredits(providerId: string, until: Date): Promise<void> {
    const state = await this.getProviderState(providerId);

    state.outOfCreditsUntil = until.toISOString();
    this.isDirty = true;

    await this.scheduleSave();
  }

  async resetProvider(providerId: string): Promise<void> {
    const state = await this.getProviderState(providerId);

    state.requestsToday = 0;
    state.outOfCreditsUntil = undefined;
    state.lastErrors = [];
    state.consecutiveErrors = 0;
    state.tokensSavedToday = 0;
    // Note: totalTokensSaved is preserved across resets
    this.isDirty = true;

    await this.scheduleSave();
  }

  async resetAll(): Promise<void> {
    this.state = this.createInitialState();
    this.isDirty = true;

    await this.save();
  }

  private async scheduleSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // Debounce saves to avoid too many writes
    this.saveTimer = setTimeout(() => {
      this.save().catch(console.error);
    }, 1000);
  }

  async save(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    try {
      // Ensure directory exists using Bun shell
      const dir = dirname(this.statePath);
      await Bun.$`mkdir -p ${dir}`.quiet();

      // Write atomically: write to temp file, then rename
      const tempPath = `${this.statePath}.tmp`;

      // Use Bun.write() for faster file writing
      await Bun.write(tempPath, JSON.stringify(this.state, null, 2));

      // Atomic rename (still using node:fs rename for reliability)
      await rename(tempPath, this.statePath);
    } catch (error) {
      // Log the error but don't throw to avoid breaking tests
      console.error("Failed to save state:", error);
    }

    this.isDirty = false;
  }

  getState(): FullState {
    return { ...this.state };
  }

  getStatePath(): string {
    return this.statePath;
  }
}
