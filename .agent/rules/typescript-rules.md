---
trigger: always_on
glob: "**/*.ts,**/*.tsx"
description: TypeScript best practices for tight modeling and type safety
---

# TypeScript Rules

## Core Principle
Make invalid states unrepresentable. Catch logic errors at compile time, not runtime.

## Patterns (Apply Where Appropriate)

1. **Discriminated Unions** - Use for polymorphic types with multiple variants (commands, events, states)
   ```typescript
   z.discriminatedUnion('mode', [ExecuteSchema, TerminalSchema])
   ```

2. **Zod Schema-First** - Use at validation boundaries (server functions, API inputs, file parsing). Infer types with `z.infer<typeof Schema>`

3. **Result Types** - Use when callers need explicit error handling paths
   ```typescript
   { success: true; data: T } | { success: false; error: E }
   ```

4. **Type Guards** - Use `x is SomeType` predicates when narrowing discriminated unions

5. **Branded Constants** - Use `as const satisfies` for type-safe constant maps

6. **Literal Unions** - Prefer `'a' | 'b' | 'c'` over `string` when values are known

7. **Validate at Parse Layer** - Ensure shape at data boundaries (e.g., `parseAppRecord`), never downstream

8. **Required = No Default** - Params without `defaultValue` are implicitly required

## Avoid

- `any` - use `unknown` and narrow
- Non-null assertions (`!`) without proof
- Unsafe type assertions (`as Type`) - validate instead
- `object` or `{}` - too broad
