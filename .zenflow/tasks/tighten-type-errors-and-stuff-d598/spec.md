# Technical Specification: Tighten Type Errors

## Task Difficulty Assessment: **Medium**

This task involves fixing TypeScript errors and tightening type definitions. While the number of errors is high (506), the patterns are repetitive and the solutions are straightforward.

---

## Technical Context

### Technology Stack
- **Language**: TypeScript 5.9
- **Build System**: Nx 22.3.x monorepo
- **Package Manager**: pnpm 10.15.0
- **Schema Validation**: Zod 4.2.1
- **Database ORM**: Drizzle ORM

### Package Structure
```
packages/
├── nxus-db/        # Database layer with type definitions
├── nxus-core/      # Main application
├── nxus-ui/        # Shared UI components
└── nxus-workbench/ # Query builder UI
```

---

## Error Analysis

### Error Summary (506 total errors)

| Error Code | Count | Description |
|------------|-------|-------------|
| TS2322 | 334 | Type mismatch (wrong type assigned) |
| TS2741 | 58 | Missing required property |
| TS6133/TS6196 | 68 | Unused variables/imports |
| TS2345 | 20 | Argument type mismatch |
| TS2339 | 16 | Property doesn't exist on type |
| TS2769 | 2 | No overload matches call |
| TS2724 | 2 | Module export issue |
| TS2308 | 2 | Duplicate export name |
| TS2353 | 2 | Object literal extra property |
| TS2707 | 2 | Type narrowing issue |

### Root Cause Analysis

#### 1. QueryFilter Type Tightening (Most Errors)

**Problem**: The `SupertagFilter` type has `includeInherited: z.boolean()` without `.optional()`, meaning it's **required**. But tests and code create filters like:

```typescript
// Current (invalid):
{ type: 'supertag', supertagId: 'supertag:task' }

// Required:
{ type: 'supertag', supertagId: 'supertag:task', includeInherited: true }
```

**Files Affected**:
- `packages/nxus-db/src/reactive/__tests__/automation.test.ts` (~50 occurrences)
- `packages/nxus-db/src/reactive/__tests__/computed-field.test.ts` (~50 occurrences)
- `packages/nxus-db/src/reactive/__tests__/query-subscription.test.ts` (~50 occurrences)
- `packages/nxus-db/src/reactive/__tests__/integration.test.ts` (~30 occurrences)

**Schema Definition** (`packages/nxus-db/src/types/query.ts:50-55`):
```typescript
export const SupertagFilterSchema = BaseFilterSchema.extend({
  type: z.literal('supertag'),
  supertagId: z.string(),
  includeInherited: z.boolean().optional().default(true), // Has default but TS infers as required
})
```

**Fix Options**:
1. **Option A (Recommended)**: Make `includeInherited` truly optional in TypeScript by using `.optional()` before `.default()`:
   ```typescript
   includeInherited: z.boolean().default(true) // This makes TS type include undefined
   ```
   Zod's `.default()` only affects parsing, not the TypeScript type inference.

2. **Option B**: Add `includeInherited: true` to all test fixtures (334+ changes, tedious but explicit).

#### 2. QueryDefinition Missing `limit` Property

**Problem**: `QueryDefinition.limit` has a default but is inferred as required:

```typescript
// Schema
export const QueryDefinitionSchema = z.object({
  filters: z.array(QueryFilterSchema).optional().default([]),
  sort: QuerySortSchema.optional(),
  limit: z.number().optional().default(500), // Has default
})
```

**Files Affected**:
- Multiple test files where `{ filters: [] }` is passed without `limit`

**Fix**: Make `limit` optional in the type (already has `.optional()` so this should work).

#### 3. Duplicate `SavedQuery` Export (TS2308)

**Problem**: `SavedQuery` is defined in both:
- `packages/nxus-db/src/types/query.ts:225`
- `packages/nxus-db/src/types/node.ts:49`

And both are re-exported from `types/index.ts`.

**Fix**: Remove duplicate from `node.ts` and keep only the one in `query.ts`.

#### 4. Missing `isPrimary` Column (TS2339)

**Problem**: `node.service.ts:1347` references `isPrimary` property but `itemTypes` schema doesn't include it.

**Schema** (`packages/nxus-db/src/schemas/item-schema.ts:231-239`):
```typescript
export const itemTypes = sqliteTable('item_types', {
  itemId: text('item_id').notNull(),
  type: text('type').$type<AppType>().notNull(),
  order: integer('order').default(0),
  // Missing: isPrimary column
})
```

