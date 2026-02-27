# Technical Specification: Fix OR Pattern with nodeId

## Difficulty: Easy-Medium

The previous fix (commits `3ac6e97`, `db34d00`) addressed OR-style patterns for **field operations** (`fieldNodeId`, `fieldSystemId`). This task applies the same treatment to **node operations** — places where `node.systemId || node.id` or `supertag.systemId || supertag.id` creates ambiguous, inconsistent identification.

## Technical Context

- **Language**: TypeScript (monorepo with NX)
- **Key libraries**: Drizzle ORM, React, TanStack Router, Zod
- **Test runner**: Vitest (via NX `test` target)
- **Commands**: `pnpm test:libs` runs all library tests

### Data Model

Nodes have dual identification:
- `id` — UUID (always present, e.g., `019c0a49-abc...`)
- `systemId` — human-readable prefix identifier (nullable, e.g., `supertag:task`, `field:status`)

The `AssembledNode.supertags` array contains `{ id: string; content: string; systemId: string | null }`.

### The Problem

Code uses `systemId || id` as a fallback, mixing two fundamentally different identifier formats. This causes:
1. **Inconsistent signatures** — the same supertag may produce different identifiers depending on whether `systemId` is populated, breaking change detection
2. **Ambiguous React keys/values** — UI components may use UUIDs for some items and systemIds for others
3. **Display inconsistency** — users see raw UUIDs mixed with system identifiers

## Identified Instances

### Category A: Core Logic (affects correctness)

#### A1. `query-subscription.service.ts:213` — CRITICAL
```typescript
const supertagsSignature = node.supertags
  .map((s) => s.systemId || s.id)  // BUG: mixed identifier types
  .sort()
  .join(',')
```
**Impact**: Node signature computation uses inconsistent identifiers, causing false change detection in reactive queries.
**Fix**: Use `s.id` (UUID) consistently for signatures — it's always present and unique.

#### A2. `computed-field.service.ts:193` — Field lookup OR pattern
```typescript
if (prop.fieldNodeId === fieldId || prop.fieldSystemId === fieldId) {
```
**Context**: This is a field-level OR, already addressed conceptually by the previous fix. The pattern is intentional here (dual-key matching with a caller-provided `fieldId` that may be either format). This was explicitly documented. **Leave as-is** — the caller controls which format to pass.

#### A3. `query-evaluator.service.ts:834` and `surreal-backend.ts:1524` — Sort value lookup
```typescript
if (pv.fieldSystemId === field || pv.fieldName === field) {
```
**Context**: These are in `getSortValue()` — field-level matching for sort operations. The `field` parameter is always a systemId or content name. This is intentional dual-key matching. **Leave as-is**.

### Category B: UI Components (affects consistency/UX)

#### B1. `supertag-filter.tsx:118-119` — React key/value
```typescript
key={supertag.systemId || supertag.id}
value={supertag.systemId || supertag.id}
```
**Impact**: Mixed identifier formats for React keys and select values. If some supertags have systemIds and others don't, the value format is inconsistent.
**Fix**: Prefer `supertag.systemId ?? supertag.id` for value (the downstream code already expects systemId-format values like `supertag:item`). Or better: since line 129-138 shows hardcoded `supertag:item` / `supertag:tool` values, use systemId when available and id as fallback (current behavior is OK semantically, but should use `??` instead of `||` to avoid false-y content strings).

#### B2. `supertag-filter.tsx:123` — Display name
```typescript
{formatSupertagName(supertag.systemId || supertag.content || '')}
```
**Fix**: Use `supertag.systemId ?? supertag.content ?? ''` (nullish coalescing instead of OR).

#### B3. `graph.server.ts:234` — Supertag name fallback
```typescript
supertagNames[supertagId] = stNode.content || stNode.systemId || 'Unknown'
```
**Fix**: Use `stNode.content ?? stNode.systemId ?? 'Unknown'`.

#### B4. `graph.server.ts:242` — Node label
```typescript
label: node.content || node.systemId || 'Untitled',
```
**Fix**: Use `node.content ?? node.systemId ?? 'Untitled'`.

