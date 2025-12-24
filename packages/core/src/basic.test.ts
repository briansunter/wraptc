import { describe, test, expect } from "bun:test";

describe("Basic test verification", () => {
  test("should verify test framework works", () => {
    expect(1 + 1).toBe(2);
  });

  test("should verify async operations", async () => {
    const result = await Promise.resolve("success");
    expect(result).toBe("success");
  });
});
