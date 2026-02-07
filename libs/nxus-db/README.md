# @nxus/db

Database layer for Nxus mini-apps. Provides schemas, types, and database operations for the node-based architecture.

## Installation

```bash
pnpm add @nxus/db
```

## Usage

### Client-side (Types Only)

For browser/client code, import from the main entry point:

```typescript
import type { AssembledNode, PropertyValue, Item, Tag, ItemCommand } from '@nxus/db'
```

This entry point only exports TypeScript types and Zod schemas - no Node.js dependencies.

### Server-side (Full Database Access)

For server-side code (e.g., `*.server.ts` files), import from `/server`:

```typescript
import {
  initDatabase,
  getDatabase,
  createNode,
  findNode,
  setProperty,
  getNodesBySupertagWithInheritance,
  SYSTEM_SUPERTAGS,
  SYSTEM_FIELDS,
} from '@nxus/db/server'
```

## API Reference

### Database Initialization

```typescript
// Initialize the master database
initDatabase()

// Get the database instance
const db = getDatabase()

// Initialize ephemeral (local-only) database
initEphemeralDatabase()
const ephDb = getEphemeralDatabase()
```

### Node Operations

#### Creating Nodes

```typescript
// Create a basic node
const nodeId = createNode(db, { content: 'My Node' })

// Create a node with a system ID
const nodeId = createNode(db, {
  content: 'My Tool',
  systemId: 'item:my-tool',
})

// Create a node with a supertag
const nodeId = createNode(db, {
  content: 'New Item',
  supertagSystemId: SYSTEM_SUPERTAGS.ITEM,
})
```

#### Finding Nodes

```typescript
// Find by UUID
const node = findNodeById(db, nodeId)

// Find by system ID
const node = findNodeBySystemId(db, 'item:my-tool')

// Find by either (tries systemId first)
const node = findNode(db, identifier)
```

#### Updating Nodes

```typescript
// Update content
updateNodeContent(db, nodeId, 'Updated Content')

// Set a property
setProperty(db, nodeId, 'field:path', '/usr/bin/tool')

// Add to a multi-value property
addPropertyValue(db, nodeId, 'field:tags', tagNodeId)

// Clear a property
clearProperty(db, nodeId, 'field:tags')

// Soft delete
deleteNode(db, nodeId)
```

#### Querying Nodes

```typescript
// Get all nodes with a supertag (including inherited supertags)
const items = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)

// Get just the IDs
const nodeIds = getNodeIdsBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
```

### Property Helpers

```typescript
// Get a single property value
const path = getProperty<string>(node, 'path')

// Get all values for a multi-value property
const tags = getPropertyValues<string>(node, 'tags')
```

### System Constants

```typescript
// System supertags
SYSTEM_SUPERTAGS.ITEM      // 'supertag:item'
SYSTEM_SUPERTAGS.COMMAND   // 'supertag:command'
SYSTEM_SUPERTAGS.TAG       // 'supertag:tag'

// System fields
SYSTEM_FIELDS.SUPERTAG     // 'field:supertag'
SYSTEM_FIELDS.EXTENDS      // 'field:extends'
SYSTEM_FIELDS.FIELD_TYPE   // 'field:fieldType'
```

## Types

### AssembledNode

The main type for working with nodes:

```typescript
interface AssembledNode {
  id: string
  content: string | null
  systemId: string | null
  ownerId: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  properties: Record<string, PropertyValue[]>
  supertags: { id: string; content: string; systemId: string | null }[]
}
```

### PropertyValue

Represents a single property value:

```typescript
interface PropertyValue {
  value: unknown
  rawValue: string
  fieldNodeId: string
  fieldName: string
  fieldSystemId: string | null
  order: number
}
```

## Example

See `examples/mini-app-example.ts` for a complete example of how to use this package in a mini-app.

```bash
npx tsx examples/mini-app-example.ts
```

## Reactive Query System

The reactive module provides live query subscriptions, computed fields (aggregations), and automations that execute when data changes.

### Event Bus

All mutations emit events through a central event bus:

