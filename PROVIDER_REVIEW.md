# Provider Implementation Review

## Summary

I've reviewed the three provider implementations (Gemini, Qwen Code, Codex). Here's the detailed assessment:

## 🟢 Qwen Code Provider - GOOD

**Location**: `packages/core/src/providers/qwen-code.ts`

**Status**: ✅ Implementation is correct

**Strengths**:

- Correct use of `for await...of` for streaming stdout
- Proper error handling with exit code checking
- Good error classification patterns for Qwen-specific errors
- Proper stdin handling for prompts

**Implementation Notes**:

- Uses `for await (const chunk of proc.stdout)` - correct approach
- Captures stderr separately for error reporting
- Properly handles JSONL mode vs plain text

**Example Usage**:

```bash
# Should work correctly
qwen --json << 'EOF'
Write a TypeScript function
EOF
```

---

## 🟢 Codex Provider - GOOD

**Location**: `packages/core/src/providers/codex.ts`

**Status**: ✅ Implementation is correct

**Strengths**:

- Correct use of `for await...of` for streaming stdout
- Proper support for both `cdx` and `codex -p` invocation styles
- Good error classification patterns for Codex-specific errors
- Handles mode-specific flags (--explain, --test, --edit)
- Proper file context support with --file flag

**Implementation Notes**:

- Uses `for await (const chunk of proc.stdout)` - correct approach
- Builds args correctly for both binary names
- Proper error handling patterns

**Example Usage**:

```bash
# cdx style
cdx "Write a function" --test

# codex style
codex -p "Write a function" --test

# with files
codex -p "Refactor this" --file src/utils.ts --edit
```

**Potential Issue**: Need to verify if codex CLI actually supports --explain, --test, --edit flags. If not, these should be removed or made configurable.

---

## 🔴 Gemini Provider - CRITICAL ISSUES

**Location**: `packages/core/src/providers/gemini.ts`

**Status**: ❌ Has bugs in runStream method

### Critical Issues

#### 1. **runStream Method is Broken** (Lines 92-125)

**Problem**: The streaming implementation tries to yield from within callbacks, which doesn't work with async generators.

```typescript
// PROBLEMATIC CODE (lines 92-125):
proc.stdout.on("data", (data: Buffer) => {
  const text = data.toString();
  // If in JSON mode, parse and emit chunks
  if (this.config.jsonMode !== "none" && this.config.streamingMode === "jsonl") {
    for (const line of text.split("\n").filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        yield { type: "chunk", text: JSON.stringify(parsed) }; // ❌ BROKEN: Can't yield here
      } catch {
        yield { type: "delta", text: line }; // ❌ BROKEN: Can't yield here
      }
    }
  } else {
    yield { type: "delta", text }; // ❌ BROKEN: Can't yield here
  }
});

yield* new Promise<AsyncGenerator<CodingEvent>>((resolve, reject) => {
  let fullText = "";
  // ... more broken yield attempts
});
```

**Why it's broken**: You cannot use `yield` inside regular callbacks in async generators. The `yield` keyword only works directly in the async generator function body.

**Correct approach**: Use `for await (const chunk of proc.stdout)` like the other providers do.

### Suggested Fix

Replace the runStream method with:

```typescript
async *runStream(
  req: CodingRequest,
  opts: ProviderInvokeOptions
): AsyncGenerator<CodingEvent> {
  const requestId = crypto.randomUUID();
  yield { type: "start", provider: this.id, requestId };

  const proc = spawn(this.binaryPath, this.buildArgs(req, opts), {
    cwd: opts.cwd,
    env: { ...process.env },
  });

  if (req.prompt) {
    proc.stdin.write(req.prompt);
    proc.stdin.end();
  }

  let fullText = "";

  // Handle streaming output correctly
  for await (const chunk of proc.stdout) {
    const text = chunk.toString();
    fullText += text;

    if (this.config.jsonMode !== "none" && this.config.streamingMode === "jsonl") {
      // Try to parse as JSONL
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          yield { type: "chunk", text: JSON.stringify(parsed) };
        } catch {
          yield { type: "delta", text: line };
        }
      }
    } else {
      yield { type: "delta", text };
    }
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on("close", resolve);
  });

  if (exitCode === 0) {
    const result = this.config.jsonMode !== "none" ? this.parseJsonOutput(fullText) : { text: fullText };
    yield { type: "complete", provider: this.id, text: result.text, usage: result.usage };
  } else {
    let stderr = "";
    for await (const chunk of proc.stderr) {
      stderr += chunk.toString();
    }
    yield {
      type: "error",
      provider: this.id,
      code: this.classifyError({ stderr, exitCode: exitCode || undefined }),
      message: stderr || `Process exited with code ${exitCode}`,
    };
  }
}
```

