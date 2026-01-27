# Technical Specification: Tana-like Reactive Query System

## Difficulty Assessment: **Hard**

This is a complex feature requiring:
- New data model additions (Query supertag, query definition schema)
- Backend query evaluation engine with multiple filter types
- Frontend query builder UI with Tana-like UX
- Reactivity layer via TanStack Query cache invalidation
- Integration with existing gallery to use the generic query backend
- Foundation for future Tana mini-app

---

## 1. Technical Context

### Technology Stack
- **Frontend**: React 19, TanStack React Query, TanStack React Router, Zustand
- **Backend**: Better-sqlite3 + Drizzle ORM (embedded SQLite)
- **Type Safety**: TypeScript, Zod for validation
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Server Functions**: `@tanstack/react-start` with `createServerFn`

### Existing Patterns
- **Server functions** in `packages/nxus-workbench/src/server/*.server.ts`
- **Node service** in `packages/nxus-db/src/services/node.service.ts`
- **React hooks** compose pure functions from `lib/`
- **Zustand stores** for client state management

### Key Dependencies
- `@nxus/db` - Database layer (schemas, services, types)
- `@nxus/workbench` - Node workbench UI and server functions
- `@nxus/core` - Main application with gallery, hooks, services

---

## 2. Requirements Summary

### Core Features (from Tana docs)
1. **Live Search Nodes** - Dynamic queries that return matching nodes
2. **Query Builder UI** - Visual interface for constructing queries
3. **Filter Operators**:
   - Supertag filters (HAS TAG)
   - Field filters (HAS FIELD, field value comparisons)
   - Logical operators (AND, OR, NOT)
   - Relational operators (CHILD OF, OWNED BY, LINKS TO)
   - Temporal filters (CREATED LAST N DAYS, EDITED LAST N DAYS)
4. **Results as References** - Edits update everywhere
5. **Lazy Evaluation** - Queries run when expanded, not constantly in background

### Integration Goals
- Gallery list should be powered by a saved query (e.g., "All Items")
- Mini-apps can define their own queries without custom code
- Foundation for future Tana-like note editor with embedded queries

---

## 3. Data Model Changes

### 3.1 New System Supertag: `supertag:query`

Add to `packages/nxus-db/src/schemas/node-schema.ts`:

```typescript
export const SYSTEM_SUPERTAGS = {
  // ... existing
  QUERY: 'supertag:query',  // NEW
} as const
```

### 3.2 New System Fields for Queries

Add to `SYSTEM_FIELDS`:

```typescript
export const SYSTEM_FIELDS = {
  // ... existing

  // Query-specific fields
  QUERY_DEFINITION: 'field:query_definition',  // JSON query definition
  QUERY_SORT: 'field:query_sort',              // Sort configuration
  QUERY_LIMIT: 'field:query_limit',            // Max results
  QUERY_RESULT_CACHE: 'field:query_result_cache', // Cached node IDs (optional)
  QUERY_EVALUATED_AT: 'field:query_evaluated_at', // Last evaluation timestamp
} as const
```

### 3.3 Query Definition Schema

New file: `packages/nxus-db/src/types/query.ts`

