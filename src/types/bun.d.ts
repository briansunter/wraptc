// Type augmentations for Bun-specific APIs
declare global {
  namespace Bun {
    interface File {
      watch(): {
        close(): void;
        ref(): void;
        unref(): void;
      };
    }
  }
}

export {};