#### 2. **Missing ProviderInvokeOptions Import**

**Problem**: The file imports `CodingEvent`, `CodingRequest`, etc., but doesn't import `ProviderInvokeOptions` even though it's used in the method signatures.

**Current imports**:

```typescript
import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
} from "../types";
```

**Should be**:

```typescript
import type {
  CodingEvent,
  CodingRequest,
  ProviderConfig,
  ProviderErrorContext,
  ProviderErrorKind,
  ProviderInvokeOptions, // ❌ MISSING
} from "../types";
```

#### 3. **bloatJSON Parse Error (Minor)**

**Location**: Line 1

```typescript
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
```

The `readFile` and `join` imports are unused and can be removed.

---

## General Issues Across All Providers

### 1. **crypto.randomUUID() Availability**

All providers use `crypto.randomUUID()` in runStream. This is available in:

- ✅ Bun (global.crypto.randomUUID())
- ✅ Node.js 19+ (global.crypto.randomUUID())
- ⚠️ Node.js 14-18 (requires crypto module import)

**Status**: Should work fine with Bun as configured.

### 2. **Error Handling Edge Cases**

All providers should consider:

- What if the binary doesn't exist? (should throw "command not found" error)
- What if the binary is not executable? (permission errors)
- What if the process hangs? (timeout handling)

**Recommendation**: Add timeout support to all providers.

### 3. **Unused Imports**

- **Gemini**: `readFile` and `join` are imported but unused
- **Qwen Code**: Clean ✅
- **Codex**: Clean ✅

---

## Testing Checklist

Before using in production, test each provider:

### Qwen Code

```bash
# Test basic invocation
bun -e "import { QwenCodeProvider } from './packages/core/src/providers/qwen-code.ts'; console.log('OK')"

# Test with actual qwen CLI (if installed)
qwen --version
```

### Codex

```bash
# Test with actual codex CLI (if installed)
cdx --version
# or
codex --version
```

### Gemini

```bash
# Will need the fix applied first
# Test with actual gemini CLI (if installed)
gemini --version
```

---

## Recommended Action Items

### Immediate (Before Use)

1. **Fix Gemini provider's runStream method** - CRITICAL
2. **Add missing ProviderInvokeOptions import to Gemini**
3. **Remove unused imports from Gemini**

### Soon (Before Production)

4. Add timeout handling to all providers
5. Add more robust error handling for missing binaries
6. Add integration tests for each provider
7. Verify Codex CLI flag support (--explain, --test, --edit)

### Nice to Have

8. Add provider health check command
9. Add provider auto-detection (check if binary exists)
10. Add more detailed logging in provider adapters

---

## Provider Binary Verification

### Where to get the CLIs

**Qwen Code**:

```bash
npm install -g @qwen-coder/cli
# or
bun install -g @qwen-coder/cli
```

**Codex**:

```bash
npm install -g @openai/codex
# Binary: cdx or codex
```

**Gemini CLI**:

```bash
# Part of Gemini Code Assist
# Installation varies
```

### Configuration Verification

Each provider should be tested with its actual CLI to verify:

- Correct binary name/path
- Correct JSON output flags
- Correct streaming mode
- Correct prompt passing (stdin vs flag)

---

## Overall Assessment

| Provider  | Status    | Issues        | Priority     |
| --------- | --------- | ------------- | ------------ |
| Qwen Code | ✅ Good   | None          | Low          |
| Codex     | ✅ Good   | Verify flags  | Medium       |
| Gemini    | ❌ Broken | Fix streaming | **CRITICAL** |

The Qwen Code and Codex providers are ready to test. The Gemini provider needs the streaming fix before it can be used.
