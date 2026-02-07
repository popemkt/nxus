/**
 * graph.server.ts - Server functions for graph-based architecture
 *
 * Provides server-side API for items, tags, and commands using SurrealDB.
 * Drop-in replacement for node-based and table-based queries.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  
  addRelation,
  componentsRec,
  createNode,
  getNodeBySystemId,
  getNodesBySupertag,
  removeRelation,
  searchNodes,
  updateNode
} from './graph.service'
import type {GraphNode} from './graph.service';
import type { Item, ItemCommand, ItemMetadata, TagRef } from '@nxus/db'

// ============================================================================
// Serializable types for server functions
// ============================================================================

interface SerializableGraphNode {
  id: string
  content?: string
  content_plain?: string
  system_id?: string
  props?: Record<string, {}>
  created_at: string
  updated_at: string
  deleted_at?: string
}

function serializeGraphNode(node: GraphNode): SerializableGraphNode {
  return {
    id: String(node.id),
    content: node.content,
    content_plain: node.content_plain,
    system_id: node.system_id,
    props: node.props as Record<string, {}> | undefined,
    created_at: node.created_at?.toISOString() || new Date().toISOString(),
    updated_at: node.updated_at?.toISOString() || new Date().toISOString(),
    deleted_at: node.deleted_at?.toISOString(),
  }
}

// ============================================================================
// Type Converters
// ============================================================================

/**
 * Convert a graph node to an Item
 * Now supports multi-type items via the types array
 */
function graphNodeToItem(node: GraphNode, tags: Array<TagRef> = []): Item {
  const props = node.props || {}
  // Support both single type and types array from graph
  const storedTypes = props.types as Array<string> | undefined
  const singleType = (props.type as string) || 'html'
  const types = (
    storedTypes && storedTypes.length > 0 ? storedTypes : [singleType]
  ) as Array<Item['type']>
  const itemType = types[0] // First type for type-specific fields

  const metadata: ItemMetadata = {
    tags,
    category: (props.category as string) || 'uncategorized',
    createdAt: node.created_at?.toISOString() || '',
    updatedAt: node.updated_at?.toISOString() || '',
    version: props.version as string | undefined,
    author: props.author as string | undefined,
    license: props.license as string | undefined,
  }

  // Base item properties with multi-type support
  const baseItem = {
    id: (props.item_id as string) || String(node.id),
    name: node.content || '',
    description: (props.description as string) || '',
    types, // Multi-type support
    type: types[0], // Deprecated, equals types[0]
    path: (props.path as string) || '',
    homepage: props.homepage as string | undefined,
    thumbnail: props.thumbnail as string | undefined,
    docs: props.docs as Item['docs'],
    dependencies: props.dependencies as Array<string> | undefined,
    metadata,
    installConfig: props.installConfig as Item['installConfig'],
    status: 'not-installed' as const,
    commands: (props.commands as Array<ItemCommand>) || [],
  }

  // Add type-specific fields based on ALL types in the array
  const result: any = { ...baseItem }

  if (types.includes('tool')) {
    result.checkCommand = (props.checkCommand as string) || ''
    result.platform =
      (props.platform as Array<'windows' | 'linux' | 'macos'>) || []
    result.installInstructions = props.installInstructions as string | undefined
    result.configSchema = props.configSchema as
      | {
          fields: Array<{
            key: string
            label: string
            type: 'text' | 'password' | 'url'
            required: boolean
            defaultValue?: string
            placeholder?: string
          }>
        }
      | undefined
  }

  if (types.includes('typescript')) {
    result.startCommand = props.startCommand as string | undefined
    result.buildCommand = props.buildCommand as string | undefined
  }

  if (types.includes('remote-repo')) {
    result.clonePath = props.clonePath as string | undefined
    result.branch = props.branch as string | undefined
  }

  return result as Item
}

/**
 * Convert an Item to graph node properties
 */
