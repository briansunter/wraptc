# wrap-terminalcoder

A unified CLI wrapper for multiple coding AI agents (Gemini CLI, OpenCode, Qwen Code, Codex CLI) with intelligent routing, credit tracking, and automatic fallback.

## Features

- **Multi-Provider Support**: Works with Gemini CLI, OpenCode, Qwen Code CLI, Codex CLI, and custom providers
- **Intelligent Routing**: Automatic provider selection based on priority, availability, and credit limits
- **Credit Tracking**: Per-provider usage tracking and automatic fallback when limits are reached
- **Error Threshold Blacklisting**: Automatic provider blacklisting after consecutive failures (configurable per provider)
- **Tokens Saved Tracking**: Estimates Claude tokens saved by delegating tasks to free-tier providers
- **Streaming Support**: Real-time streaming of responses in JSON or text format
- **Unified API**: Single, consistent JSON-first interface across all providers
- **MCP Server**: Exposes functionality as an MCP server for Claude Desktop and other MCP clients

## Installation

```bash
# Clone and build
git clone <repository>
cd wrap-terminalcoder
bun install
bun run build

# Install globally (optional)
cd packages/cli
bun link
```

## Quick Start

### Basic Usage

```bash
# Simple request using best available provider
wtc ask -p "Write a TypeScript function that reverses a string"

# Specify a provider
wtc ask -p "Explain this code" --provider gemini

# Include file context
wtc ask -p "Refactor this module" -f src/utils.ts -f src/main.ts

# Stream response
wtc ask -p "Create unit tests" --stream --output jsonl
```

### Output Formats

**JSON (default)**:

```json
{
  "provider": "qwen-code",
  "text": "function reverseString(str: string): string {\n  return str.split('').reverse().join('');\n}",
  "usage": {
    "inputTokens": 45,
    "outputTokens": 23
  },
  "meta": {
    "elapsedMs": 1250
  }
}
```

**Text**:

```bash
wtc ask -p "Write a function" --output text
```

## Configuration

wrap-terminalcoder uses a layered configuration system:

1. Built-in defaults
2. System config: `/etc/wrap-terminalcoder/config.json`
3. User config: `~/.config/wrap-terminalcoder/config.json`
4. Project config: `./.config/wrap-terminalcoder/config.json`
5. Environment variables: `WTC_*`
6. CLI flags

### Example Configuration

Create `~/.config/wrap-terminalcoder/config.json`:

```json
{
  "routing": {
    "defaultOrder": ["gemini", "opencode", "qwen-code", "codex"],
    "perModeOverride": {
      "test": ["codex", "gemini"],
      "explain": ["gemini", "qwen-code"]
    }
  },
  "providers": {
    "gemini": {
      "binary": "gemini",
      "args": [],
      "jsonMode": "flag",
      "jsonFlag": "--output-format",
      "streamingMode": "jsonl",
      "capabilities": ["generate", "edit", "explain", "test"]
    },
    "opencode": {
      "binary": "opencode",
      "args": [],
      "jsonMode": "flag",
      "jsonFlag": "-f",
      "streamingMode": "none",
      "capabilities": ["generate", "edit", "explain", "test", "refactor"]
    },
    "qwen-code": {
      "binary": "qwen",
      "args": [],
      "jsonMode": "flag",
      "jsonFlag": "--json",
      "streamingMode": "jsonl",
      "capabilities": ["generate", "edit", "explain", "test"]
    },
    "codex": {
      "binary": "cdx",
      "args": [],
      "jsonMode": "none",
      "streamingMode": "line",
      "capabilities": ["generate", "edit", "test"]
    }
  },
  "credits": {
    "providers": {
      "gemini": {
        "dailyRequestLimit": 1000,
        "resetHourUtc": 0
      },
      "opencode": {
        "dailyRequestLimit": 1000,
        "resetHourUtc": 0
      },
      "qwen-code": {
        "dailyRequestLimit": 2000,
        "resetHourUtc": 0
      },
      "codex": {
        "plan": "chatgpt_plus"
      }
    }
  }
}
```

### Adding Custom Providers

You can add new providers via configuration:

```json
{
  "providers": {
    "my-custom-llm": {
      "binary": "my-llm-cli",
      "argsTemplate": ["--model", "gpt-4", "--prompt", "{{prompt}}"],
      "streamingMode": "line",
      "capabilities": ["generate", "explain"]
    }
  },
  "routing": {
    "defaultOrder": ["my-custom-llm", "qwen-code", "gemini"]
  }
}
```

### Environment Variables

Override config with environment variables:

```bash
WTC_ROUTING__DEFAULT_ORDER='["gemini","codex"]' wtc ask -p "Hello"
WTC_REQUEST__PROVIDER="gemini" wtc ask -p "Hello"
```

## CLI Commands

### `wtc ask`

Send a coding request to the best available provider.

