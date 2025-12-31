---
name: Coding Agent Router
description: Route coding tasks to multiple AI providers (Gemini, OpenCode, Qwen, Codex) with intelligent selection, credit tracking, and automatic fallback. Use when delegating coding tasks to external AI agents.
keywords: [coding, agents, gemini, qwen, codex, opencode, routing, delegation]
topics: [ai, coding, agents, automation]
---

# Coding Agent Router with WrapTC

WrapTC provides unified access to multiple coding AI agents with intelligent routing, credit tracking, and automatic fallback.

## Supported Providers

- **Gemini CLI**: Google's Gemini model via CLI
- **OpenCode**: OpenCode coding assistant
- **Qwen Code**: Alibaba's Qwen coding model
- **Codex CLI**: OpenAI Codex via CLI

## MCP Tools

### run_coding_task
Execute a coding task using the best available provider.

Parameters:
- `prompt`: The coding task description (required)
- `mode`: Task type - "generate", "edit", "explain", or "test" (default: "generate")
- `language`: Language hint (optional)
- `files`: Array of file paths for context (optional)
- `provider`: Specific provider to use (optional, auto-selects if not specified)

### get_providers
List all available providers and their current status including credit usage.

### dry_run
Preview which provider would be selected for a task without executing it.

## CLI Usage

```bash
# Simple coding request
wraptc ask "Write a TypeScript function that reverses a string"

# Specify provider
wraptc ask "Explain this code" --use gemini

# Include file context
wraptc ask "Refactor this module" -f src/utils.ts -f src/main.ts

# Stream response
wraptc ask "Create unit tests" --stream

# Check provider status
wraptc providers

# Start MCP server
wraptc mcp
```

## Task Modes

- **generate**: Create new code from scratch
- **edit**: Modify existing code
- **explain**: Explain what code does
- **test**: Generate tests for code

## Intelligent Routing

WrapTC automatically:
1. Selects the best available provider based on priority
2. Tracks credit usage per provider
3. Falls back to alternative providers when limits are reached
4. Blacklists providers after consecutive failures

## Best Practices

1. **Use specific modes**: Choose the right mode for your task
2. **Provide context**: Include relevant files with `-f` flag
3. **Check providers**: Run `wraptc providers` to see availability
4. **Delegate appropriately**: Use for tasks that benefit from specialized coding models
