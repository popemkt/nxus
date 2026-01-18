/**
 * adapters.ts - Convert nodes to legacy types for backward compatibility
 *
 * These adapters allow the new node-based system to work with existing code
 * that expects Item, Tag, ItemCommand types.
 */

import type { Tag } from '../../db/schema'
import type {
  DocEntry,
  Item,
  ItemCommand,
  ItemMetadata,
  TagRef,
} from '../../types/item'
import type { AssembledNode } from './node.service'
import { getProperty, getPropertyValues } from './node.service'

// ============================================================================
// Node → Item Adapter
// ============================================================================

/**
 * Convert an assembled node with #Item/#Tool/#Repo supertag to legacy Item type
 */
export function nodeToItem(
  node: AssembledNode,
  options?: {
    resolveTagRefs?: (tagNodeIds: string[]) => TagRef[]
    resolveCommands?: (itemNodeId: string) => ItemCommand[]
    resolveDependencies?: (depNodeIds: string[]) => string[]
  },
): Item {
  // Determine item type from supertag
  let type: Item['type'] = 'tool'
  for (const st of node.supertags) {
    if (st.systemId === 'supertag:tool') type = 'tool'
    else if (st.systemId === 'supertag:repo') type = 'remote-repo'
    else if (st.systemId === 'supertag:item') type = 'html' // Default for generic items
  }

  // Get tags via resolver or empty
  const tagNodeIds = getPropertyValues<string>(node, 'tags')
  const tagRefs = options?.resolveTagRefs?.(tagNodeIds) ?? []

  // Get commands via resolver or empty
  const commands = options?.resolveCommands?.(node.id) ?? []

  // Get dependencies via resolver or return empty (UUIDs are not useful to legacy code)
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
    type,
    path: getProperty<string>(node, 'path') || '',
    homepage: getProperty<string>(node, 'homepage'),
    thumbnail: undefined,
    platform: getProperty<string[]>(node, 'platform'),
    docs: getProperty<DocEntry[]>(node, 'docs'),
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

// ============================================================================
// Node → Tag Adapter
// ============================================================================

/**
 * Convert an assembled node with #Tag supertag to legacy Tag type
 */
export function nodeToTag(
  node: AssembledNode,
  options?: {
    resolveParentId?: (nodeId: string) => number | null
  },
): Tag {
  const legacyId = getProperty<number>(node, 'legacyId')
  const parentNodeId = getProperty<string>(node, 'parent')

  return {
    id: legacyId || 0, // Legacy tags use integer IDs
    name: node.content || '',
    parentId: parentNodeId
      ? (options?.resolveParentId?.(parentNodeId) ?? null)
      : null,
    order: 0,
    color: getProperty<string>(node, 'color') ?? null,
    icon: getProperty<string>(node, 'icon') ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

// ============================================================================
// Node → ItemCommand Adapter
// ============================================================================

/**
 * Convert an assembled node with #Command supertag to legacy ItemCommand type
 */
export function nodeToCommand(node: AssembledNode): ItemCommand {
  return {
    id: getProperty<string>(node, 'commandId') || node.id,
    name: node.content || '',
    description: getProperty<string>(node, 'description'),
    icon: getProperty<string>(node, 'icon') || 'terminal',
    category: getProperty<string>(node, 'category') || 'general',
    target:
      (getProperty<string>(node, 'target') as ItemCommand['target']) || 'item',
    mode:
      (getProperty<string>(node, 'mode') as ItemCommand['mode']) || 'execute',
    command: getProperty<string>(node, 'command') || '',
    scriptSource: getProperty<string>(
      node,
      'scriptSource',
    ) as ItemCommand['scriptSource'],
    cwd: getProperty<string>(node, 'cwd'),
    platforms: getProperty<Array<'linux' | 'macos' | 'windows'>>(
      node,
      'platforms',
    ),
    requires: getProperty<Record<string, unknown>>(node, 'requires'),
    options: getProperty<Record<string, unknown>>(node, 'options'),
  }
}

// ============================================================================
// Batch Adapters
// ============================================================================

/**
 * Convert multiple nodes to Items with resolved references
 */
export function nodesToItems(
  nodes: AssembledNode[],
  tagLookup: Map<string, TagRef>,
  commandsByItemId: Map<string, ItemCommand[]>,
): Item[] {
  return nodes.map((node) =>
    nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: (itemId) => commandsByItemId.get(itemId) ?? [],
    }),
  )
}