```bash
wtc ask -p "Your prompt" [options]

Options:
  -p, --prompt <prompt>       The prompt to send
  --provider <provider>       Override provider selection
  --mode <mode>               Request mode: generate, edit, explain, test
  --language <language>       Language hint
  -f, --file <files...>       Include file context
  --temperature <temp>        Temperature (0-2)
  --stream                    Enable streaming
  --output <format>           Output format: json, jsonl, text
  --dry-run                   Show which provider would be used
  --config <path>             Config file path
```

### `wtc providers`

List all available providers and their status.

```bash
wtc providers
```

### `wtc reset`

Reset provider state (counters, error tracking).

```bash
wtc reset --provider qwen-code  # Reset specific provider
wtc reset --all                  # Reset all providers
```

### `ultrathink`

Alias for enhanced reasoning mode.

```bash
ultrathink -p "Explain this complex algorithm in detail"
```

## MCP Server

The MCP server exposes wrap-terminalcoder functionality to MCP clients.

### Running the MCP Server

```bash
# Directly
bun run packages/mcp-server/src/server.ts

# With config
WTC_CONFIG=/path/to/config.json bun run packages/mcp-server/src/server.ts
```

### MCP Tools

#### `run_coding_task`

Execute a coding task using the best available provider.

**Parameters:**

- `prompt` (string, required): The coding task prompt
- `mode` (string, optional): generate, edit, explain, or test
- `language` (string, optional): Language hint
- `files` (array of strings, optional): File paths for context
- `provider` (string, optional): Specific provider to use

**Response:**

```json
{
  "provider": "qwen-code",
  "text": "Generated code...",
  "usage": { "inputTokens": 100, "outputTokens": 50 }
}
```

#### `get_providers`

List all available providers and their current status.

**Response:**

```json
[
  {
    "id": "qwen-code",
    "displayName": "Qwen Code CLI",
    "requestsToday": 42,
    "outOfCreditsUntil": null
  }
]
```

#### `dry_run`

Show which provider would be used for a request without executing it.

**Parameters:**

- `prompt` (string, required)
- `mode` (string, optional)
- `provider` (string, optional)

## Architecture

### Core Components

1. **Provider Abstraction** (`packages/core/src/providers/`)
   - `Provider` interface for unified provider API
   - Adapters for Gemini, Qwen Code, Codex, and custom providers
   - Streaming and non-streaming support

2. **Router** (`packages/core/src/router.ts`)
   - Provider selection based on priority and availability
   - Automatic fallback on errors or credit exhaustion
   - Per-mode routing overrides

3. **State Manager** (`packages/core/src/state.ts`)
   - Per-provider usage tracking
   - Credit limit enforcement
   - Error history and cooldown management

4. **Config Loader** (`packages/core/src/config.ts`)
   - Multi-source configuration merging
   - Environment variable support
   - Validation with Zod

5. **CLI** (`packages/cli/src/index.ts`)
   - Commander-based CLI with multiple commands
   - Support for streaming and multiple output formats

6. **MCP Server** (`packages/mcp-server/src/server.ts`)
   - MCP protocol implementation
   - Tool-based interface for MCP clients

## Error Handling

The wrapper classifies errors into categories:

- `OUT_OF_CREDITS`: Provider has exhausted quota
- `RATE_LIMIT`: Provider is rate limited
- `TRANSIENT`: Temporary error, retryable
- `BAD_REQUEST`: Invalid request, don't retry
- `INTERNAL`: Provider internal error

When a provider fails, the router automatically tries the next available provider in the priority list.

## State File

State is persisted to `~/.config/wrap-terminalcoder/state.json`:

```json
{
  "version": "1.0.0",
  "providers": {
    "qwen-code": {
      "lastUsedAt": "2025-01-20T10:30:00Z",
      "requestsToday": 42,
      "lastReset": "2025-01-20T00:00:00Z",
      "outOfCreditsUntil": null,
      "lastErrors": []
    }
  }
}
```

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Development mode with watch
bun run dev

# Run tests
bun test

# Lint
bun run lint

# Type check
bun run typecheck
```

## Examples

### Generate Code

```bash
wtc ask -p "Write a Python function to parse CSV data" --language python
```

### Explain Code

```bash
wtc ask -p "Explain this function" -f src/complex.ts --mode explain
```

### Edit with Context

```bash
wtc ask -p "Refactor to use async/await" -f src/api.ts --mode edit
```

### Test Generation

```bash
wtc ask -p "Create unit tests" -f src/utils.ts --mode test
```

### Stream Response

```bash
wtc ask -p "Write a long document" --stream --output jsonl
```

### Check Provider Status

```bash
wtc providers
```

## Troubleshooting

### Provider Not Found

Ensure the CLI tool is installed and in your PATH:

```bash
which gemini  # Should show path
gemini --help  # Should work
```

### Credit Limit Issues

Check provider status:

```bash
wtc providers
```

Reset if needed:

```bash
wtc reset --provider qwen-code
```

### Configuration Issues

Validate your config:

```bash
# The tool validates on startup and will show errors
wtc ask -p "test" --dry-run
```

### Debug Mode

Enable debug logging:

```bash
DEBUG=1 wtc ask -p "Hello"
```

## License

MIT
