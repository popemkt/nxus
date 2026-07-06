---
trigger: always_on
glob: "**/*.ts,**/*.tsx"
description: TypeScript best practices for tight modeling and type safety
---

# TypeScript Rules (session cache — canonical spec: spec/rules/typescript.md)
Core principle: make invalid states unrepresentable — catch logic errors at compile time, not runtime. Patterns (discriminated unions, Zod schema-first at boundaries, Result types, type guards, branded constants, literal unions, parse-layer validation): `spec/rules/typescript.md`.

## Avoid

- `any` - use `unknown` and narrow
- Non-null assertions (`!`) without proof
- Unsafe type assertions (`as Type`) - validate instead
- `object` or `{}` - too broad
