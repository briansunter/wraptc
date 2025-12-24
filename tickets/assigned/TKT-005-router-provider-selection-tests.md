---
id: TKT-005
priority: P1
assigned_to: @worker
---

# Router provider selection logic tests

## What

Create comprehensive tests for the router's provider selection logic including default order, mode overrides, and explicit provider selection.

## Why

The router is a critical component that determines which provider to use for each request. Proper testing ensures reliable provider selection under various conditions.

## Files

- `packages/core/src/router.test.ts` - Add new test cases
- `packages/core/src/router.ts` - Router implementation (reference)

## Criteria

- [ ] Test default provider ordering
- [ ] Test mode-specific override routing
- [ ] Test explicit provider selection
- [ ] Test provider not found scenarios
- [ ] Test empty provider list scenarios
- [ ] All tests pass with proper coverage

## Notes

- Use proper mocking for providers and state manager
- Test edge cases like empty provider lists
- Ensure tests cover all routing paths
- Follow existing test patterns in the codebase