**Fix**: Add `isPrimary` column to `itemTypes` schema, or remove the references in `node.service.ts`.

#### 5. Unused Imports (TS6133/TS6196)

**Problem**: Multiple files have unused imports/variables:
- `packages/nxus-db/src/reactive/dependency-tracker.ts` - unused type guards
- `packages/nxus-db/src/services/node.service.ts` - unused `and` import
- Various test files - unused test helpers

**Fix**: Remove unused imports or prefix with underscore if intentionally unused.

---

## Implementation Approach

### Phase 1: Schema Type Fixes (High Impact)

Fix the Zod schema type inference issues that cascade into 400+ errors:

1. **Fix SupertagFilter schema** - Ensure `includeInherited` is properly optional:
   ```typescript
   includeInherited: z.boolean().optional().default(true)
   ```

2. **Fix QueryDefinition schema** - Verify optional fields are properly typed.

3. **Remove duplicate SavedQuery** - Delete from `node.ts`.

### Phase 2: Database Schema Fix

1. **Add or remove `isPrimary` column** - Either:
   - Add `isPrimary: integer('is_primary').default(0)` to `itemTypes`
   - Or remove references in `node.service.ts` if feature not needed

### Phase 3: Code Cleanup

1. **Remove unused imports** - Clean up dependency-tracker.ts, node.service.ts
2. **Fix test fixtures** - If schema changes don't resolve all issues

### Phase 4: Prevent Future Errors

1. **Add `noUnusedLocals` and `noUnusedParameters`** to tsconfig
2. **Add typecheck to CI** - Ensure `nx run-many --target=typecheck` passes
3. **Add MIT LICENSE file**

---

## Files to Modify

### Schema Fixes
| File | Change |
|------|--------|
| `packages/nxus-db/src/types/query.ts` | Fix SupertagFilter includeInherited type |
| `packages/nxus-db/src/types/node.ts` | Remove duplicate SavedQuery |
| `packages/nxus-db/src/schemas/item-schema.ts` | Add isPrimary column to itemTypes |

### Code Cleanup
| File | Change |
|------|--------|
| `packages/nxus-db/src/reactive/dependency-tracker.ts` | Remove unused imports |
| `packages/nxus-db/src/services/node.service.ts` | Remove unused `and` import, fix isPrimary usage |

### Test Fixtures (if needed after schema fixes)
- `packages/nxus-db/src/reactive/__tests__/*.test.ts` - Add missing required fields

### New Files
| File | Purpose |
|------|---------|
| `LICENSE` | MIT license file |

### Configuration
| File | Change |
|------|--------|
| `tsconfig.base.json` | Add stricter compiler options |

---

## Verification Approach

1. **TypeCheck**: `pnpm nx run-many --target=typecheck --all` must pass with 0 errors
2. **Build**: `pnpm nx run-many --target=build --all` must succeed
3. **Tests**: `pnpm nx run-many --target=test --all` must pass (ensure fixes don't break runtime)

---

## Type Tightening Opportunities

Beyond fixing errors, these patterns can be tightened:

### 1. Make Default Values Explicit in Types

Currently Zod's `.default()` doesn't affect TypeScript inference for output types. Consider using explicit type annotations or branded types.

### 2. Stricter FilterOp Usage

`FilterOp` includes both string and field-value operators. Consider splitting into:
- `StringFilterOp = 'contains' | 'startsWith' | 'endsWith'`
- `ComparisonFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'`
- `ExistenceFilterOp = 'isEmpty' | 'isNotEmpty'`

### 3. Field ID Type Safety

The codebase uses both UUIDs and SystemIds (e.g., 'field:status') for field references. Consider a branded type:
```typescript
type FieldId = string & { __brand: 'FieldId' }
type FieldSystemId = `field:${string}`
type FieldReference = FieldId | FieldSystemId
```

### 4. QueryDefinition Builder Pattern

Instead of object literals, provide a fluent builder:
```typescript
const query = QueryBuilder.create()
  .withSupertag('supertag:task')
  .withProperty('field:status', 'eq', 'active')
  .limit(100)
  .build()
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Schema changes break runtime parsing | Zod schemas have defaults, existing data will parse |
| Test changes introduce bugs | Run full test suite after changes |
| Database migration needed | `isPrimary` column addition may need migration script |

---

## Estimated Scope

- **Schema fixes**: 3-4 files, ~20 lines changed
- **Cleanup**: 5-10 files, ~50 lines removed
- **Test fixtures**: 0-50 files depending on schema fix effectiveness
- **New files**: LICENSE (1 file)
- **Config**: tsconfig.base.json (1 file)
