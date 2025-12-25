import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  MemoryMonitor,
  memoryMonitor,
  formatBytes,
  type MemoryStats,
  type MemoryThresholds,
} from "../../memory-monitor";

// Mock process.memoryUsage
const mockMemoryUsage = mock(() => ({
  heapUsed: 50 * 1024 * 1024, // 50MB
  heapTotal: 100 * 1024 * 1024, // 100MB
  external: 10 * 1024 * 1024, // 10MB
  rss: 150 * 1024 * 1024, // 150MB
  arrayBuffers: 5 * 1024 * 1024, // 5MB
}));

// Mock console methods
const mockConsoleLog = mock();
const mockConsoleWarn = mock();
const mockConsoleError = mock();

describe("MemoryMonitor", () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    // Reset singleton instance
    (MemoryMonitor as any).instance = null;
    monitor = MemoryMonitor.getInstance();

    // Mock process.memoryUsage
    (process as any).memoryUsage = mockMemoryUsage;

    // Mock console methods
    spyOn(console, "log").mockImplementation(mockConsoleLog);
    spyOn(console, "warn").mockImplementation(mockConsoleWarn);
    spyOn(console, "error").mockImplementation(mockConsoleError);

    // Clear all mocks
    mockMemoryUsage.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    // Stop monitoring if running
    monitor.stopMonitoring();
  });

  describe("Singleton Pattern", () => {
    test("should return the same instance", () => {
      const instance1 = MemoryMonitor.getInstance();
      const instance2 = MemoryMonitor.getInstance();
      expect(instance1).toBe(instance2);
    });

    test("should export singleton instance", () => {
      // Reset singleton and get fresh instance
      (MemoryMonitor as any).instance = null;
      const freshInstance = MemoryMonitor.getInstance();
      expect(freshInstance).toBeInstanceOf(MemoryMonitor);
      expect(freshInstance).toBe(MemoryMonitor.getInstance());
    });
  });

  describe("getMemoryStats", () => {
    test("should return formatted memory statistics", () => {
      const stats = monitor.getMemoryStats();

      expect(stats).toEqual({
        heapUsed: 50, // 50MB
        heapTotal: 100, // 100MB
        external: 10, // 10MB
        rss: 150, // 150MB
        arrayBuffers: 5, // 5MB
      });

      expect(process.memoryUsage).toHaveBeenCalledTimes(1);
    });

    test("should round values to nearest MB", () => {
      spyOn(process, "memoryUsage").mockReturnValueOnce({
        heapUsed: 50.7 * 1024 * 1024, // 50.7MB
        heapTotal: 100.3 * 1024 * 1024, // 100.3MB
        external: 10.9 * 1024 * 1024, // 10.9MB
        rss: 150.1 * 1024 * 1024, // 150.1MB
        arrayBuffers: 5.5 * 1024 * 1024, // 5.5MB
      });

      const stats = monitor.getMemoryStats();

      expect(stats).toEqual({
        heapUsed: 51, // Rounded up
        heapTotal: 100, // Rounded down
        external: 11, // Rounded up
        rss: 150, // Rounded down
        arrayBuffers: 6, // Rounded up
      });
    });
  });

  describe("checkMemoryLimit", () => {
    test("should return true when usage is below threshold", () => {
      // 50MB used / 100MB total = 50% < 85%
      expect(monitor.checkMemoryLimit(0.85)).toBe(true);
    });

    test("should return false when usage exceeds threshold", () => {
      // 50MB used / 100MB total = 50% < 30%
      expect(monitor.checkMemoryLimit(0.3)).toBe(false);
    });

    test("should use default threshold of 0.85", () => {
      expect(monitor.checkMemoryLimit()).toBe(true);
    });
  });

  describe("getMemoryUsagePercent", () => {
    test("should calculate and round memory usage percentage", () => {
      // 50MB / 100MB = 50%
      expect(monitor.getMemoryUsagePercent()).toBe(50);
    });

    test("should handle decimal percentages", () => {
      spyOn(process, "memoryUsage").mockReturnValueOnce({
        heapUsed: 33 * 1024 * 1024, // 33MB
        heapTotal: 100 * 1024 * 1024, // 100MB
        external: 0,
        rss: 0,
        arrayBuffers: 0,
      });

      // 33MB / 100MB = 33%
      expect(monitor.getMemoryUsagePercent()).toBe(33);
    });
  });

  describe("formatMemoryStats", () => {
    test("should format memory stats with provided stats", () => {
      const customStats: MemoryStats = {
        heapUsed: 25,
        heapTotal: 50,
        external: 5,
        rss: 75,
        arrayBuffers: 2,
      };

      spyOn(monitor, "getMemoryUsagePercent").mockReturnValue(50);

      const result = monitor.formatMemoryStats(customStats);
      expect(result).toBe("Heap: 25MB/50MB (50%) | RSS: 75MB | Buffers: 2MB");
    });

    test("should use current stats when none provided", () => {
      spyOn(monitor, "getMemoryUsagePercent").mockReturnValue(50);

      const result = monitor.formatMemoryStats();
      expect(result).toBe("Heap: 50MB/100MB (50%) | RSS: 150MB | Buffers: 5MB");
    });
  });

  describe("startMonitoring", () => {
    test("should start periodic monitoring", () => {
      monitor.startMonitoring(100);

      expect(monitor["isMonitoring"]).toBe(true);
      expect(monitor["intervalId"]).not.toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        "[MemoryMonitor] Started monitoring memory usage every 100ms",
      );
    });

    test("should not start if already monitoring", () => {
      monitor.startMonitoring(100);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        "[MemoryMonitor] Started monitoring memory usage every 100ms",
      );

      // Try to start again
      monitor.startMonitoring(100);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        "[MemoryMonitor] Already monitoring memory usage",
      );
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    });

    test("should log info level by default", async () => {
      monitor.startMonitoring(50); // Short interval for testing

      // Wait for at least one interval
      await new Promise((resolve) => setTimeout(resolve, 60));

      monitor.stopMonitoring();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        "[MemoryMonitor] Heap: 50MB/100MB (50%) | RSS: 150MB | Buffers: 5MB",
      );
    });

    test("should trigger warning alert when above warning threshold", async () => {
      monitor.setThresholds({ warning: 0.3, critical: 0.9 }); // 30% warning

      monitor.startMonitoring(50);

      // Wait for monitoring to trigger
      await new Promise((resolve) => setTimeout(resolve, 60));

      monitor.stopMonitoring();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[MemoryMonitor] WARNING: Heap: 50MB/100MB (50%) | RSS: 150MB | Buffers: 5MB",
      );
    });

    test("should trigger critical alert when above critical threshold", async () => {
      monitor.setThresholds({ warning: 0.3, critical: 0.4 }); // 40% critical

      monitor.startMonitoring(50);

      // Wait for monitoring to trigger
      await new Promise((resolve) => setTimeout(resolve, 60));

      monitor.stopMonitoring();

      expect(mockConsoleError).toHaveBeenCalledWith(
        "[MemoryMonitor] CRITICAL: Heap: 50MB/100MB (50%) | RSS: 150MB | Buffers: 5MB",
      );
    });
  });

  describe("stopMonitoring", () => {
    test("should stop monitoring and clear interval", () => {
      monitor.startMonitoring(100);
      expect(monitor["isMonitoring"]).toBe(true);

      monitor.stopMonitoring();

      expect(monitor["isMonitoring"]).toBe(false);
      expect(monitor["intervalId"]).toBeNull();
      expect(console.log).toHaveBeenCalledWith("[MemoryMonitor] Stopped monitoring");
    });

    test("should handle stopping when not monitoring", () => {
      monitor.stopMonitoring();

      expect(console.log).toHaveBeenCalledWith("[MemoryMonitor] Stopped monitoring");
    });
  });

  describe("setThresholds", () => {
    test("should update memory thresholds", () => {
      const newThresholds: MemoryThresholds = { warning: 0.7, critical: 0.85 };

      monitor.setThresholds(newThresholds);

      expect(monitor["thresholds"]).toEqual(newThresholds);
    });
  });

  describe("forceGC", () => {
    test("should trigger garbage collection when available", () => {
      (global as any).gc = mock();

      monitor.forceGC();

      expect((global as any).gc).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith("[MemoryMonitor] Garbage collection triggered");
    });

    test("should log when GC is not available", () => {
      delete (global as any).gc;

      monitor.forceGC();

      expect(console.log).toHaveBeenCalledWith(
        "[MemoryMonitor] Garbage collection not available (run with --expose-gc flag)",
      );
    });
  });

  describe("logMemoryReport", () => {
    test("should log detailed memory report", () => {
      spyOn(monitor, "getMemoryUsagePercent").mockReturnValue(50);

      monitor.logMemoryReport();

      expect(console.log).toHaveBeenCalledWith("[MemoryMonitor] === MEMORY REPORT ===");
      expect(console.log).toHaveBeenCalledWith("Heap Used: 50MB");
      expect(console.log).toHaveBeenCalledWith("Heap Total: 100MB");
      expect(console.log).toHaveBeenCalledWith("RSS: 150MB");
      expect(console.log).toHaveBeenCalledWith("External: 10MB");
      expect(console.log).toHaveBeenCalledWith("Array Buffers: 5MB");
      expect(console.log).toHaveBeenCalledWith("Usage: 50%");
      expect(console.log).toHaveBeenCalledWith("[MemoryMonitor] ====================");
    });
  });

  describe("triggerMemoryAlert", () => {
    test("should log critical alert message", () => {
      const stats: MemoryStats = {
        heapUsed: 90,
        heapTotal: 100,
        external: 10,
        rss: 150,
        arrayBuffers: 5,
      };

      (monitor as any).triggerMemoryAlert("critical", stats);

      expect(console.error).toHaveBeenCalledWith(
        "[MemoryMonitor] Memory usage critical! Consider:\n        1. Restarting the application\n        2. Reducing concurrent requests\n        3. Implementing streaming limits\n        4. Adding more memory monitoring",
      );
    });

    test("should not log for warning alerts", () => {
      const stats: MemoryStats = {
        heapUsed: 80,
        heapTotal: 100,
        external: 10,
        rss: 150,
        arrayBuffers: 5,
      };

      (monitor as any).triggerMemoryAlert("warning", stats);

      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });
});

describe("formatBytes", () => {
  test("should format bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
  });

  test("should handle decimal places", () => {
    expect(formatBytes(1536, 1)).toBe("1.5 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  test("should handle negative decimals", () => {
    expect(formatBytes(1536, -1)).toBe("2 KB");
  });

  test("should handle large numbers", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 2)).toBe("2 TB");
  });
});
