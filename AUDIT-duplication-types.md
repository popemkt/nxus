# Audit: Code Duplication & TypeScript Type Usage

**Date:** 2026-03-10
**Scope:** Full monorepo — `apps/`, `libs/`, `packages/`

---

## Executive Summary

The codebase has **strong foundational type patterns** — discriminated unions, schema-first Zod definitions, type guards, and literal union types are used well in `@nxus/db`. However, there are two systemic issues:

1. **Massive server function boilerplate** — 50+ identical dynamic-import-then-init-db blocks
2. **Type holes at boundaries** — `z.any()` used in 8+ locations, bypassing the very validation the schema-first approach is meant to provide

Below are all findings ranked by impact.

---

## Part 1: Code Duplication

### 1.1 CRITICAL — Dynamic Import + DB Init Boilerplate (50+ instances)

Every server function that touches the database repeats this 3-line block:

```typescript
const { initDatabaseWithBootstrap, someFunction } = await import('@nxus/db/server')
const db = await initDatabaseWithBootstrap()
```

**Files with highest repetition:**

| File | Instances |
|------|-----------|
| `libs/nxus-workbench/src/server/reactive.server.ts` | 11 |
| `apps/nxus-core/src/services/inbox/inbox-reactive.server.ts` | 8 |
| `apps/nxus-recall/src/services/concepts.server.ts` | 7 |
| `apps/nxus-recall/src/services/review.server.ts` | 6 |
| `apps/nxus-recall/src/services/topics.server.ts` | 5 |

**Recommendation:** Create a `withDb` handler wrapper:

```typescript
// libs/nxus-db/src/server-helpers.ts
export function withDb<TInput, TResult>(
  imports: (mod: typeof import('@nxus/db/server')) => Record<string, Function>,
  handler: (ctx: { db: Database; fns: ReturnType<typeof imports>; data: TInput }) => TResult,
) {
  return async (ctx: { data: TInput }) => {
    const mod = await import('@nxus/db/server')
    const db = await mod.initDatabaseWithBootstrap()
    return handler({ db, fns: imports(mod), data: ctx.data })
  }
}
```

This preserves the dynamic import requirement while eliminating the boilerplate.

---

### 1.2 HIGH — Success/Error Response Pattern (77+ instances)

Every server function manually constructs `{ success: true as const, ... }` and `{ success: false as const, error: ... }`. Examples:

- `apps/nxus-recall/src/services/concepts.server.ts:15` — `return { success: true as const, concepts }`
- `apps/nxus-recall/src/services/concepts.server.ts:27` — `return { success: false as const, error: 'Concept not found' }`
- `libs/nxus-workbench/src/server/reactive.server.ts:78` — `return { success: true as const, computedFieldId, value }`

**Recommendation:** Extract typed response builders (tiny, no abstraction overhead):

```typescript
export const ok = <T extends Record<string, unknown>>(data: T) =>
  ({ success: true as const, ...data })

export const err = (error: string) =>
  ({ success: false as const, error })
```

---

### 1.3 HIGH — NodeInspector Component Duplication

Two nearly-identical implementations of the same component:

| Feature | `apps/nxus-core/.../debug/node-inspector.tsx` | `libs/nxus-workbench/.../NodeInspector.tsx` |
|---------|----------------------------------------------|---------------------------------------------|
| Lines | 457 | 737 |
| Inline editing | No | Yes (double-click header) |
| Breadcrumbs | No | Yes (owner chain) |
| Children section | No | Yes |
| Node link resolution | Raw UUID display | Fetches node names via `getNodeServerFn` |
| Backlinks | Yes | Yes |

**Shared code between both files:**
- `Section` component — identical collapsible section UI
- `MetaRow` component — identical metadata row
- `formatDate` function — identical date formatter
- `PropertyValue` renderer — near-identical (workbench version adds type icons)
- `PropertyRow` — similar structure
- UUID regex pattern — duplicated 4 times across both files

**Recommendation:** Export the workbench version as `<NodeInspector>` from `@nxus/workbench`. The debug version in nxus-core can import it directly (or use a stripped-down `variant="compact"` prop if needed).

---

### 1.4 MEDIUM — FSRS Card Object Construction (duplicated in review.server.ts)

The card-to-FSRS conversion block is copy-pasted at lines 69-81 and 171-183 of `apps/nxus-recall/src/services/review.server.ts`:

```typescript
const card = {
  due: new Date(concept.card.due),
  stability: concept.card.stability,
  difficulty: concept.card.difficulty,
  elapsed_days: concept.card.elapsedDays,
  scheduled_days: concept.card.scheduledDays,
  reps: concept.card.reps,
  lapses: concept.card.lapses,
  state: concept.card.state,
  last_review: concept.card.lastReview ? new Date(concept.card.lastReview) : undefined,
}
```

Similarly, the `intervals` reduction logic is duplicated at lines 140-147 and 186-193.

