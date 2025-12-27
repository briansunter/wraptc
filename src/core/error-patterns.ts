/**
 * Centralized Error Pattern Registry
 *
 * This module provides a unified set of error patterns for classifying
 * errors across all providers. Providers can extend these patterns
 * with provider-specific patterns.
 */

import type { ProviderErrorKind } from "./types";

/**
 * Default error patterns used by all providers
 * Patterns are matched case-insensitively against stderr + stdout
 */
export const DEFAULT_ERROR_PATTERNS: Record<ProviderErrorKind, string[]> = {
  OUT_OF_CREDITS: [
    "quota exceeded",
    "out of quota",
    "out of credits",
    "credits exhausted",
    "insufficient quota",
    "no credits remaining",
    "credit limit",
    "you've exceeded your quota",
  ],
  RATE_LIMIT: ["rate limit", "rate_limit", "too many requests", "429", "throttle", "slow down"],
  BAD_REQUEST: [
    "bad request",
    "invalid request",
    "malformed",
    "400",
    "validation error",
    "invalid parameter",
  ],
  UNAUTHORIZED: [
    "unauthorized",
    "authentication failed",
    "invalid api key",
    "api key invalid",
    "api key missing",
    "401",
  ],
  FORBIDDEN: ["forbidden", "permission denied", "access denied", "403"],
  NOT_FOUND: ["not found", "404", "no such file", "command not found", "model not found"],
  TIMEOUT: ["timeout", "timed out", "deadline exceeded", "request timeout"],
  CONTEXT_LENGTH: [
    "context length",
    "too long",
    "max tokens",
    "token limit",
    "context too large",
    "input too long",
  ],
  CONTENT_FILTER: ["content filter", "blocked", "safety", "moderation", "policy violation"],
  INTERNAL: ["internal error", "internal server error", "server error", "500", "502", "503"],
  TRANSIENT: [
    "temporarily unavailable",
    "service unavailable",
    "connection refused",
    "econnrefused",
    "econnreset",
    "network error",
    "connection reset",
    "socket hang up",
  ],
  UNKNOWN: [],
};

/**
 * Classify an error based on the combined output using default patterns
 */
export function classifyErrorDefault(
  stderr = "",
  stdout = "",
  exitCode?: number | null,
  httpStatus?: number,
): ProviderErrorKind {
  // HTTP status code based classification takes priority
  if (httpStatus) {
    if (httpStatus === 401) return "UNAUTHORIZED";
    if (httpStatus === 403) return "FORBIDDEN";
    if (httpStatus === 404) return "NOT_FOUND";
    if (httpStatus === 429) return "RATE_LIMIT";
    if (httpStatus >= 500) return "INTERNAL";
  }

  const combined = (stderr + stdout).toLowerCase();

  for (const [kind, patterns] of Object.entries(DEFAULT_ERROR_PATTERNS)) {
    if (patterns.some((p) => combined.includes(p.toLowerCase()))) {
      return kind as ProviderErrorKind;
    }
  }

  // Check exit codes for common error types
  if (exitCode === 127) {
    return "NOT_FOUND"; // Command not found
  }

  return "TRANSIENT";
}

/**
 * Merge provider-specific patterns with default patterns
 */
export function mergeErrorPatterns(
  providerPatterns: Partial<Record<ProviderErrorKind, string[]>>,
): Record<ProviderErrorKind, string[]> {
  const merged = { ...DEFAULT_ERROR_PATTERNS };

  for (const [kind, patterns] of Object.entries(providerPatterns)) {
    if (patterns) {
      merged[kind as ProviderErrorKind] = [
        ...patterns,
        ...DEFAULT_ERROR_PATTERNS[kind as ProviderErrorKind],
      ];
    }
  }

  return merged;
}

/**
 * Create a classifier function with merged patterns
 */
export function createErrorClassifier(
  providerPatterns: Partial<Record<ProviderErrorKind, string[]>> = {},
): (stderr?: string, stdout?: string, exitCode?: number | null) => ProviderErrorKind {
  const patterns = mergeErrorPatterns(providerPatterns);

  return (stderr = "", stdout = "", exitCode?: number | null): ProviderErrorKind => {
    const combined = (stderr + stdout).toLowerCase();

    for (const [kind, kindPatterns] of Object.entries(patterns)) {
      if (kindPatterns.some((p) => combined.includes(p.toLowerCase()))) {
        return kind as ProviderErrorKind;
      }
    }

    // Check exit codes for common error types
    if (exitCode === 127) {
      return "NOT_FOUND";
    }

    return "TRANSIENT";
  };
}
