/**
 * seed-graph.ts - Seed SurrealDB graph database from manifest.json files
 *
 * Seeds the embedded SurrealDB (surrealkv://) from the same manifest.json,
 * tags.json, and inbox.json files used by the node/table seeders.
 *
 * Usage: ARCHITECTURE_TYPE=graph pnpm db:seed
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StringRecordId } from 'surrealdb'
import { ItemSchema, createEmbeddedFileGraphDatabase } from '@nxus/db/server'
import type { ItemType } from '@nxus/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

function loadJsonFile<T>(filepath: string): T | null {
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

export async function seedGraph() {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Seed: JSON → SurrealDB Graph')
  console.log('='.repeat(50) + '\n')

  // ============================================================================
  // Step 1: Connect to embedded SurrealDB
  // ============================================================================
  console.log('[1/6] Connecting to embedded SurrealDB...')
  const db = await createEmbeddedFileGraphDatabase()
  console.log('  Connected (schema initialized)')

  // ============================================================================
  // Step 2: Seed tags from tags.json
  // ============================================================================
  console.log('[2/6] Seeding tags from tags.json...')
  const tagsJsonPath = resolve(dataDir, 'tags.json')
  const tagsData = loadJsonFile<{
    tags: Array<{
      id: number
      name: string
      parentId: number | null
      order: number
      color: string | null
      icon: string | null
    }>
  }>(tagsJsonPath)

  // Map legacy tag ID → SurrealDB node ID for tag lookups
  const legacyTagIdToNodeId = new Map<number, string>()
  // Map tag name → node ID for manifest tag resolution
  const tagNameToNodeId = new Map<string, string>()
  let tagsCount = 0

  if (tagsData?.tags) {
    for (const tag of tagsData.tags) {
      // Create node for this tag
      const [nodes] = await db.query<[Array<Record<string, unknown>>]>(
        `CREATE node SET
          content = $content,
          content_plain = $content_plain,
          system_id = $system_id,
          props = $props,
          created_at = time::now(),
          updated_at = time::now()`,
        {
          content: tag.name,
          content_plain: tag.name.toLowerCase(),
          system_id: `tag:${tag.name.toLowerCase().replace(/\s+/g, '-')}`,
          props: {
            legacy_id: tag.id,
            order: tag.order,
            color: tag.color,
            icon: tag.icon,
            parent_id: tag.parentId,
          },
        },
      )

      const node = nodes[0]
      if (!node) continue

      const nodeId = String(node.id)

      // Assign #Tag supertag
      await db.query(
        `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
        {
          from: new StringRecordId(nodeId),
          to: new StringRecordId('supertag:tag'),
        },
      )

      legacyTagIdToNodeId.set(tag.id, nodeId)
      tagNameToNodeId.set(tag.name, nodeId)
      tagsCount++
    }

    // Second pass: create part_of relations for parent tags
    for (const tag of tagsData.tags) {
      if (tag.parentId) {
        const nodeId = legacyTagIdToNodeId.get(tag.id)
        const parentNodeId = legacyTagIdToNodeId.get(tag.parentId)
        if (nodeId && parentNodeId) {
          await db.query(
            `RELATE $from->part_of->$to SET order = 0, created_at = time::now()`,
            {
              from: new StringRecordId(nodeId),
              to: new StringRecordId(parentNodeId),
            },
          )
        }
      }
    }
  }
  console.log(`  Seeded ${tagsCount} tags`)

  // ============================================================================
  // Step 3: Seed items from manifests
  // ============================================================================
  console.log('[3/6] Seeding items from manifests...')
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  // Map item ID → SurrealDB node ID for dependency resolution
  const itemIdToNodeId = new Map<string, string>()
  let itemsCount = 0
  let commandsCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const rawManifest = loadJsonFile<Record<string, unknown>>(manifestPath)
    if (!rawManifest) continue

    // Normalize type fields
    const rawTypes = rawManifest.types as Array<ItemType> | undefined
    const rawType = rawManifest.type as ItemType | undefined
    const rawPrimaryType = rawManifest.primaryType as ItemType | undefined

    let types: Array<ItemType>
    if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
      types = rawTypes
    } else if (rawType) {
      types = [rawType]
    } else {
      console.error(`  ✗ No type field for ${appDir}, skipping...`)
      continue
    }

    const primaryType =
      rawPrimaryType && types.includes(rawPrimaryType)
        ? rawPrimaryType
        : types[0]

    const manifest = {
      ...rawManifest,
      types,
      primaryType,
      type: primaryType,
    }

    const validationResult = ItemSchema.safeParse(manifest)
    if (!validationResult.success) {
      console.error(`  ✗ Validation failed for ${appDir}, skipping...`)
      continue
    }

    const item = validationResult.data
    const systemId = `item:${item.id}`

    // Build props matching what graphNodeToItem expects
    const props: Record<string, unknown> = {
      item_id: item.id,
      description: item.description,
      type: primaryType,
      types,
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
      commands: item.commands || [],
    }

    // Type-specific fields
    const anyItem = item as Record<string, unknown>
    if (types.includes('tool')) {
      props.checkCommand = anyItem.checkCommand
      props.platform = anyItem.platform
      props.installInstructions = anyItem.installInstructions
      props.configSchema = anyItem.configSchema
    }
    if (types.includes('typescript')) {
      props.startCommand = anyItem.startCommand
      props.buildCommand = anyItem.buildCommand
    }
    if (types.includes('remote-repo')) {
      props.clonePath = anyItem.clonePath
      props.branch = anyItem.branch
    }

    // Tag refs for the item
    const tagRefs =
      item.metadata?.tags?.map((t) => ({
        id: t.id ?? 0,
        name: t.name,
      })) ?? []
    if (tagRefs.length > 0) {
      props.tag_refs = tagRefs
    }

    // Create the item node
    const [nodes] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE node SET
        content = $content,
        content_plain = $content_plain,
        system_id = $system_id,
        props = $props,
        created_at = time::now(),
        updated_at = time::now()`,
      {
        content: item.name,
        content_plain: item.name.toLowerCase(),
        system_id: systemId,
        props,
      },
    )

    const node = nodes[0]
    if (!node) continue

    const nodeId = String(node.id)
    itemIdToNodeId.set(item.id, nodeId)

    // Assign #Item supertag
    await db.query(
      `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
      {
        from: new StringRecordId(nodeId),
        to: new StringRecordId('supertag:item'),
      },
    )

    // Create tagged_with relations for tags
    for (const tagRef of tagRefs) {
      const tagNodeId = tagNameToNodeId.get(tagRef.name)
      if (tagNodeId) {
        await db.query(
          `RELATE $from->tagged_with->$to SET created_at = time::now()`,
          {
            from: new StringRecordId(nodeId),
            to: new StringRecordId(tagNodeId),
          },
        )
      }
    }

    // Create command nodes as part_of the item
    for (let i = 0; i < (item.commands || []).length; i++) {
      const cmd = item.commands![i]
      const [cmdNodes] = await db.query<[Array<Record<string, unknown>>]>(
        `CREATE node SET
          content = $content,
          content_plain = $content_plain,
          system_id = $system_id,
          props = $props,
          created_at = time::now(),
          updated_at = time::now()`,
        {
          content: cmd.name,
          content_plain: cmd.name.toLowerCase(),
          system_id: `cmd:${item.id}:${cmd.id}`,
          props: {
            command_id: cmd.id,
            command: (cmd as any).command,
            workflow: (cmd as any).workflow,
            mode: cmd.mode,
            target: cmd.target,
            icon: cmd.icon,
            category: cmd.category,
            description: cmd.description,
            scriptSource: (cmd as any).scriptSource,
            cwd: (cmd as any).cwd,
            platforms: cmd.platforms,
            requires: cmd.requires,
            options: (cmd as any).options,
          },
        },
      )

      const cmdNode = cmdNodes[0]
      if (!cmdNode) continue

      const cmdNodeId = String(cmdNode.id)

      // Assign #Command supertag
      await db.query(
        `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
        {
          from: new StringRecordId(cmdNodeId),
          to: new StringRecordId('supertag:command'),
        },
      )

      // Command is part_of item
      await db.query(
        `RELATE $from->part_of->$to SET order = $order, created_at = time::now()`,
        {
          from: new StringRecordId(cmdNodeId),
          to: new StringRecordId(nodeId),
          order: i,
        },
      )

      commandsCount++
    }

    itemsCount++
  }
  console.log(`  Seeded ${itemsCount} items, ${commandsCount} commands`)

  // ============================================================================
  // Step 4: Seed inbox items from inbox.json
  // ============================================================================
  console.log('[4/6] Seeding inbox items from inbox.json...')
  const inboxJsonPath = resolve(dataDir, 'inbox.json')
  const inboxData = loadJsonFile<{
    items: Array<{
      id: number
      title: string
      notes: string | null
      status: string
      createdAt: string
      updatedAt: string
    }>
  }>(inboxJsonPath)

  let inboxCount = 0

  if (inboxData?.items) {
    for (const item of inboxData.items) {
      const [nodes] = await db.query<[Array<Record<string, unknown>>]>(
        `CREATE node SET
          content = $content,
          content_plain = $content_plain,
          props = $props,
          created_at = $created_at,
          updated_at = $updated_at`,
        {
          content: item.title,
          content_plain: item.title.toLowerCase(),
          props: {
            legacy_id: item.id,
            status: item.status,
            notes: item.notes,
          },
          created_at: item.createdAt,
          updated_at: item.updatedAt,
        },
      )

      const node = nodes[0]
      if (!node) continue

      const nodeId = String(node.id)

      // Assign #Inbox supertag
      await db.query(
        `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
        {
          from: new StringRecordId(nodeId),
          to: new StringRecordId('supertag:inbox'),
        },
      )

      inboxCount++
    }
  }
  console.log(`  Seeded ${inboxCount} inbox items`)

  // ============================================================================
  // Step 5: Resolve dependencies
  // ============================================================================
  console.log('[5/6] Resolving dependencies...')
  let depCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const rawManifest = loadJsonFile<Record<string, unknown>>(manifestPath)
    if (!rawManifest) continue

    // Normalize for validation
    const rawTypes = rawManifest.types as Array<ItemType> | undefined
    const rawType = rawManifest.type as ItemType | undefined
    let types: Array<ItemType>
    if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
      types = rawTypes
    } else if (rawType) {
      types = [rawType]
    } else continue

    const manifest = {
      ...rawManifest,
      types,
      primaryType: types[0],
      type: types[0],
    }
    const validationResult = ItemSchema.safeParse(manifest)
    if (!validationResult.success) continue

    const item = validationResult.data
    const nodeId = itemIdToNodeId.get(item.id)
    if (!nodeId || !item.dependencies) continue

    for (const depId of item.dependencies) {
      const depNodeId = itemIdToNodeId.get(depId)
      if (depNodeId) {
        await db.query(
          `RELATE $from->dependency_of->$to SET created_at = time::now()`,
          {
            from: new StringRecordId(nodeId),
            to: new StringRecordId(depNodeId),
          },
        )
        depCount++
      }
    }
  }
  console.log(`  Created ${depCount} dependency relationships`)

  // ============================================================================
  // Step 6: Summary
  // ============================================================================
  const [allNodes] = await db.query<[Array<unknown>]>(
    `SELECT count() FROM node GROUP ALL`,
  )
  const [allRelations] = await db.query<[Array<unknown>]>(
    `SELECT count() FROM has_supertag GROUP ALL`,
  )

  const nodeCount = (allNodes[0] as any)?.count ?? '?'
  const relCount = (allRelations[0] as any)?.count ?? '?'

  console.log('\n' + '='.repeat(50))
  console.log('  Graph seed complete!')
  console.log(`   Total nodes: ${nodeCount}`)
  console.log(`   Total has_supertag relations: ${relCount}`)
  console.log(
    `   Items: ${itemsCount}, Commands: ${commandsCount}, Tags: ${tagsCount}, Inbox: ${inboxCount}`,
  )
  console.log('='.repeat(50) + '\n')

  // Close the connection to flush data to disk
  await db.close()
  console.log('[GraphDB] Connection closed, data persisted to disk')
}

// Run if executed directly (not when imported by db-seed.ts)
const isDirectRun =
  process.argv[1]?.endsWith('seed-graph.ts') ||
  process.argv[1]?.endsWith('seed-graph')
if (isDirectRun) {
  seedGraph().catch(console.error)
}