#### B5. `graph.server.ts:452` — Backlink label
```typescript
label: refNode.content || refNode.systemId || 'Untitled',
```
**Fix**: Use `refNode.content ?? refNode.systemId ?? 'Untitled'`.

#### B6. `use-graph-data.ts:179` — Graph node label
```typescript
label: source.content || source.systemId || 'Untitled',
```
**Fix**: Use `source.content ?? source.systemId ?? 'Untitled'`.

#### B7. `NodeInspector.tsx:211,213,370,406,551,588` — Display names (6 instances)
```typescript
{item.content || item.systemId || item.id.slice(0, 8)}
// and similar patterns
```
**Fix**: Use nullish coalescing (`??`) throughout.

#### B8. `apps/nxus-core/src/components/features/debug/node-inspector.tsx:235` — Debug display
```typescript
{bl.content || bl.systemId || bl.id.slice(0, 8)}
```
**Fix**: Use `??`.

### Category C: Example/Script code (low priority)

#### C1. `mini-app-example.ts:49` — Console logging
```typescript
console.log(`     - ${item.content} (${item.systemId || item.id})`)
```
**Fix**: Use `??`.

### Category D: Test code

#### D1. `automation.test.ts:63` — Test helper
```typescript
if (pv.fieldNodeId === fieldId || pv.fieldSystemId === fieldId) {
```
**Status**: Intentional dual-key matching in test helper. **Leave as-is** (mirrors the production pattern in computed-field.service.ts).

#### D2. `integration.test.ts:54` — Test helper
```typescript
if (pv.fieldSystemId === fieldId || pv.fieldNodeId === fieldId) {
```
**Status**: Same as D1 but with reversed order. **Leave as-is**.

## Implementation Approach

### Fix A1 (Critical): Use stable identifiers in node signatures
Change `s.systemId || s.id` to `s.id` in `computeNodeSignature()`. The UUID `id` is always present and unique, making it the correct choice for signature computation. The `systemId` is a display-friendly alias and shouldn't be used for identity comparison.

### Fix B1-B8 (UI): Replace `||` with `??` (nullish coalescing)
The display fallback chains like `content || systemId || id` are semantically correct — they try the most human-readable option first. However, `||` treats empty strings as falsy, which can skip valid (but empty) content values. Using `??` is more precise: it only falls back when the value is `null` or `undefined`, not when it's an empty string `""`.

This is a straightforward search-and-replace within the identified files.

### Fix C1: Minor cleanup in example code
Same `??` replacement.

## Source Code Files to Modify

| File | Changes | Category |
|------|---------|----------|
| `libs/nxus-db/src/reactive/query-subscription.service.ts` | Line 213: `s.systemId \|\| s.id` → `s.id` | A (Critical) |
| `libs/nxus-workbench/src/features/query-builder/filters/supertag-filter.tsx` | Lines 118, 119, 123: `\|\|` → `??` | B (UI) |
| `libs/nxus-workbench/src/server/graph.server.ts` | Lines 234, 242, 452: `\|\|` → `??` | B (UI) |
| `libs/nxus-workbench/src/features/graph/provider/use-graph-data.ts` | Line 179: `\|\|` → `??` | B (UI) |
| `libs/nxus-workbench/src/components/node-inspector/NodeInspector.tsx` | Lines 211, 213, 370, 406, 551, 588: `\|\|` → `??` | B (UI) |
| `apps/nxus-core/src/components/features/debug/node-inspector.tsx` | Line 235: `\|\|` → `??` | B (UI) |
| `libs/nxus-db/examples/mini-app-example.ts` | Line 49: `\|\|` → `??` | C (Example) |

**No changes to**: `computed-field.service.ts`, `query-evaluator.service.ts`, `surreal-backend.ts`, test files — these use intentional dual-key matching patterns with `===` comparisons, not fallback OR.

## Verification

1. Run `pnpm test:libs` — all existing tests should pass
2. Verify the `query-subscription.test.ts` tests specifically (they test `hasNodeChanged` and signature computation)
3. Run TypeScript check to confirm `??` operator works with the existing types (it will, since the values are `string | null`)
