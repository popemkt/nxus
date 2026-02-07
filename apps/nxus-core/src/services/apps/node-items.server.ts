/**
 * node-items.server.ts - Node-based item queries for nxus-core
 *
 * These functions query items from the node architecture using @nxus/db
 * and convert them to legacy Item types. Previously lived in @nxus/workbench/server,
 * moved here to decouple nxus-core from the workbench package.
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  AssembledNode,
  DocEntry,
  Item,
  ItemCommand,
  ItemMetadata,
  ScriptCommand,
  TagRef,
} from '@nxus/db'

// ============================================================================
// Property Helpers (pure functions operating on AssembledNode)
// ============================================================================

function getProperty<T = unknown>(
  node: AssembledNode,
  fieldName: string,
): T | undefined {
  const props = node.properties[fieldName]
  if (!props || props.length === 0) return undefined
  return props[0].value as T
}

function getPropertyValues<T = unknown>(
  node: AssembledNode,
  fieldName: string,
): Array<T> {
  const props = node.properties[fieldName]
  if (!props) return []
  return props.sort((a, b) => a.order - b.order).map((p) => p.value as T)
}

// ============================================================================
// Node -> Legacy Type Adapters
// ============================================================================

export function nodeToItem(
  node: AssembledNode,
  options?: {
    resolveTagRefs?: (tagNodeIds: Array<string>) => Array<TagRef>
    resolveCommands?: (itemNodeId: string) => Array<ItemCommand>
    resolveDependencies?: (depNodeIds: Array<string>) => Array<string>
  },
): Item {
  const types: Array<Item['type']> = []
  for (const st of node.supertags) {
    if (st.systemId === 'supertag:tool') types.push('tool')
    else if (st.systemId === 'supertag:repo') types.push('remote-repo')
    else if (st.systemId === 'supertag:typescript') types.push('typescript')
    else if (st.systemId === 'supertag:html') types.push('html')
    // Generic #Item supertag defaults to 'html' since ItemType has no 'item' variant
    else if (st.systemId === 'supertag:item') types.push('html')
  }
  if (types.length === 0) types.push('tool')
  const type = types[0]

  const tagNodeIds = getPropertyValues<string>(node, 'tags')
  const tagRefs = options?.resolveTagRefs?.(tagNodeIds) ?? []
  const commands = options?.resolveCommands?.(node.id) ?? []
  const depNodeIds = getPropertyValues<string>(node, 'dependencies')
  const dependencies = options?.resolveDependencies?.(depNodeIds) ?? []

  const metadata: ItemMetadata = {
    tags: tagRefs,
    category: getProperty<string>(node, 'category') || 'uncategorized',
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }

  return {
    id:
      getProperty<string>(node, 'legacyId') ||
      node.systemId?.replace('item:', '') ||
      node.id,
    name: node.content || '',
    description: getProperty<string>(node, 'description') || '',
    types,
    type,
    path: getProperty<string>(node, 'path') || '',
    homepage: getProperty<string>(node, 'homepage'),
    thumbnail: undefined,
    platform: getProperty<Array<string>>(node, 'platform'),
    docs: getProperty<Array<DocEntry>>(node, 'docs'),
    dependencies,
    metadata,
    installConfig: undefined,
    checkCommand: getProperty<string>(node, 'checkCommand'),
    installInstructions: getProperty<string>(node, 'installInstructions'),
    configSchema: undefined,
    status: 'not-installed',
    commands,
  } as Item
}

export function nodeToCommand(node: AssembledNode): ItemCommand {
  const mode =
    (getProperty<string>(node, 'mode') as ItemCommand['mode']) || 'execute'

  const baseCommand = {
    id: getProperty<string>(node, 'commandId') || node.id,
    name: node.content || '',
    description: getProperty<string>(node, 'description'),
    icon: getProperty<string>(node, 'icon') || 'terminal',
    category: getProperty<string>(node, 'category') || 'general',
    target:
      (getProperty<string>(node, 'target') as ItemCommand['target']) || 'item',
    mode,
    platforms: getProperty<Array<'linux' | 'macos' | 'windows'>>(
      node,
      'platforms',
    ),
    requires: getProperty<Record<string, unknown>>(node, 'requires'),
  }

  if (mode === 'workflow') {
    return {
      ...baseCommand,
      workflow: getProperty<any>(node, 'workflow'),
    } as ItemCommand
  }

  return {
    ...baseCommand,
    command: getProperty<string>(node, 'command') || '',
    scriptSource: getProperty<string>(
      node,
      'scriptSource',
    ) as ScriptCommand['scriptSource'],
    cwd: getProperty<string>(node, 'cwd'),
    options: getProperty<Record<string, unknown>>(node, 'options'),
  } as ItemCommand
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all items from node system (returns legacy Item type)
 *
 * Includes #Tool and #Repo via inheritance from #Item.
 */