**Recommendation:** Extract `toFsrsCard(recallCard: RecallCard)` and `computeIntervals(scheduling)` helpers into `libs/nxus-db/src/types/recall.ts` or a recall utility module.

---

### 1.5 MEDIUM — Concept Schema Redefinition

`SaveConceptInputSchema` in `apps/nxus-recall/src/services/concepts.server.ts:32-40` is nearly identical to the inner object of `SaveConceptsBatchInputSchema.concepts` at lines 59-66 of the same file.

**Recommendation:** Define the concept input shape once, reuse it in both schemas:

```typescript
const ConceptInputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().optional(),
  bloomsLevel: BloomsLevelSchema.optional(),
  source: z.string().optional(),
  relatedConceptTitles: z.array(z.string()).optional(),
})

const SaveConceptInputSchema = ConceptInputSchema.extend({ topicId: z.string() })

const SaveConceptsBatchInputSchema = z.object({
  topicId: z.string(),
  concepts: z.array(ConceptInputSchema),
})
```

---

### 1.6 LOW — UUID Regex Pattern

The UUID detection regex is duplicated 4 times across the two NodeInspector files:

```typescript
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

**Recommendation:** Export `const UUID_REGEX` from `@nxus/db` or a shared utils module.

---

## Part 2: TypeScript Type Safety

### 2.1 CRITICAL — `z.any()` Usage (8+ locations)

These bypass Zod validation entirely, defeating the schema-first principle:

| File | Line | Context | Fix |
|------|------|---------|-----|
| `libs/nxus-db/src/types/item.ts` | 202, 218, 228 | `z.record(z.string(), z.any())` for command options | Define `CommandOptionsSchema` per mode |
| `libs/nxus-db/src/types/workflow.ts` | 48 | `z.record(z.string(), z.any())` for step params | Use `z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))` |
| `apps/nxus-core/src/services/graph/graph.server.ts` | 234, 271 | `z.any()` for Item type and updates | Use `ItemSchema` and `ItemSchema.partial()` |
| `libs/nxus-workbench/src/server/reactive.server.ts` | 37-38 | `z.any()` for QueryDefinition filters/sort | Use `QueryFilterSchema` and `QuerySortSchema` (already defined in `@nxus/db`) |
| `libs/nxus-workbench/src/server/query.server.ts` | 26, 58, 100 | `z.any()` for QueryDefinition | Same fix — import and use existing schemas |

**Priority fix for `reactive.server.ts:36-40`:** The properly typed `QueryDefinitionSchema` already exists in `@nxus/db`. Replace:

```typescript
// BAD (current)
const QueryDefinitionSchema = z.object({
  filters: z.array(z.any()),
  sort: z.any().optional(),
  limit: z.number().optional(),
})

// GOOD (just import the real one)
import { QueryDefinitionSchema } from '@nxus/db'
```

---

### 2.2 HIGH — Unsafe `as` Type Assertions

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `apps/nxus-core/src/services/graph/graph.server.ts` | 99 | `const result: any = { ...baseItem }` | Escapes all type checking for the entire Item construction |
| `apps/nxus-core/src/services/graph/graph.server.ts` | 130 | `return result as Item` | Casts unvalidated `any` to `Item` |
| `apps/nxus-core/src/services/graph/graph.server.ts` | 156 | `const anyItem = item as Record<string, unknown>` | Bypasses Item type narrowing |
| `apps/nxus-core/src/services/graph/graph.server.ts` | 45 | `node.props as Record<string, {}> | undefined` | `{}` is too broad |
| `apps/nxus-core/src/services/graph/graph.server.ts` | 63-67 | Multiple `props.X as Type` assertions | Unvalidated property access |

**The `graphNodeToItem` function (lines 60-131) is the worst offender** — it constructs an `Item` from `any` without any Zod validation, using 15+ `as` casts. This function should run the assembled object through `ItemSchema.parse()` to guarantee correctness.

**Recommendation:**
```typescript
function graphNodeToItem(node: GraphNode, tags: Array<TagRef> = []): Item {
  const raw = buildItemFromGraphNode(node, tags) // your current logic, returns unknown
  return ItemSchema.parse(raw) // validate at the boundary
}
```

---

### 2.3 HIGH — Recall Types Without Zod Schemas

`libs/nxus-db/src/types/recall.ts` defines 6 interfaces as plain TypeScript:

- `RecallTopic` (line 8)
- `RecallCard` (line 23)
- `RecallConcept` (line 36)
- `ReviewLog` (line 50)
- `RecallStats` (line 75)
- `LearningPathItem` (line 84)

These are used in server function responses that cross the client/server boundary but have **no runtime validation**. The `BloomsLevel` type is correctly defined as a const+type pattern (line 17-18) but has no Zod schema either.

**Recommendation:** Convert to schema-first:

```typescript
export const BloomsLevelSchema = z.enum(BLOOMS_LEVELS)
export type BloomsLevel = z.infer<typeof BloomsLevelSchema>

