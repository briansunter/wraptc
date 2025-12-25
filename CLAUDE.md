# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Development mode with watch
bun run dev

# Run all tests
bun test

# Run tests with watch
bun test --watch

# Run specific test file
bun test packages/core/src/__tests__/unit/router.test.ts

# Run unit tests only (core package)
bun run --cwd packages/core test:unit

# Run integration tests
bun run --cwd packages/core test:integration

# Lint
bun run lint

# Lint with auto-fix
bun run lint:fix

# Type check (via build)
bun run build
```

## Architecture

wrap-terminalcoder is a unified CLI wrapper for multiple coding AI agents (Gemini CLI, OpenCode, Qwen Code, Codex CLI). It's structured as a Bun monorepo with three packages:

### Package Structure

- **`packages/core`**: Core library with routing, state management, and provider abstractions
- **`packages/cli`**: Commander-based CLI (`wtc` command)
- **`packages/mcp-server`**: MCP protocol server for Claude Desktop integration

### Core Components (`packages/core/src/`)

**Router (`router.ts`)**: Selects providers based on priority, availability, and credit limits. Supports per-mode routing overrides and automatic fallback on failures.

**StateManager (`state.ts`)**: Persists provider state to `~/.config/wrap-terminalcoder/state.json`. Tracks daily request counts, credit exhaustion, and error history. Uses atomic writes and debounced saves.

**ConfigLoader (`config.ts`)**: Merges configs from multiple sources in order: defaults → `/etc/wrap-terminalcoder/config.json` → `~/.config/wrap-terminalcoder/config.json` → `./.config/wrap-terminalcoder/config.json` → `WTC_*` env vars. Validates with Zod.

**Provider System**:
- `Provider` interface (`providers/index.ts`) defines the contract
- `ProcessProvider` base class handles CLI execution with Bun.spawn
- Concrete providers: `GeminiProvider`, `QwenCodeProvider`, `CodexProvider`, `CustomProvider`
- `ProviderFactory` (`provider-factory.ts`) enables lazy loading of providers

**WrapTerminalCoder (`wrap-terminalcoder.ts`)**: Main entry point that wires together ConfigLoader, StateManager, ProviderFactory, and Router. Uses `LazyProviderMap` for on-demand provider loading.

### Error Handling

Errors are classified into kinds: `OUT_OF_CREDITS`, `RATE_LIMIT`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `CONTEXT_LENGTH`, `CONTENT_FILTER`, `TRANSIENT`, `INTERNAL`. The router automatically falls back to the next provider for retryable errors but throws immediately for user-fixable errors (BAD_REQUEST, UNAUTHORIZED, etc.).

### Adapter & Plugin Systems

The codebase has two extension mechanisms (in `packages/core/src/`):
- **Adapters** (`adapters/`): Lightweight terminal coder wrappers with `defineAdapter()` API
- **Plugins** (`plugin/`): Formal plugin registry with lifecycle hooks via `PluginRegistry`

## Testing Conventions

- Tests use Bun's built-in test runner
- Unit tests: `packages/core/src/__tests__/unit/`
- Integration tests: `packages/core/src/__tests__/integration/`
- Test utilities in `packages/core/src/__tests__/test-utils.ts`

## Key Patterns

- Uses Bun APIs: `Bun.spawn()` for processes, `Bun.file()` for file I/O, `Bun.$` for shell commands
- All async operations use async/await
- Configuration validated with Zod schemas (see `types.ts`)
- State writes are atomic (write to .tmp, then rename)