export const getAllItemsFromNodesServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const {
    initDatabaseWithBootstrap,
    getNodesBySupertagWithInheritance,
    getProperty: dbGetProperty,
    SYSTEM_SUPERTAGS,
  } = await import('@nxus/db/server')

  const db = await initDatabaseWithBootstrap()

  const itemNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)

  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  const tagLookup = new Map<string, TagRef>()
  for (const tagNode of tagNodes) {
    const legacyId = dbGetProperty<number>(tagNode, 'legacyId')
    tagLookup.set(tagNode.id, {
      id: legacyId || 0,
      name: tagNode.content || '',
    })
  }

  const itemLookup = new Map<string, string>()
  for (const itemNode of itemNodes) {
    const legacyId =
      dbGetProperty<string>(itemNode, 'legacyId') ||
      itemNode.systemId?.replace('item:', '') ||
      itemNode.id
    itemLookup.set(itemNode.id, legacyId)
  }

  const commandNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )
  const commandsByItemId = new Map<string, Array<ItemCommand>>()

  for (const cmdNode of commandNodes) {
    const parentId = cmdNode.ownerId
    if (parentId) {
      const cmds = commandsByItemId.get(parentId) ?? []
      cmds.push(nodeToCommand(cmdNode))
      commandsByItemId.set(parentId, cmds)
    }
  }

  const items: Array<Item> = itemNodes.map((node: AssembledNode) =>
    nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: (itemId) => commandsByItemId.get(itemId) ?? [],
      resolveDependencies: (depNodeIds) =>
        depNodeIds
          .map((id) => itemLookup.get(id))
          .filter((id): id is string => !!id),
    }),
  )

  return { success: true as const, items }
})

/**
 * Get a single item by legacy ID from node system
 */
export const getItemByIdFromNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const {
      initDatabase,
      getDatabase,
      findNodeBySystemId,
      assembleNode,
      getNodesBySupertagWithInheritance,
      getProperty: dbGetProperty,
      nodes,
      nodeProperties,
      eq,
      SYSTEM_SUPERTAGS,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { id } = ctx.data
    initDatabase()
    const db = getDatabase()

    let node = findNodeBySystemId(db, `item:${id}`)

    if (!node) {
      const legacyIdField = db
        .select()
        .from(nodes)
        .where(eq(nodes.systemId, SYSTEM_FIELDS.LEGACY_ID))
        .get()

      if (legacyIdField) {
        const prop = db
          .select()
          .from(nodeProperties)
          .where(eq(nodeProperties.fieldNodeId, legacyIdField.id))
          .all()
          .find((p: { value: string | null }) => {
            try {
              return JSON.parse(p.value || '') === id
            } catch {
              return false
            }
          })

        if (prop) {
          node = assembleNode(db, prop.nodeId)
        }
      }
    }

    if (!node) {
      return { success: false as const, error: `Item ${id} not found` }
    }

    const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
    const tagLookup = new Map<string, TagRef>()
    for (const tagNode of tagNodes) {
      const legacyId = dbGetProperty<number>(tagNode, 'legacyId')
      tagLookup.set(tagNode.id, {
        id: legacyId || 0,
        name: tagNode.content || '',
      })
    }

    const allItemNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.ITEM,
    )
    const itemLookup = new Map<string, string>()
    for (const itemNode of allItemNodes) {
      const legacyId =
        dbGetProperty<string>(itemNode, 'legacyId') ||
        itemNode.systemId?.replace('item:', '') ||
        itemNode.id
      itemLookup.set(itemNode.id, legacyId)
    }

    const commandNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.COMMAND,
    )
    const commands = commandNodes
      .filter((cmd: AssembledNode) => cmd.ownerId === node!.id)
      .map(nodeToCommand)

    const item = nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: () => commands,
      resolveDependencies: (depNodeIds) =>
        depNodeIds
          .map((id) => itemLookup.get(id))
          .filter((id): id is string => !!id),
    })

    return { success: true as const, item }
  })