```typescript
import { z } from 'zod'

/**
 * Filter operators for property comparisons
 */
export const FilterOpSchema = z.enum([
  'eq',        // equals
  'neq',       // not equals
  'gt',        // greater than
  'gte',       // greater than or equal
  'lt',        // less than
  'lte',       // less than or equal
  'contains',  // string contains
  'startsWith', // string starts with
  'endsWith',  // string ends with
  'isEmpty',   // field is empty/null
  'isNotEmpty', // field has value
])
export type FilterOp = z.infer<typeof FilterOpSchema>

/**
 * Base filter interface
 */
const BaseFilterSchema = z.object({
  id: z.string().optional(), // For UI tracking
})

/**
 * Supertag filter - matches nodes with a specific supertag
 */
export const SupertagFilterSchema = BaseFilterSchema.extend({
  type: z.literal('supertag'),
  supertagSystemId: z.string(), // e.g., 'supertag:item', 'supertag:tool'
  includeInherited: z.boolean().default(true), // Include child supertags
})

/**
 * Property filter - matches nodes by field value
 */
export const PropertyFilterSchema = BaseFilterSchema.extend({
  type: z.literal('property'),
  fieldSystemId: z.string(), // e.g., 'field:status', 'field:type'
  op: FilterOpSchema,
  value: z.unknown().optional(), // Value to compare (not needed for isEmpty/isNotEmpty)
})

/**
 * Content filter - full-text search on node content
 */
export const ContentFilterSchema = BaseFilterSchema.extend({
  type: z.literal('content'),
  query: z.string(), // Search text
  caseSensitive: z.boolean().default(false),
})

/**
 * Relation filter - matches based on node relationships
 */
export const RelationFilterSchema = BaseFilterSchema.extend({
  type: z.literal('relation'),
  relationType: z.enum(['childOf', 'ownedBy', 'linksTo', 'linkedFrom']),
  targetNodeId: z.string().optional(), // Specific node, or omit for "has any"
  fieldSystemId: z.string().optional(), // For linksTo: which field to check
})

/**
 * Temporal filter - matches based on timestamps
 */
export const TemporalFilterSchema = BaseFilterSchema.extend({
  type: z.literal('temporal'),
  field: z.enum(['createdAt', 'updatedAt']),
  op: z.enum(['within', 'before', 'after']),
  days: z.number().optional(), // For 'within' last N days
  date: z.string().optional(), // ISO date for 'before'/'after'
})

/**
 * Has field filter - checks if node has a specific field
 */
export const HasFieldFilterSchema = BaseFilterSchema.extend({
  type: z.literal('hasField'),
  fieldSystemId: z.string(),
  negate: z.boolean().default(false), // true = "does NOT have field"
})

/**
 * Logical filter - combines multiple filters
 */
export const LogicalFilterSchema: z.ZodType<LogicalFilter> = BaseFilterSchema.extend({
  type: z.enum(['and', 'or', 'not']),
  filters: z.lazy(() => z.array(QueryFilterSchema)),
})

/**
 * Union of all filter types
 */
export const QueryFilterSchema = z.discriminatedUnion('type', [
  SupertagFilterSchema,
  PropertyFilterSchema,
  ContentFilterSchema,
  RelationFilterSchema,
  TemporalFilterSchema,
  HasFieldFilterSchema,
  z.object({
    type: z.enum(['and', 'or', 'not']),
    id: z.string().optional(),
    filters: z.lazy(() => z.array(QueryFilterSchema)),
  }),
])
export type QueryFilter = z.infer<typeof QueryFilterSchema>

// Type for logical filter (recursive)
export interface LogicalFilter {
  type: 'and' | 'or' | 'not'
  id?: string
  filters: QueryFilter[]
}

/**
 * Sort configuration
 */
export const QuerySortSchema = z.object({
  field: z.string(), // 'content', 'createdAt', 'updatedAt', or field systemId
  direction: z.enum(['asc', 'desc']),
})
export type QuerySort = z.infer<typeof QuerySortSchema>

/**
 * Complete query definition
 */
export const QueryDefinitionSchema = z.object({
  filters: z.array(QueryFilterSchema).default([]),
  sort: QuerySortSchema.optional(),
  limit: z.number().optional(),
})
export type QueryDefinition = z.infer<typeof QueryDefinitionSchema>

/**
 * Saved query node structure (for reference)
 * Stored as a node with supertag:query
 */
export interface SavedQuery {
  id: string
  content: string // Query name
  definition: QueryDefinition
  resultCache?: string[] // Cached node IDs
  evaluatedAt?: Date
}
```

---

## 4. API Design

### 4.1 Server Functions

New file: `packages/nxus-workbench/src/server/query.server.ts`

