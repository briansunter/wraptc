// Test utilities for reliable and consistent testing
import { mkdir, rm } from "node:fs/promises";
import { mock } from "bun:test";

export interface TestEnvironment {
  tempDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a unique temporary directory for testing
 */
export async function createTestEnvironment(prefix = "test"): Promise<TestEnvironment> {
  const testId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempDir = `/tmp/${prefix}-${testId}`;

  await mkdir(tempDir, { recursive: true });

  return {
    tempDir,
    cleanup: async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    },
  };
}

/**
 * Create mock providers for testing
 */
export function createMockProvider(
  id: string,
  displayName: string,
  options: {
    shouldFail?: boolean;
    failWith?: Error;
    supportsStreaming?: boolean;
  } = {},
) {
  const { shouldFail = false, failWith, supportsStreaming = false } = options;

  let currentShouldFail = shouldFail;
  let currentFailWith = failWith;

  return {
    id,
    displayName,
    supportsStreaming,
    prefersJson: true,
    capabilities: ["generate", "edit", "explain", "test"],

    setShouldFail: (fail: boolean, error?: Error) => {
      currentShouldFail = fail;
      currentFailWith = error || new Error("Mock failure");
    },

    runOnce: mock(async (req: any) => {
      if (currentShouldFail && currentFailWith) {
        throw currentFailWith;
      }
      return {
        text: `Response from ${id}`,
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }),

    runStream: mock(async function* (req: any) {
      if (currentShouldFail && currentFailWith) {
        throw currentFailWith;
      }
      yield {
        type: "complete" as const,
        provider: id,
        text: `Response from ${id}`,
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }),

    classifyError: mock(() => "TRANSIENT"),
  };
}

/**
 * Create mock state manager for testing
 */
export function createMockStateManager() {
  return {
    initialize: mock(async () => {}),
    getProviderState: mock(async () => ({
      requestsToday: 0,
      lastErrors: [],
      outOfCreditsUntil: undefined,
      lastUsedAt: undefined,
      lastReset: undefined,
    })),
    recordSuccess: mock(async () => {}),
    recordError: mock(async () => {}),
    markOutOfCredits: mock(async () => {}),
    resetProvider: mock(async () => {}),
    resetAll: mock(async () => {}),
    getState: mock(() => ({ version: "1.0.0", providers: {} })),
    getStatePath: mock(() => "/tmp/mock-state.json"),
    save: mock(async () => {}),
  };
}

/**
 * Create mock config for testing
 */
export function createMockConfig(overrides: Partial<any> = {}) {
  return {
    routing: {
      defaultOrder: ["provider1", "provider2", "provider3"],
      perModeOverride: {},
      ...overrides.routing,
    },
    providers: {
      provider1: {
        binary: "provider1",
        args: [],
        jsonMode: "none",
        streamingMode: "line",
        capabilities: ["generate"],
      },
      ...overrides.providers,
    },
    credits: {
      providers: {},
      ...overrides.credits,
    },
  };
}
