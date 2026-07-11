/**
 * seed-graph.ts - Seed SurrealDB graph database from manifest.json files
 *
 * Seeds through the NodeBackend facade contract so writes stay aligned with
 * SurrealBackend's read model: hierarchy is `owner_id`, properties are
 * `has_field` edges, and supertags are `has_supertag` edges.
 *
 * Usage: ARCHITECTURE_TYPE=graph pnpm db:seed
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ItemSchema,
  ItemTypeSchema,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  closeGraphDatabase,
  getCommandString,
  isToolItem,
  nodeFacade,
} from '@nxus/db/server'
import { z } from 'zod'
import type { Item, ItemType } from '@nxus/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

const TagsFileSchema = z.object({
  tags: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      parentId: z.number().nullable(),
      order: z.number(),
      color: z.string().nullable(),
      icon: z.string().nullable(),
    }),
  ),
})

const InboxFileSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      notes: z.string().nullable(),
      status: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
})

const ITEM_TYPE_TO_SUPERTAG: Record<ItemType, string> = {
  html: SYSTEM_SUPERTAGS.ITEM,
  typescript: SYSTEM_SUPERTAGS.ITEM,
  tool: SYSTEM_SUPERTAGS.TOOL,
  'remote-repo': SYSTEM_SUPERTAGS.REPO,
  concept: SYSTEM_SUPERTAGS.CONCEPT,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadJsonFile(filepath: string): unknown | null {
  try {
    const content = readFileSync(filepath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    return parsed
  } catch {
    return null
  }
}

function parseItemType(value: unknown): ItemType | null {
  const result = ItemTypeSchema.safeParse(value)
  return result.success ? result.data : null
}

function normalizeItemTypes(rawManifest: Record<string, unknown>): ItemType[] {
  const rawTypes = rawManifest.types
  if (Array.isArray(rawTypes)) {
    const parsedTypes = rawTypes
      .map((entry) => parseItemType(entry))
      .filter((entry): entry is ItemType => entry !== null)
    if (parsedTypes.length > 0) return parsedTypes
  }

  const rawType = parseItemType(rawManifest.type)
  return rawType ? [rawType] : []
}

function normalizeTagRefs(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []

  return value.map((tag) => {
    if (typeof tag === 'string') {
      return { id: tag, name: tag }
    }

    if (!isRecord(tag)) return tag

    const name = typeof tag.name === 'string' ? tag.name : ''
    const idSource = tag.id ?? tag.name ?? ''
    return {
      ...tag,
      id: String(idSource),
      name,
    }
  })
}

function normalizeManifest(rawManifest: unknown, appDir: string): unknown | null {
  if (!isRecord(rawManifest)) {
    console.error(`  x Invalid manifest for ${appDir}, skipping...`)
    return null
  }

  const types = normalizeItemTypes(rawManifest)
  if (types.length === 0) {
    console.error(`  x No type field for ${appDir}, skipping...`)
    return null
  }

  const rawPrimaryType = parseItemType(rawManifest.primaryType)
  const primaryType =
    rawPrimaryType && types.includes(rawPrimaryType) ? rawPrimaryType : types[0]
  const rawMetadata = isRecord(rawManifest.metadata) ? rawManifest.metadata : {}

  return {
    ...rawManifest,
    types,
    primaryType,
    type: primaryType,
    metadata: {
      ...rawMetadata,
      tags: normalizeTagRefs(rawMetadata.tags),
    },
  }
}

async function setPropertyIfPresent(
  nodeId: string,
  fieldId: typeof SYSTEM_FIELDS[keyof typeof SYSTEM_FIELDS],
  value: unknown,
): Promise<void> {
  if (value === undefined || value === null || value === '') return
  await nodeFacade.setProperty(nodeId, fieldId, value)
}

function isMissingSupertagError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Supertag not found:')
}

async function addItemSupertags(nodeId: string, item: Item): Promise<void> {
  const itemTypes = item.types.length > 0 ? item.types : [item.type]
  let added = false

  for (const itemType of itemTypes) {
    const supertagSystemId = ITEM_TYPE_TO_SUPERTAG[itemType]
    if (!supertagSystemId) continue

    let didAdd = false
    try {
      didAdd = await nodeFacade.addNodeSupertag(nodeId, supertagSystemId)
    } catch (error) {
      if (!isMissingSupertagError(error)) throw error
    }
    added = added || didAdd
  }

  if (!added) {
    await nodeFacade.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
  }
}

async function setItemProperties(nodeId: string, item: Item): Promise<void> {
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.TYPE, item.type)
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.PATH, item.path)
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.LEGACY_ID, item.id)

  await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.DESCRIPTION, item.description)
  await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.HOMEPAGE, item.homepage)
  await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.DOCS, item.docs)
  await setPropertyIfPresent(
    nodeId,
    SYSTEM_FIELDS.CATEGORY,
    item.metadata.category,
  )

  if (isToolItem(item)) {
    await nodeFacade.setProperty(
      nodeId,
      SYSTEM_FIELDS.CHECK_COMMAND,
      item.checkCommand,
    )
    await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.PLATFORM, item.platform)
    await setPropertyIfPresent(
      nodeId,
      SYSTEM_FIELDS.INSTALL_INSTRUCTIONS,
      item.installInstructions,
    )
  }
}

async function setCommandProperties(
  commandNodeId: string,
  item: Item,
  commandIndex: number,
): Promise<void> {
  const command = item.commands?.[commandIndex]
  if (!command) return

  await nodeFacade.setProperty(commandNodeId, SYSTEM_FIELDS.COMMAND_ID, command.id)
  await nodeFacade.setProperty(commandNodeId, SYSTEM_FIELDS.MODE, command.mode)
  await nodeFacade.setProperty(commandNodeId, SYSTEM_FIELDS.TARGET, command.target)
  await nodeFacade.setProperty(commandNodeId, SYSTEM_FIELDS.ICON, command.icon)
  await nodeFacade.setProperty(
    commandNodeId,
    SYSTEM_FIELDS.CATEGORY,
    command.category,
  )
  await nodeFacade.setProperty(commandNodeId, SYSTEM_FIELDS.ORDER, commandIndex)

  await setPropertyIfPresent(
    commandNodeId,
    SYSTEM_FIELDS.DESCRIPTION,
    command.description,
  )
  await setPropertyIfPresent(
    commandNodeId,
    SYSTEM_FIELDS.COMMAND,
    getCommandString(command),
  )
  await setPropertyIfPresent(
    commandNodeId,
    SYSTEM_FIELDS.PLATFORMS,
    command.platforms,
  )
  await setPropertyIfPresent(
    commandNodeId,
    SYSTEM_FIELDS.REQUIRES,
    command.requires,
  )
  await setPropertyIfPresent(
    commandNodeId,
    SYSTEM_FIELDS.REQUIREMENTS,
    command.requirements,
  )
  await setPropertyIfPresent(commandNodeId, SYSTEM_FIELDS.PARAMS, command.params)

  if ('workflow' in command) {
    await nodeFacade.setProperty(
      commandNodeId,
      SYSTEM_FIELDS.WORKFLOW,
      command.workflow,
    )
  }

  if ('scriptSource' in command) {
    await setPropertyIfPresent(
      commandNodeId,
      SYSTEM_FIELDS.SCRIPT_SOURCE,
      command.scriptSource,
    )
  }

  if ('cwd' in command) {
    await setPropertyIfPresent(commandNodeId, SYSTEM_FIELDS.CWD, command.cwd)
  }

  if ('options' in command) {
    await setPropertyIfPresent(
      commandNodeId,
      SYSTEM_FIELDS.OPTIONS,
      command.options,
    )
  }
}

async function getOrCreateTagNode(
  tagName: string,
  tagNameToNodeId: Map<string, string>,
): Promise<string> {
  const existing = tagNameToNodeId.get(tagName)
  if (existing) return existing

  const nodeId = await nodeFacade.createNode({
    content: tagName,
    supertagId: SYSTEM_SUPERTAGS.TAG,
  })
  tagNameToNodeId.set(tagName, nodeId)
  return nodeId
}

export async function seedGraph(): Promise<void> {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Seed: JSON -> SurrealDB Graph')
  console.log('='.repeat(50) + '\n')

  process.env.ARCHITECTURE_TYPE = 'graph'

  console.log('[1/6] Connecting to embedded SurrealDB...')
  await nodeFacade.init()
  console.log('  Connected (schema initialized)')

  const workspaceRootId = await nodeFacade.createNode({
    content: 'Nxus Apps',
  })

  console.log('[2/6] Seeding tags from tags.json...')
  const tagsJsonPath = resolve(dataDir, 'tags.json')
  const tagsParseResult = TagsFileSchema.safeParse(loadJsonFile(tagsJsonPath))

  const legacyTagIdToNodeId = new Map<number, string>()
  const tagNameToNodeId = new Map<string, string>()
  let tagsCount = 0

  if (tagsParseResult.success) {
    for (const tag of tagsParseResult.data.tags) {
      const nodeId = await nodeFacade.createNode({
        content: tag.name,
        systemId: `tag:${tag.name.toLowerCase().replace(/\s+/g, '-')}`,
        supertagId: SYSTEM_SUPERTAGS.TAG,
      })

      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.LEGACY_ID, tag.id)
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.ORDER, tag.order)
      await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.COLOR, tag.color)
      await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.ICON, tag.icon)

      legacyTagIdToNodeId.set(tag.id, nodeId)
      tagNameToNodeId.set(tag.name, nodeId)
      tagsCount++
    }

    for (const tag of tagsParseResult.data.tags) {
      if (!tag.parentId) continue

      const nodeId = legacyTagIdToNodeId.get(tag.id)
      const parentNodeId = legacyTagIdToNodeId.get(tag.parentId)
      if (!nodeId || !parentNodeId) continue

      await nodeFacade.reparentNode(nodeId, parentNodeId, tag.order)
      await nodeFacade.linkNodes(nodeId, SYSTEM_FIELDS.PARENT, parentNodeId)
    }
  }
  console.log(`  Seeded ${tagsCount} tags`)

  console.log('[3/6] Seeding items from manifests...')
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  const itemIdToNodeId = new Map<string, string>()
  let itemsCount = 0
  let commandsCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const normalizedManifest = normalizeManifest(loadJsonFile(manifestPath), appDir)
    if (!normalizedManifest) continue

    const validationResult = ItemSchema.safeParse(normalizedManifest)
    if (!validationResult.success) {
      const issues = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      console.error(`  x Validation failed for ${appDir}, skipping...`)
      console.error(`    ${issues}`)
      continue
    }

    const item = validationResult.data
    const nodeId = await nodeFacade.createNode({
      content: item.name,
      systemId: `item:${item.id}`,
      ownerId: workspaceRootId,
    })

    itemIdToNodeId.set(item.id, nodeId)

    await addItemSupertags(nodeId, item)
    await setItemProperties(nodeId, item)

    const manifestTags = item.metadata.tags
    for (const tagRef of manifestTags) {
      const tagNodeId = await getOrCreateTagNode(tagRef.name, tagNameToNodeId)
      await nodeFacade.linkNodes(nodeId, SYSTEM_FIELDS.TAGS, tagNodeId, true)
    }

    for (const [commandIndex, command] of (item.commands ?? []).entries()) {
      const commandNodeId = await nodeFacade.createNode({
        content: command.name,
        systemId: `cmd:${item.id}:${command.id}`,
        ownerId: nodeId,
        supertagId: SYSTEM_SUPERTAGS.COMMAND,
      })

      await setCommandProperties(commandNodeId, item, commandIndex)
      commandsCount++
    }

    itemsCount++
  }
  console.log(`  Seeded ${itemsCount} items, ${commandsCount} commands`)

  console.log('[4/6] Seeding inbox items from inbox.json...')
  const inboxJsonPath = resolve(dataDir, 'inbox.json')
  const inboxParseResult = InboxFileSchema.safeParse(loadJsonFile(inboxJsonPath))
  let inboxCount = 0

  if (inboxParseResult.success) {
    for (const item of inboxParseResult.data.items) {
      const nodeId = await nodeFacade.createNode({
        content: item.title,
        supertagId: SYSTEM_SUPERTAGS.INBOX,
      })

      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.LEGACY_ID, item.id)
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.STATUS, item.status)
      await setPropertyIfPresent(nodeId, SYSTEM_FIELDS.NOTES, item.notes)
      inboxCount++
    }
  }
  console.log(`  Seeded ${inboxCount} inbox items`)

  console.log('[5/6] Resolving dependencies...')
  let depCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const normalizedManifest = normalizeManifest(loadJsonFile(manifestPath), appDir)
    if (!normalizedManifest) continue

    const validationResult = ItemSchema.safeParse(normalizedManifest)
    if (!validationResult.success) continue

    const item = validationResult.data
    const nodeId = itemIdToNodeId.get(item.id)
    if (!nodeId || !item.dependencies) continue

    for (const depId of item.dependencies) {
      const depNodeId = itemIdToNodeId.get(depId)
      if (!depNodeId) continue

      await nodeFacade.linkNodes(
        nodeId,
        SYSTEM_FIELDS.DEPENDENCIES,
        depNodeId,
        true,
      )
      depCount++
    }
  }
  console.log(`  Created ${depCount} dependency relationships`)

  const itemNodes = await nodeFacade.getNodesBySupertags([SYSTEM_SUPERTAGS.ITEM])
  const commandNodes = await nodeFacade.getNodesBySupertags([
    SYSTEM_SUPERTAGS.COMMAND,
  ])
  const tagNodes = await nodeFacade.getNodesBySupertags([SYSTEM_SUPERTAGS.TAG])
  const inboxNodes = await nodeFacade.getNodesBySupertags([
    SYSTEM_SUPERTAGS.INBOX,
  ])

  console.log('\n' + '='.repeat(50))
  console.log('  Graph seed complete!')
  console.log(
    `   Visible nodes: ${
      itemNodes.length + commandNodes.length + tagNodes.length + inboxNodes.length
    }`,
  )
  console.log(
    `   Items: ${itemsCount}, Commands: ${commandsCount}, Tags: ${tagsCount}, Inbox: ${inboxCount}`,
  )
  console.log('='.repeat(50) + '\n')

  await nodeFacade.save()
  await closeGraphDatabase()
  console.log('[GraphDB] Connection closed, data persisted to disk')
}

const isDirectRun =
  process.argv[1]?.endsWith('seed-graph.ts') ||
  process.argv[1]?.endsWith('seed-graph')
if (isDirectRun) {
  seedGraph().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
