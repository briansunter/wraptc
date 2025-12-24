---
id: TKT-012
title: State manager out of credits functionality tests
status: completed
priority: P1
assigned_to: @worker
created: 2025-11-24
updated: 2025-11-24
completed: 2025-11-24
related_files:
  - packages/core/src/state.test.ts
  - packages/core/src/state.ts
  - packages/core/src/router.ts
  - packages/core/src/types.ts
---

# TKT-012: State manager out of credits functionality tests

Implement tests for the out-of-credits functionality including:

1. Testing credit limit detection and enforcement
2. Testing out-of-credits state persistence
3. Testing credit reset functionality
4. Testing provider selection when credits are exhausted

## Acceptance Criteria

- [x] Create ticket file
- [x] Implement tests for credit limit detection and enforcement
- [x] Implement tests for out-of-credits state persistence
- [x] Implement tests for credit reset functionality
- [x] Implement tests for provider selection when credits are exhausted
- [x] All tests pass with proper timeouts
- [x] Update plan.md to mark ticket as completed