export const RecallCardSchema = z.object({
  due: z.string(),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  reps: z.number(),
  // ... etc
})
export type RecallCard = z.infer<typeof RecallCardSchema>
```

Note: `BloomsLevelSchema` is already re-created ad-hoc in `concepts.server.ts:5` — another sign these should be centralized.

---

### 2.4 MEDIUM — `Record<string, unknown>` as Escape Hatch

Several interfaces use `Record<string, unknown>` where tighter types would catch bugs:

| File | Line | Field | Better Type |
|------|------|-------|-------------|
| `libs/nxus-db/src/types/workflow.ts` | 29 | `params: Record<string, unknown>` | `Record<string, string \| number \| boolean>` |
| `libs/nxus-db/src/types/workflow.ts` | 33 | `variables: Record<string, unknown>` | Same |
| `libs/nxus-db/src/types/command.ts` | 38-41 | `configValues: Record<string, Record<string, unknown>>` | Infer from `ConfigFieldSchema` |

---

### 2.5 MEDIUM — `SavedQuery` Interface Without Schema

`libs/nxus-db/src/types/query.ts:225-233` defines `SavedQuery` as a plain interface even though it's assembled from node data at runtime:

```typescript
export interface SavedQuery {
  id: string
  content: string
  definition: QueryDefinition
  resultCache?: string[]
  evaluatedAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

Since this crosses server/client boundaries, it should have a Zod schema.

---

### 2.6 MEDIUM — Non-null Assertion in Workbench NodeInspector

`libs/nxus-workbench/src/components/node-inspector/NodeInspector.tsx:441`:

```typescript
onClick={() => onNavigate(node.ownerId!)}
```

The `!` assertion is unnecessary — there's already a `{node.ownerId && ...}` guard wrapping this JSX. But the TypeScript compiler can't narrow through JSX conditional rendering. Fix with:

```typescript
onClick={() => node.ownerId && onNavigate(node.ownerId)}
```

---

## Part 3: What's Working Well

These patterns are solid and should be preserved as templates:

### Discriminated Unions (Excellent)
- `ItemCommandSchema` — 8-variant discriminated union on `mode` (`libs/nxus-db/src/types/item.ts:243-252`)
- `WorkflowStepSchema` — 7-variant discriminated union on `type` (`libs/nxus-db/src/types/workflow.ts:135-143`)
- `QueryFilterSchema` — 7-variant union on `type` with recursive `LogicalFilter` (`libs/nxus-db/src/types/query.ts:162-171`)
- `AutomationTriggerSchema` / `AutomationActionSchema` in `libs/nxus-db/src/reactive/types.ts`

### Type Guards (20+)
- 7 filter type guards in `query.ts:275-319`
- 4 item type guards in `item.ts:491-517`
- 8 automation type guards in `reactive/types.ts:357-415`

### Schema-First Pattern (~80% adoption)
- All core domain types in `@nxus/db/types/` use `z.infer<typeof Schema>`
- Server function inputs validated via `.inputValidator(ZodSchema)`
- `ItemSchema.superRefine()` for cross-field validation (`item.ts:414-455`)

### Literal Unions (Correct)
- `ItemTypeSchema`, `ItemStatusSchema`, `CommandModeSchema`, `FilterOpSchema`
- All use `z.enum([...])` with `z.infer` — no loose strings

### Result Type
- `Result<T, E>` generic defined at `item.ts:532-534`
- Consistent `{ success: true/false }` pattern across all server functions

---

## Prioritized Action Items

| # | Category | Impact | Effort | Description |
|---|----------|--------|--------|-------------|
| 1 | Duplication | HIGH | LOW | Extract `withDb` handler wrapper to eliminate 50+ dynamic import blocks |
| 2 | Types | HIGH | LOW | Replace `z.any()` in `reactive.server.ts` and `query.server.ts` with existing `QueryDefinitionSchema` |
| 3 | Types | HIGH | MEDIUM | Add Zod schemas for all recall types (`RecallCard`, `RecallConcept`, etc.) |
| 4 | Types | HIGH | MEDIUM | Fix `graphNodeToItem` to validate through `ItemSchema.parse()` instead of `as` casting |
| 5 | Duplication | MEDIUM | LOW | Extract `ok()`/`err()` response builders |
| 6 | Duplication | MEDIUM | LOW | Unify NodeInspector — export from `@nxus/workbench`, remove nxus-core copy |
| 7 | Types | MEDIUM | LOW | Replace `z.any()` in `item.ts` command options with concrete schema |
| 8 | Duplication | MEDIUM | LOW | Extract FSRS card conversion + interval computation helpers |
| 9 | Duplication | LOW | LOW | Extract concept input schema, reuse in single and batch save |
| 10 | Types | LOW | LOW | Narrow `Record<string, unknown>` in workflow types |
| 11 | Types | LOW | LOW | Add `SavedQuery` Zod schema |
| 12 | Types | LOW | LOW | Extract UUID regex constant |
