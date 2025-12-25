# Test Coverage Plan

## Objective

Achieve maximum test coverage for wrap-terminalcoder using bun test and bun coverage

## Test Files to Create

### Unit Tests (packages/core/src)

1. **types.test.ts** - Schema validation tests
2. **providers/index.test.ts** - ProcessProvider tests
3. **providers/gemini.test.ts** - Gemini provider tests
4. **providers/qwen-code.test.ts** - Qwen provider tests
5. **providers/codex.test.ts** - Codex provider tests
6. **providers/custom.test.ts** - Custom provider tests
7. **router.test.ts** - Routing and fallback logic tests
8. **state.test.ts** - State persistence tests
9. **config.test.ts** - Config loading and validation tests

### Integration Tests

10. **integration/providers.test.ts** - End-to-end provider tests
11. **integration/router.test.ts** - Routing with multiple providers

### CLI Tests (packages/cli/src)

12. **cli.test.ts** - Command-line interface tests

### Coverage Goals

- Minimum: 80% line coverage
- Target: 90% line coverage
- Stretch: 95% line coverage

## Test Implementation Strategy

### Phase 1: Core Components (Parallel)

- ProcessProvider base functionality
- Error classification
- Argument building

### Phase 2: Individual Providers (Parallel)

- Each provider's runOnce and runStream
- Provider-specific error patterns
- Provider argument building

### Phase 3: Router & State (Parallel)

- Routing logic
- Fallback mechanisms
- State persistence
- Credit tracking

### Phase 4: Integration (Parallel)

- End-to-end workflows
- Multiple providers
- Real CLI scenarios

### Phase 5: CLI (Sequential)

- Command parsing
- Output formatting
- Dry run mode

## Parallel Subagent Tasks

Subagent 1: Core types and ProcessProvider
Subagent 2: Gemini provider tests
Subagent 3: Qwen, Codex, Custom provider tests
Subagent 4: Router tests
Subagent 5: State and Config tests
Subagent 6: Integration tests
Subagent 7: CLI tests
Subagent 8: Coverage analysis and gap filling
