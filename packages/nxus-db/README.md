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

## Testing

```bash
pnpm test
```
