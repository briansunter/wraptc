---
id: TKT-008
priority: P1
assigned_to: @worker
status: in-progress
updated: 2025-11-24
---

# Router streaming functionality tests

## What

Create comprehensive tests for the router's streaming functionality and event handling.

## Why

Streaming is a key feature that allows real-time response processing and better user experience for long-running operations.

## Files

- `packages/core/src/router.test.ts` - Add new test cases
- `packages/core/src/router.ts` - Router implementation (reference)

## Criteria

- [x] Test successful streaming response handling
- [x] Test streaming provider failure and fallback
- [x] Test streaming error handling
- [x] Test timing metadata in streaming responses
- [x] Test different streaming modes (jsonl, line)
- [x] All tests pass with proper coverage

## Notes

- Use proper mocking for providers and state manager
- Test both successful streaming and error scenarios
- Ensure proper event generation and handling
- Test resource cleanup on streaming completion