function itemToGraphProps(item: Partial<Item>): Record<string, unknown> {
  const props: Record<string, unknown> = {
    item_id: item.id,
    description: item.description,
    type: item.type,
    path: item.path,
    homepage: item.homepage,
    thumbnail: item.thumbnail,
    docs: item.docs,
    dependencies: item.dependencies,
    category: item.metadata?.category,
    version: item.metadata?.version,
    author: item.metadata?.author,
    license: item.metadata?.license,
    installConfig: item.installConfig,
    commands: item.commands,
  }

  // Type-specific properties using type assertion
  // For multi-type items, include properties from ALL applicable types
  const anyItem = item as Record<string, unknown>
  if (item.types?.includes('tool')) {
    props.checkCommand = anyItem.checkCommand
    props.platform = anyItem.platform
    props.installInstructions = anyItem.installInstructions
    props.configSchema = anyItem.configSchema
  }
  if (item.types?.includes('typescript')) {
    props.startCommand = anyItem.startCommand
    props.buildCommand = anyItem.buildCommand
  }
  if (item.types?.includes('remote-repo')) {
    props.clonePath = anyItem.clonePath
    props.branch = anyItem.branch
  }

  return props
}

// ============================================================================
// Item Server Functions
// ============================================================================

/**
 * Get all items from graph database
 */
export const getAllItemsFromGraphServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    console.log('[Graph] Getting all items')

    // Get all nodes with #Item supertag
    const itemNodes = await getNodesBySupertag('supertag:item')

    // Convert to Item format
    const items: Array<Item> = []

    for (const node of itemNodes) {
      // Get tags for this item
      const tags = await getItemTags(node)
      items.push(graphNodeToItem(node, tags))
    }

    console.log('[Graph] Found', items.length, 'items')
    return { success: true as const, items }
  } catch (error) {
    console.error('[Graph] Error getting items:', error)
    return { success: false as const, error: String(error) }
  }
})

/**
 * Get a single item by ID
 */