```typescript
/**
 * Evaluate a query definition and return matching nodes
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    definition: QueryDefinitionSchema,
    limit: z.number().optional(),
  }))
  .handler(async (ctx): Promise<{ success: true; nodes: AssembledNode[] }> => {
    // Implementation: parse filters, build SQL, assemble nodes
  })

/**
 * Create/save a query node
 */
export const createQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    name: z.string(),
    definition: QueryDefinitionSchema,
    ownerId: z.string().optional(), // Parent node for organization
  }))
  .handler(async (ctx): Promise<{ success: true; queryId: string }> => {
    // Create node with supertag:query, store definition as property
  })

/**
 * Update a saved query
 */
export const updateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    queryId: z.string(),
    name: z.string().optional(),
    definition: QueryDefinitionSchema.optional(),
  }))
  .handler(async (ctx) => {
    // Update query node properties
  })

/**
 * Get all saved queries
 */
export const getSavedQueriesServerFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ success: true; queries: SavedQuery[] }> => {
    // Query nodes with supertag:query
  })

/**
 * Execute a saved query by ID
 */
export const executeSavedQueryServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ queryId: z.string() }))
  .handler(async (ctx) => {
    // Load query definition, evaluate, return results
  })
```

### 4.2 Query Evaluation Engine

New file: `packages/nxus-db/src/services/query-evaluator.service.ts`

```typescript
/**
 * Core query evaluation logic - pure function, no server dependencies
 */
export function evaluateQuery(
  db: ReturnType<typeof getDatabase>,
  definition: QueryDefinition,
): AssembledNode[] {
  // 1. Start with all non-deleted nodes or supertag-filtered set
  // 2. Apply each filter in sequence (AND by default)
  // 3. Sort results
  // 4. Apply limit
  // 5. Assemble and return nodes
}

/**
 * Evaluate a single filter
 */
function evaluateFilter(
  db: ReturnType<typeof getDatabase>,
  filter: QueryFilter,
  candidateNodeIds: Set<string>,
): Set<string> {
  switch (filter.type) {
    case 'supertag':
      return evaluateSupertagFilter(db, filter, candidateNodeIds)
    case 'property':
      return evaluatePropertyFilter(db, filter, candidateNodeIds)
    case 'content':
      return evaluateContentFilter(db, filter, candidateNodeIds)
    case 'relation':
      return evaluateRelationFilter(db, filter, candidateNodeIds)
    case 'temporal':
      return evaluateTemporalFilter(db, filter, candidateNodeIds)
    case 'hasField':
      return evaluateHasFieldFilter(db, filter, candidateNodeIds)
    case 'and':
    case 'or':
    case 'not':
      return evaluateLogicalFilter(db, filter, candidateNodeIds)
  }
}
```

---

## 5. Frontend Components

### 5.1 Query Builder Component

New file: `packages/nxus-core/src/components/features/query-builder/query-builder.tsx`

```typescript
interface QueryBuilderProps {
  value: QueryDefinition
  onChange: (definition: QueryDefinition) => void
  onExecute?: () => void
  compact?: boolean // For inline use in gallery
}

export function QueryBuilder({ value, onChange, onExecute, compact }: QueryBuilderProps) {
  // - Render list of filter chips
  // - Add filter button with dropdown of filter types
  // - Each filter has edit/remove controls
  // - Sort configuration
  // - Execute/Done buttons
}
```

### 5.2 Filter Editor Components

```
packages/nxus-core/src/components/features/query-builder/
├── query-builder.tsx           # Main container
├── filter-list.tsx             # List of filter chips
├── filter-chip.tsx             # Individual filter display/edit
├── filter-editor-modal.tsx     # Modal for editing complex filters
├── filters/
│   ├── supertag-filter.tsx     # Supertag selector
│   ├── property-filter.tsx     # Field + operator + value
│   ├── content-filter.tsx      # Text search input
│   ├── relation-filter.tsx     # Relationship type + target
│   ├── temporal-filter.tsx     # Date/days picker
│   └── logical-filter.tsx      # AND/OR/NOT group
├── sort-config.tsx             # Sort field + direction
└── query-linter.tsx            # Plain text representation of query
```

### 5.3 Query Results View

The existing gallery views (`GalleryView`, `TableView`, `GraphView`) can be reused. We need:

```typescript
// New hook: packages/nxus-core/src/hooks/use-query.ts
export function useQuery(definition: QueryDefinition) {
  return useQuery({
    queryKey: ['query', JSON.stringify(definition)],
    queryFn: () => evaluateQueryServerFn({ data: { definition } }),
    // Only refetch when definition changes
  })
}

// New hook for saved queries
export function useSavedQuery(queryId: string) {
  return useQuery({
    queryKey: ['saved-query', queryId],
    queryFn: () => executeSavedQueryServerFn({ data: { queryId } }),
  })
}
```

