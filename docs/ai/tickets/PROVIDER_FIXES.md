# Provider Implementation - Fixed Summary

## Status: ✅ ALL PROVIDERS FIXED

All three providers (Gemini, Qwen Code, Codex) have been reviewed and fixed.

---

## Changes Made

### Gemini Provider (CRITICAL FIXES)

**File**: `packages/core/src/providers/gemini.ts`

#### ✅ Fixed Issue #1: Broken runStream Implementation

**Problem**: The original implementation tried to yield from within callbacks, which doesn't work in async generators.

**Before**:

```typescript
proc.stdout.on("data", (data: Buffer) => {
  const text = data.toString();
  yield { type: "delta", text };  // ❌ Can't yield in callback
});

yield* new Promise<AsyncGenerator<CodingEvent>>((resolve, reject) => {
  // ... more broken yields
});
```

**After**:

```typescript
for await (const chunk of proc.stdout) {
  const text = chunk.toString();
  yield { type: "delta", text };  // ✅ Correct: yield in async generator
}
```

#### ✅ Fixed Issue #2: Missing Import

**Added**: `ProviderInvokeOptions` import from "../types"

**Before**:

```typescript
import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind, // ❌ Missing ProviderInvokeOptions
} from "../types";
```

**After**:

```typescript
import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInvokeOptions, // ✅ Added
} from "../types";
```

#### ✅ Fixed Issue #3: Removed Unused Imports

- Removed `readFile` from "node:fs/promises" (unused)
- Removed `join` from "node:path" (unused)

#### ✅ Fixed Issue #4: Removed Unused Method

- Removed `emptyAsyncGenerator()` private method (no longer needed)

---

## Provider Comparison

### Implementation Pattern

All three providers now use the **correct** async generator pattern:

```typescript
async *runStream(req, opts): AsyncGenerator<CodingEvent> {
  yield { type: "start", provider: this.id, requestId };

  const proc = spawn(this.binaryPath, args);

  // ✅ CORRECT: Use for await...of
  for await (const chunk of proc.stdout) {
    yield { type: "delta", text: chunk.toString() };
  }

  // Handle completion/error
  // ...
}
```

### Side-by-Side Comparison

| Provider      | Binary           | JSON Mode              | Streaming Mode | Status   |
| ------------- | ---------------- | ---------------------- | -------------- | -------- |
| **Gemini**    | `gemini`         | `--output-format json` | `jsonl`        | ✅ Fixed |
| **Qwen Code** | `qwen`           | `--json`               | `jsonl`        | ✅ Good  |
| **Codex**     | `cdx` or `codex` | N/A (text)             | `line`         | ✅ Good  |

---

## How Each Provider Works

### Gemini Provider

```bash
# JSON Mode (when config.jsonMode = "flag")
gemini --output-format json

# Prompt passed via stdin
{ "prompt": "Write a function" } | gemini --output-format json

# Streaming: JSONL from stdout (if supported by gemini CLI)
```

**Features**:

- JSON output mode
- JSONL streaming
- Stdin prompt input
- Auto-detects JSON vs text output

### Qwen Code Provider

```bash
# JSON Mode (when config.jsonMode = "flag")
qwen --json

# Prompt passed via stdin
echo "Write a function" | qwen --json

# Streaming: JSONL from stdout
```

**Features**:

- JSON output mode
- JSONL streaming
- Stdin prompt input
- Qwen-specific error patterns

### Codex Provider

```bash
# Two invocation styles supported:

# Style 1: cdx wrapper
cdx "Write a function" --test

# Style 2: codex with -p flag
codex -p "Write a function" --test

# Streaming: plain text line by line
```

**Features**:

- Text output mode
- Line-based streaming
- Mode-specific flags (--explain, --test, --edit)
- File context with --file flag
- Two binary invocation styles

---

## Error Classification

Each provider correctly classifies errors:

### Common Error Types

- `OUT_OF_CREDITS` - Quota/limit exceeded
- `RATE_LIMIT` - Too many requests (429)
- `BAD_REQUEST` - Invalid request (400, 401)
- `INTERNAL` - Server error (500)
- `TRANSIENT` - Network/timeout errors

### Provider-Specific Patterns

**Gemini**:

- Looks for "quota exceeded", "rate limit", HTTP codes

**Qwen Code**:

- Qwen-specific messages + standard HTTP codes
- Network/timeout detection

**Codex**:

- Plan limit messages
- Subscription required
- Permissions errors

---

## Testing Commands

To test each provider manually:

### Qwen Code

```bash
# Check if installed
which qwen
qwen --version

# Test basic usage
echo "Write hello world in Python" | qwen --json
```

### Codex

```bash
# Check if installed
which cdx || which codex

# Test basic usage
cdx "Write hello world in Python" --explain

# or
codex -p "Write hello world in Python" --explain
```

### Gemini

```bash
# Check if installed
which gemini

# Test basic usage (after building the project)
echo "Write hello world in Python" | gemini --output-format json
```

---

## Integration Test Plan

```bash
# Build the project
cd /Users/briansunter/.dotfiles/bun-scripts/wrap-terminalcoder
bun install
bun run build

# Test CLI
./packages/cli/dist/index.js ask -p "test" --dry-run

# Test providers command
./packages/cli/dist/index.js providers

# Test with actual provider (if you have Qwen installed)
./packages/cli/dist/index.js ask -p "Write hello world" --provider qwen-code

# Test MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  bun run packages/mcp-server/src/server.ts
```

---

## Configuration Files to Create

### User Config (~/.config/wrap-terminalcoder/config.json)

```json
{
  "routing": {
    "defaultOrder": ["qwen-code", "gemini", "codex"]
  },
  "providers": {
    "qwen-code": {
      "binary": "qwen",
      "jsonMode": "flag",
      "jsonFlag": "--json",
      "streamingMode": "jsonl"
    },
    "gemini": {
      "binary": "gemini",
      "jsonMode": "flag",
      "jsonFlag": "--output-format",
      "streamingMode": "jsonl"
    },
    "codex": {
      "binary": "cdx",
      "jsonMode": "none",
      "streamingMode": "line"
    }
  }
}
```

---

## Summary

✅ **All providers are now correctly implemented and ready for testing**

1. **Gemini** - Fixed critical streaming bug, added missing imports, cleaned up
2. **Qwen Code** - Already correct, uses proper async generator pattern
3. **Codex** - Already correct, supports two invocation styles

All providers:

- Use correct async generator pattern (`for await...of`)
- Have proper error classification
- Support streaming and non-streaming modes
- Handle stdin/stdout correctly
- Are type-safe with TypeScript

**Next Step**: Build the project and test with actual provider CLIs.
