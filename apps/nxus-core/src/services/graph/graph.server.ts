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
  updateNode,
} from './graph.service'
import type { GraphNode } from './graph.service'
import {
  BaseItemSchema,
  ConfigSchemaSchema,
  DocEntrySchema,
  InstallConfigSchema,
  ItemCommandSchema,
  ItemSchema,
  ItemTypeSchema,
  JsonObjectSchema,
  PlatformSchema,
  TagRefSchema,
  type Item,
  type JsonObject,
  type TagRef,
} from '@nxus/db'

// ============================================================================
// Serializable types for server functions
// ============================================================================

interface SerializableGraphNode {
  id: string
  content?: string
  content_plain?: string
  system_id?: string
  props?: JsonObject
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
    props: JsonObjectSchema.optional().parse(node.props),
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
const GraphPropsSchema = z.record(z.string(), z.unknown())
const UpdateItemMetadataSchema = z.object({
  tags: z.array(TagRefSchema).optional(),
  category: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})

const UpdateItemSchema = BaseItemSchema.omit({ metadata: true })
  .partial()
  .extend({
    metadata: UpdateItemMetadataSchema.optional(),
  })

function readGraphProp<T>(
  props: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T>,
): T | undefined {
  const parsed = schema.safeParse(props[key])
  return parsed.success ? parsed.data : undefined
}

function getGraphItemTypes(props: Record<string, unknown>): Item['types'] {
  const storedTypes = readGraphProp(props, 'types', z.array(ItemTypeSchema).min(1))
  if (storedTypes) {
    return storedTypes
  }

  return [readGraphProp(props, 'type', ItemTypeSchema) ?? 'html']
}

function graphNodeToItem(node: GraphNode, tags: Array<TagRef> = []): Item {
  const props = GraphPropsSchema.parse(node.props ?? {})
  const types = getGraphItemTypes(props)

  return ItemSchema.parse({
    id: readGraphProp(props, 'item_id', z.string()) ?? String(node.id),
    name: node.content || '',
    description: readGraphProp(props, 'description', z.string()) ?? '',
    types,
    type: types[0],
    path: readGraphProp(props, 'path', z.string()) ?? '',
    homepage: readGraphProp(props, 'homepage', z.string().url()),
    thumbnail: readGraphProp(props, 'thumbnail', z.string()),
    docs: readGraphProp(props, 'docs', z.array(DocEntrySchema)),
    dependencies: readGraphProp(props, 'dependencies', z.array(z.string())),
    metadata: {
      tags,
      category: readGraphProp(props, 'category', z.string()) ?? 'uncategorized',
      createdAt: node.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: node.updated_at?.toISOString() || new Date().toISOString(),
      version: readGraphProp(props, 'version', z.string()),
      author: readGraphProp(props, 'author', z.string()),
      license: readGraphProp(props, 'license', z.string()),
    },
    installConfig: readGraphProp(props, 'installConfig', InstallConfigSchema),
    status: 'not-installed' as const,
    commands: readGraphProp(props, 'commands', z.array(ItemCommandSchema)),
    checkCommand: readGraphProp(props, 'checkCommand', z.string()),
    platform: readGraphProp(props, 'platform', z.array(PlatformSchema)),
    installInstructions: readGraphProp(props, 'installInstructions', z.string()),
    configSchema: readGraphProp(props, 'configSchema', ConfigSchemaSchema),
    startCommand: readGraphProp(props, 'startCommand', z.string()),
    buildCommand: readGraphProp(props, 'buildCommand', z.string()),
    clonePath: readGraphProp(props, 'clonePath', z.string()),
    branch: readGraphProp(props, 'branch', z.string()),
  })
}

function describeGraphItemNode(node: GraphNode): string {
  return node.system_id ?? String(node.id)
}

function formatInvalidGraphItemError(node: GraphNode, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `[Graph] Invalid item ${describeGraphItemNode(node)}: ${message}`
}

function omitUndefinedValues<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>
}

/**
 * Convert an Item to graph node properties
 */
function itemToGraphProps(item: Partial<Item>): Record<string, unknown> {
  const props: Record<string, unknown> = {
    item_id: item.id,
    description: item.description,
    type: item.type ?? item.types?.[0],
    types: item.types,
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

  if (item.types?.includes('tool')) {
    props.checkCommand = item.checkCommand
    props.platform = item.platform
    props.installInstructions = item.installInstructions
    props.configSchema = item.configSchema
  }
  if (item.types?.includes('typescript')) {
    props.startCommand = item.startCommand
    props.buildCommand = item.buildCommand
  }
  if (item.types?.includes('remote-repo')) {
    props.clonePath = item.clonePath
    props.branch = item.branch
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
      try {
        const tags = await getItemTags(node)
        items.push(graphNodeToItem(node, tags))
      } catch (error) {
        console.warn(formatInvalidGraphItemError(node, error))
      }
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

      try {
        const tags = await getItemTags(node)
        return { success: true as const, item: graphNodeToItem(node, tags) }
      } catch (error) {
        return {
          success: false as const,
          error: formatInvalidGraphItemError(node, error),
        }
      }
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
      item: ItemSchema,
    }),
  )
  .handler(async (ctx) => {
    try {
      const { item } = ctx.data

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
      updates: UpdateItemSchema,
    }),
  )
  .handler(async (ctx) => {
    try {
      const node = await getNodeBySystemId(`item:${ctx.data.id}`)

      if (!node) {
        return { success: false as const, error: 'Item not found' }
      }

      let currentItem: Item
      try {
        currentItem = graphNodeToItem(node, await getItemTags(node))
      } catch (error) {
        return {
          success: false as const,
          error: formatInvalidGraphItemError(node, error),
        }
      }
      const sanitizedUpdates = omitUndefinedValues(ctx.data.updates)
      const metadataUpdates = sanitizedUpdates.metadata
        ? omitUndefinedValues(sanitizedUpdates.metadata)
        : undefined
      const mergedTypes = sanitizedUpdates.types ?? currentItem.types
      const mergedItem = ItemSchema.parse({
        ...currentItem,
        ...sanitizedUpdates,
        types: mergedTypes,
        type: sanitizedUpdates.type ?? mergedTypes[0],
        metadata: metadataUpdates
          ? {
              ...currentItem.metadata,
              ...metadataUpdates,
              tags: metadataUpdates.tags ?? currentItem.metadata.tags,
            }
          : currentItem.metadata,
      })

      await updateNode(node.id, {
        content: mergedItem.name,
        props: itemToGraphProps(mergedItem),
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
          ...itemNode.props,
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
