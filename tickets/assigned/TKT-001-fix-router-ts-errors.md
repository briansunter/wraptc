---
id: TKT-001
priority: P0
assigned_to: @worker
---

# Fix TypeScript compilation errors in router.ts

## What

Fix all TypeScript compilation errors in `packages/core/src/router.ts` to enable successful compilation and testing.

## Why

The router module has critical TypeScript errors that prevent proper testing and compilation. These errors include:

- Property 'dailyRequestLimit' does not exist on union type
- Cannot find name 'ProviderErrorContext'

## Files

- `packages/core/src/router.ts` - Main file with errors
- `packages/core/src/types.ts` - May need type definitions

## Criteria

- [ ] All TypeScript errors in router.ts resolved
- [ ] `bun run typecheck` passes for router.ts
- [ ] Router module compiles successfully
- [ ] No regressions in existing functionality

## Notes

- Look at the union type issue with credit configuration
- Define or import ProviderErrorContext properly
- Check that all type references are correct
