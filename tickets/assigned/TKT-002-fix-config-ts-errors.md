---
id: TKT-002
priority: P0
assigned_to: @worker
---

# Fix TypeScript compilation errors in config.ts

## What

Fix all TypeScript compilation errors in `packages/core/src/config.ts` to enable successful compilation and testing.

## Why

The config module has critical TypeScript errors that prevent proper testing and compilation. These errors include:

- Argument of type 'string | undefined' is not assignable to parameter of type 'string'
- Cannot find module 'commander' or its corresponding type declarations
- Parameter 'thisCommand' implicitly has an 'any' type

## Files

- `packages/core/src/config.ts` - Main file with errors
- `packages/core/src/types.ts` - May need type definitions

## Criteria

- [ ] All TypeScript errors in config.ts resolved
- [ ] `bun run typecheck` passes for config.ts
- [ ] Config module compiles successfully
- [ ] No regressions in existing functionality

## Notes

- Handle undefined values properly in string operations
- Fix commander module import issues
- Add proper type annotations for function parameters
