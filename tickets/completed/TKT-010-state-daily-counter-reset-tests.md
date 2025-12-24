---
id: TKT-010
priority: P1
assigned_to: @worker
status: completed
updated: 2025-11-24
---

# State manager daily counter reset tests

## What

Implement comprehensive tests for the state manager's daily counter reset functionality, covering automatic reset when date changes, manual reset functionality, counter persistence, and edge cases.

## Why

Proper daily counter reset ensures accurate tracking of provider usage across days, preventing quota violations and ensuring fair usage policies are enforced.

## Files

- `packages/core/src/state.test.ts` - Add new test cases for daily counter reset functionality
- `packages/core/src/state.ts` - State manager implementation (reference)

## Criteria

- [x] Test automatic reset when date changes
- [x] Test manual reset functionality
- [x] Test counter persistence across resets
- [x] Test edge cases like midnight transitions
- [x] All tests pass with proper coverage

## Notes

- Focus on the `resetDailyCountersIfNeeded` method and related functionality
- Test both automatic daily resets and manual provider resets
- Ensure proper date handling and timezone considerations
- Test boundary conditions around midnight transitions
- Verify that errors are preserved during resets while counters are cleared