### 5.4 Saved Queries Sidebar

```typescript
// packages/nxus-core/src/components/features/query-builder/saved-queries-panel.tsx
export function SavedQueriesPanel() {
  // List saved queries
  // Click to execute
  // Edit/delete actions
  // Create new query button
}
```

---

## 6. Integration with Gallery

### 6.1 Modify `useAppRegistry` Hook

The gallery currently fetches all apps via `getAllAppsServerFn`. We'll:

1. Create a default "All Items" query definition
2. Use the query evaluation API instead of direct fetch
3. Keep backward compatibility

```typescript
// packages/nxus-core/src/hooks/use-app-registry.ts

// Default query for gallery: all nodes with supertag:item
const DEFAULT_GALLERY_QUERY: QueryDefinition = {
  filters: [
    { type: 'supertag', supertagSystemId: 'supertag:item', includeInherited: true }
  ],
  sort: { field: 'content', direction: 'asc' },
}

export function useAppRegistry(options: UseAppRegistryOptions = {}) {
  // Build query definition from options
  const queryDefinition = useMemo(() => {
    const filters: QueryFilter[] = [
      { type: 'supertag', supertagSystemId: 'supertag:item', includeInherited: true }
    ]

    if (options.searchQuery) {
      filters.push({ type: 'content', query: options.searchQuery })
    }

    if (options.filterType) {
      filters.push({
        type: 'property',
        fieldSystemId: 'field:type',
        op: 'eq',
        value: options.filterType
      })
    }

    // ... more filters

    return { filters }
  }, [options])

  // Use query API
  const { data, isLoading, error } = useQuery({
    queryKey: ['gallery-query', queryDefinition],
    queryFn: () => evaluateQueryServerFn({ data: { definition: queryDefinition } }),
  })

  // Transform AssembledNode[] to Item[] for backward compatibility
  const apps = useMemo(() => {
    if (!data?.nodes) return []
    return data.nodes.map(nodeToItem)
  }, [data])

  return { apps, loading: isLoading, error }
}
```

### 6.2 Add Query Builder to Gallery HUD

Modify `packages/nxus-core/src/components/features/gallery/hud/floating-hud.tsx`:

```typescript
// Add "Advanced Filter" button that opens query builder
<Button onClick={() => setQueryBuilderOpen(true)}>
  <FunnelIcon />
  Advanced
</Button>

{queryBuilderOpen && (
  <QueryBuilderPanel
    value={currentQuery}
    onChange={setCurrentQuery}
    onClose={() => setQueryBuilderOpen(false)}
  />
)}
```

---

## 7. Reactivity Strategy

### 7.1 Cache Invalidation Approach

Use TanStack Query's built-in cache invalidation:

```typescript
// When a node is created/updated/deleted, invalidate relevant queries
import { useQueryClient } from '@tanstack/react-query'

function useNodeMutation() {
  const queryClient = useQueryClient()

  const createNode = useMutation({
    mutationFn: createNodeServerFn,
    onSuccess: () => {
      // Invalidate all queries (simple approach)
      queryClient.invalidateQueries({ queryKey: ['query'] })
      queryClient.invalidateQueries({ queryKey: ['gallery-query'] })
      queryClient.invalidateQueries({ queryKey: ['saved-query'] })
    }
  })

  return { createNode }
}
```

### 7.2 Future: Granular Invalidation

For performance optimization (later phase):

```typescript
// Track which queries depend on which supertags/fields
// Only invalidate affected queries when mutations occur
// This matches the "Query Dependency Index" from the archived docs
```

---

## 8. Source Code Structure Changes

### New Files

```
packages/nxus-db/src/
├── types/
│   └── query.ts                     # Query definition types & schemas

packages/nxus-db/src/services/
└── query-evaluator.service.ts       # Query evaluation engine

packages/nxus-workbench/src/server/
└── query.server.ts                  # Query server functions

packages/nxus-core/src/
├── components/features/query-builder/
│   ├── index.ts
│   ├── query-builder.tsx
│   ├── filter-list.tsx
│   ├── filter-chip.tsx
│   ├── filter-editor-modal.tsx
│   ├── filters/
│   │   ├── index.ts
│   │   ├── supertag-filter.tsx
│   │   ├── property-filter.tsx
│   │   ├── content-filter.tsx
│   │   ├── relation-filter.tsx
│   │   ├── temporal-filter.tsx
│   │   └── logical-filter.tsx
│   ├── sort-config.tsx
│   ├── query-linter.tsx
│   └── saved-queries-panel.tsx
├── hooks/
│   └── use-query.ts                 # Query execution hooks
└── stores/
    └── query.store.ts               # Query builder state (Zustand)
```

