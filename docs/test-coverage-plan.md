# Test Coverage Plan for wrap-terminalcoder

## Current Coverage Status

Based on analysis of the codebase and test results:

- **router.ts**: 0% coverage
- **state.ts**: 0% coverage
- **config.ts**: 0% coverage
- **providers**: 0-4% coverage
- **Overall goal**: Achieve 80% test coverage

## Root Cause Analysis

The current test failures are primarily due to:

1. Incorrect mocking of private methods and properties
2. Tests trying to access internal implementation details
3. Missing integration between components
4. Incomplete test coverage for edge cases and error handling

## Detailed Implementation Plan

### Phase 1: Advanced Mocking Implementation for Core Components

#### 1.1 Router Component Testing Strategy

**Objective**: Achieve 90%+ coverage for router.ts

**Key Areas to Test**:

- Provider selection logic (default order, mode overrides, explicit provider)
- Error handling and fallback mechanisms
- Credit limit enforcement
- Daily request counting
- Error classification and state updates
- Streaming vs non-streaming routing
- Timing metadata inclusion

**Specific Tickets**:

- TKT-001: Router provider selection logic tests
- TKT-002: Router error handling and fallback tests
- TKT-003: Router credit limit and daily counter tests
- TKT-004: Router streaming functionality tests

#### 1.2 State Manager Testing Strategy

**Objective**: Achieve 90%+ coverage for state.ts

**Key Areas to Test**:

- State initialization and file loading
- Daily counter reset logic
- Provider state management (success/error recording)
- Out of credits marking and checking
- Provider reset functionality
- State persistence and atomic saves
- Error handling for file operations

**Specific Tickets**:

- TKT-005: State manager initialization and persistence tests
- TKT-006: State manager daily counter reset tests
- TKT-007: State manager provider state recording tests
- TKT-008: State manager out of credits functionality tests

#### 1.3 Config Loader Testing Strategy

**Objective**: Achieve 90%+ coverage for config.ts

**Key Areas to Test**:

- Configuration loading from multiple sources
- Environment variable parsing and merging
- Configuration validation with Zod schemas
- Deep merging functionality
- Nested property setting
- Camel case conversion
- CLI override integration

**Specific Tickets**:

- TKT-009: Config loader multi-source loading tests
- TKT-010: Config loader environment variable parsing tests
- TKT-011: Config loader validation and merging tests
- TKT-012: Config loader CLI override tests

### Phase 2: Provider Integration Testing with Process Mocking

#### 2.1 Process Provider Base Class Testing

**Objective**: Test the foundation for all CLI-based providers

**Key Areas to Test**:

- Process spawning and argument building
- Error classification logic
- Streaming vs non-streaming execution
- Timeout handling
- Process cleanup and resource management

**Specific Tickets**:

- TKT-013: Process provider base class functionality tests
- TKT-014: Process provider error classification tests
- TKT-015: Process provider streaming functionality tests

#### 2.2 Individual Provider Testing

**Objective**: Test each provider's specific implementation

**Qwen Code Provider**:

- Argument building with --yolo flag
- Non-JSON output parsing
- Line-based streaming

**Gemini Provider**:

- JSON flag argument building
- JSONL streaming parsing
- Output format handling

**Codex Provider**:

- Positional argument handling
- Line-based streaming
- Error pattern recognition

**Custom Provider**:

- Template-based argument building
- Flexible configuration support

**Specific Tickets**:

- TKT-016: Qwen Code provider integration tests
- TKT-017: Gemini provider integration tests
- TKT-018: Codex provider integration tests
- TKT-019: Custom provider integration tests

### Phase 3: Performance and Load Testing

#### 3.1 Stress Testing

**Objective**: Ensure system stability under load

**Key Areas to Test**:

- Concurrent request handling
- Memory usage monitoring
- Resource leak detection
- Timeout behavior
- Error recovery under stress

**Specific Tickets**:

- TKT-020: Concurrent request handling tests
- TKT-021: Memory usage and leak detection tests
- TKT-022: Timeout and error recovery tests

### Phase 4: End-to-End Pipeline Testing

#### 4.1 Integration Testing

**Objective**: Test complete workflow from CLI to provider execution

**Key Areas to Test**:

- Full request lifecycle
- Configuration to execution flow
- State persistence across requests
- Error propagation and handling
- Provider fallback scenarios

**Specific Tickets**:

- TKT-023: End-to-end request lifecycle tests
- TKT-024: Configuration to execution integration tests
- TKT-025: State persistence integration tests
- TKT-026: Provider fallback integration tests

#### 4.2 CLI Interface Testing

**Objective**: Test command-line interface functionality

**Key Areas to Test**:

- Command parsing and validation
- Option handling
- Output formatting
- Help and documentation
- Dry-run functionality

**Specific Tickets**:

- TKT-027: CLI command parsing tests
- TKT-028: CLI option handling tests
- TKT-029: CLI output formatting tests

### Phase 5: Coverage Measurement and Iteration

#### 5.1 Coverage Analysis

**Objective**: Measure and improve test coverage iteratively

**Key Areas**:

- Line coverage reporting
- Branch coverage analysis
- Function coverage tracking
- Gap identification and prioritization

**Specific Tickets**:

- TKT-030: Comprehensive coverage analysis
- TKT-031: Coverage gap identification and prioritization
- TKT-032: Iterative coverage improvement

## Implementation Timeline

### Week 1: Core Component Mocking

- Complete TKT-001 through TKT-004 (Router tests)
- Complete TKT-005 through TKT-008 (State manager tests)
- Complete TKT-009 through TKT-012 (Config loader tests)

### Week 2: Provider Integration

- Complete TKT-013 through TKT-015 (Process provider base)
- Complete TKT-016 through TKT-019 (Individual providers)

### Week 3: Performance and Integration

- Complete TKT-020 through TKT-022 (Performance testing)
- Complete TKT-023 through TKT-026 (Integration testing)

### Week 4: End-to-End and Coverage

- Complete TKT-027 through TKT-029 (CLI interface)
- Complete TKT-030 through TKT-032 (Coverage analysis)

## Success Metrics

1. **Coverage Targets**:
   - router.ts: 90%+
   - state.ts: 90%+
   - config.ts: 90%+
   - providers: 85%+
   - Overall project: 80%+

2. **Quality Metrics**:
   - Zero test failures in CI
   - Consistent test execution times
   - No memory leaks detected
   - Proper error handling coverage

3. **Maintainability**:
   - Clear test organization
   - Comprehensive test documentation
   - Easy to add new test cases
   - Fast test execution

## Risk Mitigation

1. **Test Flakiness**:
   - Use proper mocking instead of real file system operations
   - Implement deterministic timing for time-dependent tests
   - Isolate tests with proper setup/teardown

2. **Complexity Management**:
   - Focus on unit tests before integration tests
   - Use clear test naming conventions
   - Maintain separation of concerns in test structure

3. **Resource Constraints**:
   - Prioritize critical paths first
   - Use incremental coverage improvement
   - Leverage existing test infrastructure where possible

## Next Steps

1. Create detailed tickets in `tickets/open/` directory
2. Assign tickets to @worker for implementation
3. Track progress in `plan.md`
4. Run coverage analysis after each phase
5. Iterate based on coverage gaps identified
