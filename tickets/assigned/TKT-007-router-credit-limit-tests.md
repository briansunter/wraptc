---
id: TKT-007
priority: P1
assigned_to: @worker
---

# Router credit limit and daily counter tests

## What

Create comprehensive tests for the router's credit limit enforcement and daily request counting functionality.

## Why

Credit limit management is a key feature that prevents exceeding usage quotas and ensures fair usage across providers.

## Files

- `packages/core/src/router.test.ts` - Add new test cases
- `packages/core/src/router.ts` - Router implementation (reference)

## Criteria

- [ ] Test daily request limit enforcement
- [ ] Test out of credits provider skipping
- [ ] Test credit limit reset functionality
- [ ] Test mixed provider states (some with limits, some without)
- [ ] Test plan-based providers vs limit-based providers
- [ ] All tests pass with proper coverage

## Notes

- Use proper mocking for providers and state manager
- Test both daily limits and out of credits scenarios
- Ensure proper state interactions
- Test boundary conditions
