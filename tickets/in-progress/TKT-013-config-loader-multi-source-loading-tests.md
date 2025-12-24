---
id: TKT-013
title: Config loader multi-source loading tests
status: in-progress
priority: P1
assigned_to: @worker
created: 2025-11-24
updated: 2025-11-24
related_files:
  - packages/core/src/config.ts
  - packages/core/src/config.test.ts
  - packages/core/src/types.ts
requirements:
  - Test loading configuration from multiple sources
  - Test source precedence and merging behavior
  - Test default config files loading
  - Test environment variable loading
  - Test CLI argument loading
acceptance_criteria:
  - [ ] Tests for loading from default config files
  - [ ] Tests for loading from environment variables
  - [ ] Tests for loading from CLI arguments
  - [ ] Tests for source precedence and merging
technical_notes:
  - The ConfigLoader class loads configs from multiple sources in order:
    1. Built-in defaults
    2. System config (/etc/wrap-terminalcoder/config.json)
    3. User config (~/.config/wrap-terminalcoder/config.json)
    4. Project config (.config/wrap-terminalcoder/config.json)
    5. Environment variables (WTC_* prefixed)
  - Environment variables use double underscore notation for nested properties
    - e.g., WTC_ROUTING__DEFAULT_ORDER='["qwen-code","gemini"]'
  - CLI arguments are converted to environment variables in the addCLIConfigOverrides function
  - Later configs override earlier ones in the merge process
  - Use deepMerge method for combining configs
---

# TKT-013: Config loader multi-source loading tests

Implement tests for loading configuration from multiple sources including:

1. Testing loading from default config files
2. Testing loading from environment variables
3. Testing loading from CLI arguments
4. Testing source precedence and merging

## Requirements

- Test loading configuration from multiple sources
- Test source precedence and merging behavior
- Test default config files loading
- Test environment variable loading
- Test CLI argument loading

## Acceptance Criteria

- [ ] Tests for loading from default config files
- [ ] Tests for loading from environment variables
- [ ] Tests for loading from CLI arguments
- [ ] Tests for source precedence and merging

## Technical Notes

The ConfigLoader class loads configs from multiple sources in order:

1. Built-in defaults
2. System config (/etc/wrap-terminalcoder/config.json)
3. User config (~/.config/wrap-terminalcoder/config.json)
4. Project config (.config/wrap-terminalcoder/config.json)
5. Environment variables (WTC\_\* prefixed)

Environment variables use double underscore notation for nested properties:

- e.g., WTC_ROUTING\_\_DEFAULT_ORDER='["qwen-code","gemini"]'

CLI arguments are converted to environment variables in the addCLIConfigOverrides function.

Later configs override earlier ones in the merge process.

Use deepMerge method for combining configs.
