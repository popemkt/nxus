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
import { FIELD_NAMES } from '@nxus/db'
import type {
  AssembledNode,
  DocEntry,
  FieldContentName,
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
  fieldName: FieldContentName,
): T | undefined {
  const props = node.properties[fieldName]
  if (!props || props.length === 0) return undefined
  return props[0].value as T
}

function getPropertyValues<T = unknown>(
  node: AssembledNode,
  fieldName: FieldContentName,
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

  const tagNodeIds = getPropertyValues<string>(node, FIELD_NAMES.TAGS)
  const tagRefs = options?.resolveTagRefs?.(tagNodeIds) ?? []
  const commands = options?.resolveCommands?.(node.id) ?? []
  const depNodeIds = getPropertyValues<string>(node, FIELD_NAMES.DEPENDENCIES)
  const dependencies = options?.resolveDependencies?.(depNodeIds) ?? []

  const metadata: ItemMetadata = {
    tags: tagRefs,
    category: getProperty<string>(node, FIELD_NAMES.CATEGORY) || 'uncategorized',
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }

  return {
    id:
      getProperty<string>(node, FIELD_NAMES.LEGACY_ID) ||
      node.systemId?.replace('item:', '') ||
      node.id,
    name: node.content || '',
    description: getProperty<string>(node, FIELD_NAMES.DESCRIPTION) || '',
    types,
    type,
    path: getProperty<string>(node, FIELD_NAMES.PATH) || '',
    homepage: getProperty<string>(node, FIELD_NAMES.HOMEPAGE),
    thumbnail: undefined,
    platform: getProperty<Array<string>>(node, FIELD_NAMES.PLATFORM),
    docs: getProperty<Array<DocEntry>>(node, FIELD_NAMES.DOCS),
    dependencies,
    metadata,
    installConfig: undefined,
    checkCommand: getProperty<string>(node, FIELD_NAMES.CHECK_COMMAND),
    installInstructions: getProperty<string>(node, FIELD_NAMES.INSTALL_INSTRUCTIONS),
    configSchema: undefined,
    status: 'not-installed',
    commands,
  } as Item
}

export function nodeToCommand(node: AssembledNode): ItemCommand {
  const mode =
    (getProperty<string>(node, FIELD_NAMES.MODE) as ItemCommand['mode']) || 'execute'

  const baseCommand = {
    id: getProperty<string>(node, FIELD_NAMES.COMMAND_ID) || node.id,
    name: node.content || '',
    description: getProperty<string>(node, FIELD_NAMES.DESCRIPTION),
    icon: getProperty<string>(node, FIELD_NAMES.ICON) || 'terminal',
    category: getProperty<string>(node, FIELD_NAMES.CATEGORY) || 'general',
    target:
      (getProperty<string>(node, FIELD_NAMES.TARGET) as ItemCommand['target']) || 'item',
    mode,
    platforms: getProperty<Array<'linux' | 'macos' | 'windows'>>(
      node,
      FIELD_NAMES.PLATFORMS,
    ),
    requires: getProperty<Record<string, unknown>>(node, FIELD_NAMES.REQUIRES),
  }

  if (mode === 'workflow') {
    return {
      ...baseCommand,
      workflow: getProperty<any>(node, FIELD_NAMES.WORKFLOW),
    } as ItemCommand
  }

  return {
    ...baseCommand,
    command: getProperty<string>(node, FIELD_NAMES.COMMAND) || '',
    scriptSource: getProperty<string>(
      node,
      FIELD_NAMES.SCRIPT_SOURCE,
    ) as ScriptCommand['scriptSource'],
    cwd: getProperty<string>(node, FIELD_NAMES.CWD),
    options: getProperty<Record<string, unknown>>(node, FIELD_NAMES.OPTIONS),
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
    FIELD_NAMES: SERVER_FIELD_NAMES,
  } = await import('@nxus/db/server')

  const db = await initDatabaseWithBootstrap()

  const itemNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)

  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  const tagLookup = new Map<string, TagRef>()
  for (const tagNode of tagNodes) {
    const legacyId = dbGetProperty<number>(tagNode, SERVER_FIELD_NAMES.LEGACY_ID)
    tagLookup.set(tagNode.id, {
      id: legacyId || 0,
      name: tagNode.content || '',
    })
  }

  const itemLookup = new Map<string, string>()
  for (const itemNode of itemNodes) {
    const legacyId =
      dbGetProperty<string>(itemNode, SERVER_FIELD_NAMES.LEGACY_ID) ||
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
      FIELD_NAMES: SERVER_FIELD_NAMES,
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
      const legacyId = dbGetProperty<number>(tagNode, SERVER_FIELD_NAMES.LEGACY_ID)
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
        dbGetProperty<string>(itemNode, SERVER_FIELD_NAMES.LEGACY_ID) ||
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