```typescript
import { eventBus, type MutationEvent } from '@nxus/db/server'

// Subscribe to all mutation events
const unsubscribe = eventBus.subscribe((event: MutationEvent) => {
  console.log(`${event.type} on node ${event.nodeId}`)
})

// Subscribe with filters
eventBus.subscribe(
  (event) => console.log('Property changed:', event.fieldSystemId),
  { types: ['property:set'], fieldSystemIds: ['field:status'] }
)

// Don't forget to unsubscribe
unsubscribe()
```

### Query Subscriptions

Subscribe to live queries and receive notifications when results change:

```typescript
import { querySubscriptionService } from '@nxus/db/server'

const handle = querySubscriptionService.subscribe(
  db,
  {
    filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
    limit: 100,
  },
  (event) => {
    console.log('Added:', event.added.length)
    console.log('Removed:', event.removed.length)
    console.log('Changed:', event.changed.length)
  }
)

// Get current results synchronously
const currentResults = handle.getLastResults()

// Unsubscribe when done
handle.unsubscribe()
```

### Computed Fields

Create aggregations that update automatically when underlying data changes:

```typescript
import { computedFieldService } from '@nxus/db/server'

// Create a computed field that sums subscription prices
const fieldId = computedFieldService.create(db, {
  name: 'Total Monthly Expense',
  definition: {
    aggregation: 'SUM', // or COUNT, AVG, MIN, MAX
    query: {
      filters: [{ type: 'supertag', supertagSystemId: 'supertag:subscription' }],
    },
    fieldSystemId: 'field:monthly_price',
  },
})

// Get current value
const total = computedFieldService.getValue(db, fieldId)

// Subscribe to value changes
computedFieldService.onValueChange(fieldId, (event) => {
  console.log(`Total changed: ${event.previousValue} → ${event.newValue}`)
})
```

### Automations

Create rules that execute actions when conditions are met:

```typescript
import { automationService } from '@nxus/db/server'

// Query membership automation: set completedAt when task becomes done
const automationId = automationService.create(db, {
  name: 'Auto-set completion timestamp',
  trigger: {
    type: 'query_membership',
    queryDefinition: {
      filters: [
        { type: 'supertag', supertagSystemId: 'supertag:task' },
        { type: 'property', fieldSystemId: 'field:status', operator: 'eq', value: 'done' },
      ],
    },
    event: 'onEnter', // or 'onExit', 'onChange'
  },
  action: {
    type: 'set_property',
    fieldSystemId: 'field:completed_at',
    value: { $now: true }, // Special marker for current timestamp
  },
  enabled: true,
})

// Threshold automation: webhook when computed field crosses threshold
automationService.create(db, {
  name: 'Budget Alert',
  trigger: {
    type: 'threshold',
    computedFieldId: totalExpenseFieldId,
    condition: { operator: 'gt', value: 100 },
    fireOnce: true, // Only fire once per crossing
  },
  action: {
    type: 'webhook',
    url: 'https://api.example.com/alert',
    method: 'POST',
    body: { message: 'Budget exceeded: {{ computedField.value }}' },
  },
  enabled: true,
})
```

### Performance Optimization

The reactive system includes smart invalidation and batching for efficiency:

```typescript
import { querySubscriptionService, reactiveMetrics } from '@nxus/db/server'

// Enable debouncing for rapid mutations (default: 0ms = immediate)
querySubscriptionService.setDebounceMs(50) // Batch mutations within 50ms

// View performance metrics
const metrics = reactiveMetrics.getMetrics()
console.log(`Events: ${metrics.eventCount}`)
console.log(`Evaluations: ${metrics.evaluationCount}`)
console.log(`Skipped (smart invalidation): ${metrics.skippedEvaluations}`)
console.log(`Active subscriptions: ${metrics.activeSubscriptions}`)
```

### Reactive Types

Import types for client-side use:

```typescript
import type {
  MutationEvent,
  QueryResultChangeEvent,
  ComputedFieldDefinition,
  AutomationDefinition,
  AutomationAction,
} from '@nxus/db'
```

## Testing

```bash
pnpm test
```
