// Memory monitoring utilities for wrap-terminalcoder
// Helps prevent memory leaks and monitor memory usage

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface MemoryThresholds {
  warning: number; // e.g., 0.8 for 80%
  critical: number; // e.g., 0.9 for 90%
}

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private isMonitoring = false;
  private intervalId: NodeJS.Timeout | null = null;
  private thresholds: MemoryThresholds = { warning: 0.8, critical: 0.9 };

  private constructor() {}

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      arrayBuffers: Math.round((usage as any).arrayBuffers / 1024 / 1024), // MB
    };
  }

  /**
   * Check if memory usage is within acceptable limits
   */
  checkMemoryLimit(threshold = 0.85): boolean {
    const usage = process.memoryUsage();
    const heapUsedPercent = usage.heapUsed / usage.heapTotal;
    return heapUsedPercent < threshold;
  }

  /**
   * Get memory usage as a percentage
   */
  getMemoryUsagePercent(): number {
    const usage = process.memoryUsage();
    return Math.round((usage.heapUsed / usage.heapTotal) * 100);
  }

  /**
   * Format memory stats for logging
   */
  formatMemoryStats(stats?: MemoryStats): string {
    const s = stats || this.getMemoryStats();
    return `Heap: ${s.heapUsed}MB/${s.heapTotal}MB (${this.getMemoryUsagePercent()}%) | RSS: ${s.rss}MB | Buffers: ${s.arrayBuffers}MB`;
  }

  /**
   * Start periodic memory monitoring
   */
  startMonitoring(intervalMs = 30000, logLevel: "info" | "warn" | "error" = "info"): void {
    if (this.isMonitoring) {
      console.log("[MemoryMonitor] Already monitoring memory usage");
      return;
    }

    this.isMonitoring = true;
    this.intervalId = setInterval(() => {
      const stats = this.getMemoryStats();
      const usagePercent = this.getMemoryUsagePercent();

      if (usagePercent >= this.thresholds.critical * 100) {
        console.error(`[MemoryMonitor] CRITICAL: ${this.formatMemoryStats(stats)}`);
        this.triggerMemoryAlert("critical", stats);
      } else if (usagePercent >= this.thresholds.warning * 100) {
        console.warn(`[MemoryMonitor] WARNING: ${this.formatMemoryStats(stats)}`);
        this.triggerMemoryAlert("warning", stats);
      } else if (logLevel === "info") {
        console.log(`[MemoryMonitor] ${this.formatMemoryStats(stats)}`);
      }
    }, intervalMs);

    console.log(`[MemoryMonitor] Started monitoring memory usage every ${intervalMs}ms`);
  }

  /**
   * Stop periodic memory monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    console.log("[MemoryMonitor] Stopped monitoring");
  }

  /**
   * Set memory usage thresholds
   */
  setThresholds(thresholds: MemoryThresholds): void {
    this.thresholds = thresholds;
  }

  /**
   * Force garbage collection if available (Node.js with --expose-gc)
   */
  forceGC(): void {
    if (global.gc) {
      global.gc();
      console.log("[MemoryMonitor] Garbage collection triggered");
    } else {
      console.log("[MemoryMonitor] Garbage collection not available (run with --expose-gc flag)");
    }
  }

  /**
   * Log detailed memory report
   */
  logMemoryReport(): void {
    const stats = this.getMemoryStats();
    console.log("[MemoryMonitor] === MEMORY REPORT ===");
    console.log(`Heap Used: ${stats.heapUsed}MB`);
    console.log(`Heap Total: ${stats.heapTotal}MB`);
    console.log(`RSS: ${stats.rss}MB`);
    console.log(`External: ${stats.external}MB`);
    console.log(`Array Buffers: ${stats.arrayBuffers}MB`);
    console.log(`Usage: ${this.getMemoryUsagePercent()}%`);
    console.log("[MemoryMonitor] ====================");
  }

  private triggerMemoryAlert(level: "warning" | "critical", stats: MemoryStats): void {
    // Emit event or call alerting system
    if (level === "critical") {
      console.error(`[MemoryMonitor] Memory usage critical! Consider:
        1. Restarting the application
        2. Reducing concurrent requests
        3. Implementing streaming limits
        4. Adding more memory monitoring`);
    }
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();

// Helper function to format bytes
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}
