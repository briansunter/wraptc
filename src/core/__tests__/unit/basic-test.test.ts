import { describe, expect, test } from "bun:test";
import { ConfigLoader } from "../../config";
import { MemoryMonitor } from "../../memory-monitor";
import { Router } from "../../router";
import { StateManager } from "../../state";
import { WrapTerminalCoder } from "../../wrap-terminalcoder";

describe("Basic Class Tests", () => {
  test("StateManager can be instantiated", () => {
    const sm = new StateManager();
    expect(sm).toBeDefined();
    expect(typeof sm).toBe("object");
  });

  test("ConfigLoader can be instantiated", () => {
    const cl = new ConfigLoader();
    expect(cl).toBeDefined();
    expect(typeof cl).toBe("object");
  });

  test("MemoryMonitor can be instantiated", () => {
    const mm = MemoryMonitor.getInstance();
    expect(mm).toBeDefined();
    expect(typeof mm).toBe("object");
  });

  test("Router can be instantiated with empty providers", () => {
    const router = new Router(new Map(), {
      config: {
        routing: { defaultOrder: [], perModeOverride: {} },
        providers: {},
        credits: { providers: {} },
      },
      stateManager: new StateManager(),
    });
    expect(router).toBeDefined();
    expect(typeof router).toBe("object");
  });

  test("WrapTerminalCoder.create returns a promise", async () => {
    const promise = WrapTerminalCoder.create();
    expect(promise).toBeInstanceOf(Promise);
  });
});
