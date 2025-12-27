import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ERROR_PATTERNS,
  classifyErrorDefault,
  createErrorClassifier,
  mergeErrorPatterns,
} from "../../error-patterns";

describe("error-patterns", () => {
  describe("DEFAULT_ERROR_PATTERNS", () => {
    test("should have patterns for all error kinds", () => {
      const expectedKinds = [
        "OUT_OF_CREDITS",
        "RATE_LIMIT",
        "BAD_REQUEST",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "TIMEOUT",
        "CONTEXT_LENGTH",
        "CONTENT_FILTER",
        "INTERNAL",
        "TRANSIENT",
        "UNKNOWN",
      ];

      for (const kind of expectedKinds) {
        expect(DEFAULT_ERROR_PATTERNS).toHaveProperty(kind);
        expect(
          Array.isArray(DEFAULT_ERROR_PATTERNS[kind as keyof typeof DEFAULT_ERROR_PATTERNS]),
        ).toBe(true);
      }
    });

    test("should have empty patterns for UNKNOWN", () => {
      expect(DEFAULT_ERROR_PATTERNS.UNKNOWN).toEqual([]);
    });
  });

  describe("classifyErrorDefault", () => {
    test("should classify OUT_OF_CREDITS errors", () => {
      expect(classifyErrorDefault("quota exceeded")).toBe("OUT_OF_CREDITS");
      expect(classifyErrorDefault("out of credits")).toBe("OUT_OF_CREDITS");
      expect(classifyErrorDefault("insufficient quota")).toBe("OUT_OF_CREDITS");
    });

    test("should classify RATE_LIMIT errors", () => {
      expect(classifyErrorDefault("rate limit exceeded")).toBe("RATE_LIMIT");
      expect(classifyErrorDefault("429 too many requests")).toBe("RATE_LIMIT");
      expect(classifyErrorDefault("", "slow down please")).toBe("RATE_LIMIT");
    });

    test("should classify BAD_REQUEST errors", () => {
      expect(classifyErrorDefault("400 bad request")).toBe("BAD_REQUEST");
      expect(classifyErrorDefault("invalid request format")).toBe("BAD_REQUEST");
      expect(classifyErrorDefault("malformed json")).toBe("BAD_REQUEST");
    });

    test("should classify UNAUTHORIZED errors", () => {
      expect(classifyErrorDefault("401 unauthorized")).toBe("UNAUTHORIZED");
      expect(classifyErrorDefault("invalid api key")).toBe("UNAUTHORIZED");
      expect(classifyErrorDefault("authentication failed")).toBe("UNAUTHORIZED");
    });

    test("should classify FORBIDDEN errors", () => {
      expect(classifyErrorDefault("403 forbidden")).toBe("FORBIDDEN");
      expect(classifyErrorDefault("permission denied")).toBe("FORBIDDEN");
      expect(classifyErrorDefault("access denied")).toBe("FORBIDDEN");
    });

    test("should classify NOT_FOUND errors", () => {
      expect(classifyErrorDefault("404 not found")).toBe("NOT_FOUND");
      expect(classifyErrorDefault("no such file or directory")).toBe("NOT_FOUND");
      expect(classifyErrorDefault("", "", 127)).toBe("NOT_FOUND");
    });

    test("should classify TIMEOUT errors", () => {
      expect(classifyErrorDefault("request timeout")).toBe("TIMEOUT");
      expect(classifyErrorDefault("operation timed out")).toBe("TIMEOUT");
      expect(classifyErrorDefault("deadline exceeded")).toBe("TIMEOUT");
    });

    test("should classify CONTEXT_LENGTH errors", () => {
      expect(classifyErrorDefault("context length exceeded")).toBe("CONTEXT_LENGTH");
      expect(classifyErrorDefault("input too long")).toBe("CONTEXT_LENGTH");
      expect(classifyErrorDefault("max tokens exceeded")).toBe("CONTEXT_LENGTH");
    });

    test("should classify CONTENT_FILTER errors", () => {
      expect(classifyErrorDefault("content filter triggered")).toBe("CONTENT_FILTER");
      expect(classifyErrorDefault("request blocked by safety")).toBe("CONTENT_FILTER");
      expect(classifyErrorDefault("policy violation")).toBe("CONTENT_FILTER");
    });

    test("should classify INTERNAL errors", () => {
      expect(classifyErrorDefault("500 internal server error")).toBe("INTERNAL");
      expect(classifyErrorDefault("502 bad gateway")).toBe("INTERNAL");
      expect(classifyErrorDefault("internal error occurred")).toBe("INTERNAL");
    });

    test("should classify TRANSIENT errors", () => {
      expect(classifyErrorDefault("connection refused")).toBe("TRANSIENT");
      expect(classifyErrorDefault("econnrefused")).toBe("TRANSIENT");
      expect(classifyErrorDefault("network error")).toBe("TRANSIENT");
    });

    test("should default to TRANSIENT for unmatched errors", () => {
      expect(classifyErrorDefault("some random error")).toBe("TRANSIENT");
      expect(classifyErrorDefault("")).toBe("TRANSIENT");
    });

    test("should combine stderr and stdout", () => {
      expect(classifyErrorDefault("some stderr", "quota exceeded")).toBe("OUT_OF_CREDITS");
      expect(classifyErrorDefault("rate limit", "some stdout")).toBe("RATE_LIMIT");
    });

    test("should handle undefined values", () => {
      expect(classifyErrorDefault(undefined as any, undefined as any)).toBe("TRANSIENT");
      expect(classifyErrorDefault("", "")).toBe("TRANSIENT");
    });
  });

  describe("mergeErrorPatterns", () => {
    test("should merge provider patterns with defaults", () => {
      const providerPatterns = {
        OUT_OF_CREDITS: ["plan limit", "subscription required"],
        RATE_LIMIT: ["throttled"],
      };

      const merged = mergeErrorPatterns(providerPatterns);

      // Provider patterns should come first
      expect(merged.OUT_OF_CREDITS[0]).toBe("plan limit");
      expect(merged.OUT_OF_CREDITS[1]).toBe("subscription required");
      // Default patterns should follow
      expect(merged.OUT_OF_CREDITS).toContain("quota exceeded");

      // RATE_LIMIT should have both
      expect(merged.RATE_LIMIT[0]).toBe("throttled");
      expect(merged.RATE_LIMIT).toContain("rate limit");

      // Untouched kinds should remain default
      expect(merged.TIMEOUT).toEqual(DEFAULT_ERROR_PATTERNS.TIMEOUT);
    });

    test("should handle empty provider patterns", () => {
      const merged = mergeErrorPatterns({});
      expect(merged).toEqual(DEFAULT_ERROR_PATTERNS);
    });
  });

  describe("createErrorClassifier", () => {
    test("should create classifier with default patterns", () => {
      const classify = createErrorClassifier();

      expect(classify("quota exceeded")).toBe("OUT_OF_CREDITS");
      expect(classify("rate limit")).toBe("RATE_LIMIT");
      expect(classify("random error")).toBe("TRANSIENT");
    });

    test("should create classifier with custom patterns", () => {
      const classify = createErrorClassifier({
        OUT_OF_CREDITS: ["custom credit error"],
      });

      expect(classify("custom credit error")).toBe("OUT_OF_CREDITS");
      // Should still match default patterns
      expect(classify("quota exceeded")).toBe("OUT_OF_CREDITS");
    });

    test("should handle exit code 127 as NOT_FOUND", () => {
      const classify = createErrorClassifier();
      expect(classify("", "", 127)).toBe("NOT_FOUND");
    });

    test("should ignore exit code when patterns match", () => {
      const classify = createErrorClassifier();
      expect(classify("rate limit", "", 127)).toBe("RATE_LIMIT");
    });
  });
});