### Modified Files

```
packages/nxus-db/src/schemas/node-schema.ts
  - Add SYSTEM_SUPERTAGS.QUERY
  - Add query-related SYSTEM_FIELDS

packages/nxus-db/src/index.ts
  - Export query types

packages/nxus-workbench/src/server/index.ts
  - Export query server functions

packages/nxus-core/src/hooks/use-app-registry.ts
  - Refactor to use query API (with backward compat)

packages/nxus-core/src/components/features/gallery/hud/floating-hud.tsx
  - Add query builder toggle

packages/nxus-core/src/routes/index.tsx
  - Integrate query builder panel
```

---

## 9. Verification Approach

### 9.1 Unit Tests

```bash
# Test query evaluation
pnpm --filter @nxus/db test -- --grep "query-evaluator"

# Test query types
pnpm --filter @nxus/db test -- --grep "query.ts"
```

### 9.2 Integration Tests

```bash
# Test server functions
pnpm --filter @nxus/workbench test -- --grep "query.server"
```

### 9.3 Manual Verification

1. **Query Builder UI**
   - Create a query with supertag filter
   - Add property filter
   - Add content search
   - Execute and verify results

2. **Gallery Integration**
   - Verify default gallery shows all items
   - Apply search filter
   - Apply type filter
   - Open advanced filter, add complex query
   - Verify results update correctly

3. **Saved Queries**
   - Create and save a query
   - Load saved query
   - Edit and re-save
   - Delete query

4. **Reactivity**
   - Create a new item while viewing query results
   - Verify results update without manual refresh

---

## 10. Implementation Phases

### Phase 1: Core Query Engine (Backend)
- Add query types to `@nxus/db`
- Implement `query-evaluator.service.ts`
- Add system supertag and fields
- Create server functions

### Phase 2: Basic Query Builder UI
- Filter list component
- Supertag filter
- Property filter
- Content filter
- Execute functionality

### Phase 3: Gallery Integration
- Refactor `useAppRegistry` to use query API
- Add query builder to gallery HUD
- Ensure backward compatibility

### Phase 4: Advanced Features
- Relation filters
- Temporal filters
- Logical operators (AND/OR/NOT)
- Saved queries panel
- Query linter

### Phase 5: Polish & Optimization
- UI/UX refinements
- Performance optimization
- Cache invalidation improvements
- Documentation

---

## 11. Design Decisions (Confirmed)

1. **Saved Queries Storage**: ✅ Store as nodes with `supertag:query` for consistency with "everything is a node" philosophy.

2. **Query Results Limit**: ✅ Default limit of 500. No hard max for now - will revisit if performance issues arise.

3. **Gallery Backward Compatibility**: Keep legacy as fallback, use feature flag for migration.

4. **Query Builder Location**: ✅ **New sidebar item** next to the graph view option. This gives queries first-class status in the UI navigation.

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query performance with large datasets | Medium | High | Add indexes, implement caching, use limits |
| Complex filter combinations causing bugs | Medium | Medium | Comprehensive unit tests, query linter |
| Breaking gallery functionality | Low | High | Feature flag, backward compatibility layer |
| UI complexity overwhelming users | Medium | Medium | Progressive disclosure, start with simple filters |

---

## Summary

This specification outlines a Tana-like reactive query system that:

1. **Stores queries as nodes** with a `supertag:query` for consistency
2. **Uses a flexible filter schema** supporting multiple filter types
3. **Provides a visual query builder** matching Tana's UX patterns
4. **Integrates with existing gallery** through a refactored `useAppRegistry`
5. **Uses TanStack Query** for reactivity via cache invalidation
6. **Serves as foundation** for future Tana mini-app with embedded queries

The implementation is phased to deliver value incrementally while maintaining stability.
