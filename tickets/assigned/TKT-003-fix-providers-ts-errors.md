---
id: TKT-003
priority: P0
assigned_to: @worker
---

# Fix TypeScript compilation errors in providers

## What

Fix all TypeScript compilation errors in provider modules to enable successful compilation and testing.

## Why

Multiple provider modules have critical TypeScript errors that prevent proper testing and compilation. These errors include:

- Cannot find name 'ProviderInvokeOptions'
- Argument type mismatches
- Various other type errors

## Files

- `packages/core/src/providers/custom.ts` - Main file with errors
- `packages/core/src/providers/codex-optimized.ts` - Additional errors
- `packages/core/src/providers/index.test.ts` - Test file with numerous errors

## Criteria

- [ ] All TypeScript errors in provider modules resolved
- [ ] `bun run typecheck` passes for all provider files
- [ ] Provider modules compile successfully
- [ ] No regressions in existing functionality

## Notes

- Define or import ProviderInvokeOptions properly
- Fix argument type mismatches
- Address test file syntax errors
- Ensure all provider interfaces are correctly implemented
