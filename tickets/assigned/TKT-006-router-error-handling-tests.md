---
id: TKT-006
priority: P1
assigned_to: @worker
---

# Router error handling and fallback tests

## What

Create comprehensive tests for the router's error handling and provider fallback mechanisms.

## Why

Proper error handling and fallback logic are essential for a resilient system that can gracefully handle provider failures and continue operating.

## Files

- `packages/core/src/router.test.ts` - Add new test cases
- `packages/core/src/router.ts` - Router implementation (reference)

## Criteria

- [ ] Test TRANSIENT error handling and fallback
- [ ] Test OUT_OF_CREDITS error handling and marking
- [ ] Test RATE_LIMIT error handling and cooldown
- [ ] Test BAD_REQUEST immediate failure
- [ ] Test INTERNAL error handling
- [ ] Test all providers failing scenario
- [ ] All tests pass with proper coverage

## Notes

- Use proper mocking for providers and state manager
- Test error classification logic
- Ensure state updates occur correctly on errors
- Test timing and metadata inclusion
