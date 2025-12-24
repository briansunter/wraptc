# Wrap-TerminalCoder Core Integration Tests

This package contains comprehensive integration tests for the wrap-terminalcoder system, testing the complete end-to-end functionality including provider routing, state management, configuration loading, and error handling.

## Test Coverage

### Test 1: End-to-end Request Routing

- Routes requests to primary provider when available
- Falls back to secondary provider when primary fails
- Handles rate limiting with automatic fallback
- Verifies correct provider selection based on weights

### Test 2: Provider State Tracking

- Tracks provider usage across multiple requests
- Persists state to disk and reloads on restart
- Monitors consecutive failures for circuit breaking
- Maintains request counters and timestamps

### Test 3: Credit Exhaustion and Recovery

- Marks providers as out of credits when daily limit reached
- Automatically falls back to next available provider
- Resets daily counters after configured reset time
- Prevents usage of exhausted providers

### Test 4: Configuration Loading

- Loads configuration from JSON files
- Merges environment variables with file configuration
- Validates configuration structure and required fields
- Supports per-mode provider overrides

### Test 5: Streaming with Multiple Providers

- Handles streaming failures mid-stream
- Provides seamless fallback to alternative providers
- Maintains stream continuity during provider switches
- Graceful degradation when streaming fails

### Test 6: Error Propagation

- Propagates BAD_REQUEST errors without fallback
- Preserves original error messages and codes
- Distinguishes between retryable and non-retryable errors
- Maintains error context across provider boundaries

### Test 7: Modes and Capabilities

- Uses perModeOverride routing for different modes
- Skips providers without required capabilities
- Supports mode-specific provider configurations
- Enables capability-based provider filtering

## Running Tests

```bash
# Run all tests
bun test

# Run only integration tests
bun test:integration

# Run with coverage
bun test --coverage

# Run in watch mode
bun test:watch
```

## Test Structure

The integration tests use:

- **Mock Providers**: Node.js scripts that simulate different provider behaviors (success, fail, rate-limit, stream-fail)
- **Temporary Directories**: Isolated test environments for each test run
- **Real File I/O**: Actual configuration files and state persistence
- **Process Spawning**: Real subprocess execution to test provider integration
- **State Persistence**: Actual JSON file reading/writing for state management

## Mock Provider Behaviors

- **success**: Returns successful response with mock output
- **fail**: Returns failure with error message
- **rate-limit**: Returns rate limit error with RATE_LIMIT code
- **stream-fail**: Streams partial content then fails mid-stream

## Configuration

Tests support configuration through:

- JSON configuration files
- Environment variables (WTC\_\* prefix)
- Per-mode provider overrides
- Runtime configuration merging

## State Management

Provider state includes:

- Daily request counters
- Last request timestamps
- Credit exhaustion status
- Consecutive failure counts
- Persistence to disk with automatic reloading

## Error Handling

Comprehensive error handling for:

- Provider failures with automatic fallback
- Rate limiting with provider rotation
- Configuration validation errors
- File I/O errors during state persistence
- Network and subprocess execution errors