export const getItemFromGraphServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    try {
      const node = await getNodeBySystemId(`item:${ctx.data.id}`)

      if (!node) {
        return { success: false as const, error: 'Item not found' }
      }

      const tags = await getItemTags(node)
      return { success: true as const, item: graphNodeToItem(node, tags) }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Create a new item
 */
export const createItemInGraphServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      item: z.any(), // Item type
    }),
  )
  .handler(async (ctx) => {
    try {
      const item = ctx.data.item as Item

      const node = await createNode({
        content: item.name,
        system_id: `item:${item.id}`,
        props: itemToGraphProps(item),
        supertag: 'supertag:item',
      })

      // Add tag relations
      if (item.metadata?.tags) {
        for (const tag of item.metadata.tags) {
          const tagNode = await getNodeBySystemId(`tag:${tag.id}`)
          if (tagNode) {
            await addRelation('tagged_with', node.id, tagNode.id)
          }
        }
      }

      return { success: true as const, id: String(node.id) }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Update an item
 */
export const updateItemInGraphServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
      updates: z.any(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const node = await getNodeBySystemId(`item:${ctx.data.id}`)

      if (!node) {
        return { success: false as const, error: 'Item not found' }
      }

      const updates = ctx.data.updates as Partial<Item>
      const newProps = {
        ...(node.props || {}),
        ...itemToGraphProps(updates),
      }

      await updateNode(node.id, {
        content: updates.name || node.content,
        props: newProps,
      })

      return { success: true as const }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

// ============================================================================
// Tag Server Functions
// ============================================================================

/**
 * Get all tags from graph database
 */
export const getAllTagsFromGraphServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const tagNodes = await getNodesBySupertag('supertag:tag')

    const tags = tagNodes.map((node) => ({
      id: (node.props?.legacy_id as number) || 0,
      name: node.content || '',
      parentId: (node.props?.parent_id as number) || null,
      order: (node.props?.order as number) || 0,
      color: (node.props?.color as string) || null,
      icon: (node.props?.icon as string) || null,
      createdAt: node.created_at,
      updatedAt: node.updated_at,
    }))

    return { success: true as const, data: tags }
  } catch (error) {
    return { success: false as const, error: String(error) }
  }
})

/**
 * Create a new tag
 */
export const createTagInGraphServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string(),
      parentId: z.number().nullable().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const node = await createNode({
        content: ctx.data.name,
        system_id: `tag:${ctx.data.name.toLowerCase().replace(/\s+/g, '-')}`,
        props: {
          color: ctx.data.color,
          icon: ctx.data.icon,
          parent_id: ctx.data.parentId,
        },
        supertag: 'supertag:tag',
      })

      // If has parent, create part_of relation
      if (ctx.data.parentId) {
        const parentNode = await getNodeBySystemId(`tag:${ctx.data.parentId}`)
        if (parentNode) {
          await addRelation('part_of', node.id, parentNode.id)
        }
      }

      return { success: true as const, nodeId: String(node.id) }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Update item tags
 */
export const updateItemTagsInGraphServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      tags: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  )
  .handler(async (ctx) => {
    try {
      const itemNode = await getNodeBySystemId(`item:${ctx.data.appId}`)

      if (!itemNode) {
        return { success: false as const, error: 'Item not found' }
      }

      // Remove existing tag relations (we'd need to query them first)
      // For simplicity, we'll just add new ones
      // In production, implement proper relation management

      for (const tag of ctx.data.tags) {
        const tagNode = await getNodeBySystemId(
          `tag:${tag.name.toLowerCase().replace(/\s+/g, '-')}`,
        )
        if (tagNode) {
          await addRelation('tagged_with', itemNode.id, tagNode.id)
        }
      }

      return { success: true as const, data: { tags: ctx.data.tags } }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Update item category
 */
export const updateItemCategoryInGraphServerFn = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      appId: z.string(),
      category: z.string(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const itemNode = await getNodeBySystemId(`item:${ctx.data.appId}`)

      if (!itemNode) {
        return { success: false as const, error: 'Item not found' }
      }

      await updateNode(itemNode.id, {
        props: {
          ...(itemNode.props || {}),
          category: ctx.data.category,
        },
      })

      return { success: true as const }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

// ============================================================================
// Semantic Relation Server Functions
// ============================================================================

/**
 * Get components of a node recursively (COMPONENTS REC)
 */
export const getComponentsRecServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ nodeId: z.string(), maxDepth: z.number().optional() }),
  )
  .handler(async (ctx) => {
    try {
      const components = await componentsRec(ctx.data.nodeId, ctx.data.maxDepth)
      // Serialize for transport
      return {
        success: true as const,
        components: components.map(serializeGraphNode),
      }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Add a semantic relation between nodes
 */
export const addSemanticRelationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      type: z.enum(['part_of', 'dependency_of', 'references', 'tagged_with']),
      fromId: z.string(),
      toId: z.string(),
      order: z.number().optional(),
    }),
  )
  .handler(async (ctx) => {
    try {
      await addRelation(ctx.data.type, ctx.data.fromId, ctx.data.toId, {
        order: ctx.data.order,
      })
      return { success: true as const }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Remove a semantic relation
 */
export const removeSemanticRelationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      type: z.enum(['part_of', 'dependency_of', 'references', 'tagged_with']),
      fromId: z.string(),
      toId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    try {
      await removeRelation(ctx.data.type, ctx.data.fromId, ctx.data.toId)
      return { success: true as const }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

/**
 * Search nodes
 */
export const searchNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string() }))
  .handler(async (ctx) => {
    try {
      const nodes = await searchNodes(ctx.data.query)
      // Serialize for transport
      return { success: true as const, nodes: nodes.map(serializeGraphNode) }
    } catch (error) {
      return { success: false as const, error: String(error) }
    }
  })

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get tags for an item node
 */
async function getItemTags(node: GraphNode): Promise<Array<TagRef>> {
  // This would query the tagged_with relations
  // For now, return from props if stored there
  const tagRefs = (node.props?.tag_refs as Array<TagRef>) || []
  return tagRefs
}
