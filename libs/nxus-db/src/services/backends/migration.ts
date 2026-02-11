/**
 * migration.ts - SQLite-to-SurrealDB migration script
 *
 * Reads all data from a SQLite database (nodes + node_properties) and writes
 * it into SurrealDB using the graph model (node, field, has_field, supertag,
 * has_supertag, extends).
 *
 * Key translation rules:
 * - SQLite `nodes` rows → SurrealDB `node` records
 * - SQLite `node_properties` with field:supertag → SurrealDB `has_supertag` edges
 * - SQLite `node_properties` with field:extends → SurrealDB `extends` edges
 * - All other SQLite `node_properties` → SurrealDB `has_field` edges
 * - Field node UUIDs → SurrealDB `field` record IDs (resolved by system_id)
 *
 * The script does NOT modify the SQLite database — it's a read-only source.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { Surreal, RecordId } from 'surrealdb'
import { StringRecordId } from 'surrealdb'
import { eq } from 'drizzle-orm'
import { nodes, nodeProperties } from '../../schemas/node-schema.js'
import { SYSTEM_FIELDS } from '../../schemas/node-schema.js'
import type * as itemSchema from '../../schemas/item-schema.js'
import { SqliteBackend } from './sqlite-backend.js'
import { SurrealBackend } from './surreal-backend.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SqliteDb = BetterSQLite3Database<typeof itemSchema>

export interface MigrationResult {
  /** Total nodes migrated */
  nodesCount: number
  /** Total has_field edges created */
  propertiesCount: number
  /** Total has_supertag edges created */
  supertagsCount: number
  /** Total extends edges created */
  extendsCount: number
  /** Nodes that failed to migrate */
  errors: Array<{ nodeId: string; error: string }>
  /** Validation differences (if validation was run) */
  validationDiffs: Array<{ nodeId: string; diff: string }>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rid(id: RecordId | string | unknown): string {
  if (typeof id === 'string') return id
  if (id && typeof id === 'object' && typeof (id as RecordId).toString === 'function') {
    return (id as RecordId).toString()
  }
  return String(id)
}

/**
 * Build a map of SQLite field node UUID → field system_id.
 * This lets us resolve `node_properties.field_node_id` → the field's system_id.
 */
function buildFieldIdMap(sqliteDb: SqliteDb): Map<string, string> {
  const fieldMap = new Map<string, string>()
  const allNodes = sqliteDb.select().from(nodes).all()
  for (const node of allNodes) {
    if (node.systemId && node.systemId.startsWith('field:')) {
      fieldMap.set(node.id, node.systemId)
    }
  }
  return fieldMap
}

/**
 * Build a map of SQLite supertag node UUID → supertag system_id.
 */
function buildSupertagIdMap(sqliteDb: SqliteDb): Map<string, string> {
  const stMap = new Map<string, string>()
  const allNodes = sqliteDb.select().from(nodes).all()
  for (const node of allNodes) {
    if (node.systemId && node.systemId.startsWith('supertag:')) {
      stMap.set(node.id, node.systemId)
    }
  }
  return stMap
}

/**
 * Resolve a SurrealDB supertag by system_id → record ID string.
 */
async function resolveSurrealSupertagId(
  surrealDb: Surreal,
  supertagSystemId: string,
): Promise<string | null> {
  const [results] = await surrealDb.query<[Array<{ id: RecordId }>]>(
    `SELECT id FROM supertag WHERE system_id = $systemId LIMIT 1`,
    { systemId: supertagSystemId },
  )
  if (!results || results.length === 0) return null
  return rid(results[0].id)
}

/**
 * Resolve a SurrealDB field by system_id → record ID string.
 */
async function resolveSurrealFieldId(
  surrealDb: Surreal,
  fieldSystemId: string,
): Promise<string | null> {
  const [results] = await surrealDb.query<[Array<{ id: RecordId }>]>(
    `SELECT id FROM field WHERE system_id = $systemId LIMIT 1`,
    { systemId: fieldSystemId },
  )
  if (!results || results.length === 0) return null
  return rid(results[0].id)
}

// ---------------------------------------------------------------------------
// Main migration function
// ---------------------------------------------------------------------------

/**
 * Migrate all data from a SQLite database to a SurrealDB instance.
 *
 * Assumes the SurrealDB schema (including field and supertag bootstraps) has
 * already been initialized (e.g., via `initGraphSchema()`).
 *
 * @param sqliteDb - The SQLite database instance (Drizzle ORM)
 * @param surrealDb - The SurrealDB instance (already connected and schema-initialized)
 * @param options.validate - If true, validate each migrated node by comparing assembly output
 * @param options.verbose - If true, log progress
 */
export async function migrateSqliteToSurreal(
  sqliteDb: SqliteDb,
  surrealDb: Surreal,
  options: { validate?: boolean; verbose?: boolean } = {},
): Promise<MigrationResult> {
  const { validate = false, verbose = false } = options

  const result: MigrationResult = {
    nodesCount: 0,
    propertiesCount: 0,
    supertagsCount: 0,
    extendsCount: 0,
    errors: [],
    validationDiffs: [],
  }

  // Build lookup maps
  const fieldIdMap = buildFieldIdMap(sqliteDb)
  const supertagIdMap = buildSupertagIdMap(sqliteDb)

  // Cache SurrealDB field record IDs
  const surrealFieldCache = new Map<string, string>()
  async function getSurrealFieldId(fieldSystemId: string): Promise<string | null> {
    const cached = surrealFieldCache.get(fieldSystemId)
    if (cached) return cached
    const resolved = await resolveSurrealFieldId(surrealDb, fieldSystemId)
    if (resolved) surrealFieldCache.set(fieldSystemId, resolved)
    return resolved
  }

  // Cache SurrealDB supertag record IDs
  const surrealSupertagCache = new Map<string, string>()
  async function getSurrealSupertagId(supertagSystemId: string): Promise<string | null> {
    const cached = surrealSupertagCache.get(supertagSystemId)
    if (cached) return cached
    const resolved = await resolveSurrealSupertagId(surrealDb, supertagSystemId)
    if (resolved) surrealSupertagCache.set(supertagSystemId, resolved)
    return resolved
  }

  // ---------------------------------------------------------------------------
  // Step 1: Migrate nodes
  // ---------------------------------------------------------------------------

  const allSqliteNodes = sqliteDb.select().from(nodes).all()

  // Skip system nodes (field:* and supertag:*) — they are already bootstrapped
  // in SurrealDB. Only migrate user-created nodes and item:* system nodes.
  const userNodes = allSqliteNodes.filter((n) => {
    if (!n.systemId) return true // No system_id → user node
    if (n.systemId.startsWith('field:')) return false // Skip field definitions
    if (n.systemId.startsWith('supertag:')) return false // Skip supertag definitions
    return true // item:*, test:*, etc. → migrate
  })

  if (verbose) {
    console.log(`[Migration] Found ${allSqliteNodes.length} total nodes, migrating ${userNodes.length} user nodes`)
  }

  // Map: SQLite node UUID → SurrealDB node record ID
  const nodeIdMap = new Map<string, string>()

  for (const sqliteNode of userNodes) {
    try {
      // Build SET clauses dynamically (avoid sending null for option<T> fields)
      const setClauses: string[] = [
        'content = $content',
        'content_plain = $contentPlain',
        'props = $props',
        'created_at = $createdAt',
        'updated_at = $updatedAt',
      ]
      const params: Record<string, unknown> = {
        content: sqliteNode.content,
        contentPlain: sqliteNode.contentPlain,
        props: {},
        createdAt: sqliteNode.createdAt ? new Date(sqliteNode.createdAt) : new Date(),
        updatedAt: sqliteNode.updatedAt ? new Date(sqliteNode.updatedAt) : new Date(),
      }

      if (sqliteNode.systemId) {
        setClauses.push('system_id = $systemId')
        params.systemId = sqliteNode.systemId
      }

      if (sqliteNode.ownerId) {
        setClauses.push('owner_id = $ownerId')
        params.ownerId = sqliteNode.ownerId
      }

      if (sqliteNode.deletedAt) {
        setClauses.push('deleted_at = $deletedAt')
        params.deletedAt = new Date(sqliteNode.deletedAt)
      }

      const [created] = await surrealDb.query<[Array<{ id: RecordId }>]>(
        `CREATE node SET ${setClauses.join(', ')}`,
        params,
      )

      if (created && created.length > 0) {
        const surrealNodeId = rid(created[0].id)
        nodeIdMap.set(sqliteNode.id, surrealNodeId)
        result.nodesCount++
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ nodeId: sqliteNode.id, error: `Node creation failed: ${message}` })
    }
  }

  if (verbose) {
    console.log(`[Migration] Migrated ${result.nodesCount} nodes`)
  }

  // ---------------------------------------------------------------------------
  // Step 2: Migrate properties → has_field edges, has_supertag edges, extends edges
  // ---------------------------------------------------------------------------

  const allProps = sqliteDb.select().from(nodeProperties).all()

  if (verbose) {
    console.log(`[Migration] Processing ${allProps.length} properties`)
  }

  // Get the field:supertag and field:extends field node UUIDs for special handling
  const supertagFieldSystemId = SYSTEM_FIELDS.SUPERTAG as string
  const extendsFieldSystemId = SYSTEM_FIELDS.EXTENDS as string

  for (const prop of allProps) {
    const surrealNodeId = nodeIdMap.get(prop.nodeId)
    if (!surrealNodeId) {
      // Node was skipped (system node) — skip its properties too
      continue
    }

    // Determine the field's system_id
    const fieldSystemId = fieldIdMap.get(prop.fieldNodeId)
    if (!fieldSystemId) {
      // Field node not found in field map — skip
      result.errors.push({
        nodeId: prop.nodeId,
        error: `Unknown field_node_id: ${prop.fieldNodeId}`,
      })
      continue
    }

    // Parse the value
    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(prop.value || 'null')
    } catch {
      parsedValue = prop.value
    }

    try {
      // Special case: field:supertag → create has_supertag edge
      if (fieldSystemId === supertagFieldSystemId) {
        if (typeof parsedValue === 'string') {
          // parsedValue is the SQLite UUID of the supertag node
          const stSystemId = supertagIdMap.get(parsedValue)
          if (stSystemId) {
            const surrealStId = await getSurrealSupertagId(stSystemId)
            if (surrealStId) {
              await surrealDb.query(
                'RELATE $from->has_supertag->$to SET `order` = $order, created_at = time::now()',
                {
                  from: new StringRecordId(surrealNodeId),
                  to: new StringRecordId(surrealStId),
                  order: prop.order ?? 0,
                },
              )
              result.supertagsCount++
            }
          }
        }
        continue
      }

      // Special case: field:extends → create extends edge between supertags
      // This applies to supertag nodes defining inheritance, but since we skipped
      // supertag nodes in Step 1, we need to handle extends from the source node
      // which IS a supertag node. For supertag nodes that were skipped, we handle
      // extends separately below.
      if (fieldSystemId === extendsFieldSystemId) {
        // parsedValue is the SQLite UUID of the parent supertag node
        if (typeof parsedValue === 'string') {
          // Check if the source node (prop.nodeId) is a supertag
          const sourceStSystemId = supertagIdMap.get(prop.nodeId)
          const targetStSystemId = supertagIdMap.get(parsedValue)
          if (sourceStSystemId && targetStSystemId) {
            const surrealSourceStId = await getSurrealSupertagId(sourceStSystemId)
            const surrealTargetStId = await getSurrealSupertagId(targetStSystemId)
            if (surrealSourceStId && surrealTargetStId) {
              await surrealDb.query(
                'RELATE $from->extends->$to SET created_at = time::now()',
                {
                  from: new StringRecordId(surrealSourceStId),
                  to: new StringRecordId(surrealTargetStId),
                },
              )
              result.extendsCount++
            }
          }
        }
        continue
      }

      // Normal property → create has_field edge
      const surrealFieldId = await getSurrealFieldId(fieldSystemId)
      if (!surrealFieldId) {
        result.errors.push({
          nodeId: prop.nodeId,
          error: `Field not found in SurrealDB: ${fieldSystemId}`,
        })
        continue
      }

      await surrealDb.query(
        'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
        {
          from: new StringRecordId(surrealNodeId),
          to: new StringRecordId(surrealFieldId),
          value: parsedValue,
          order: prop.order ?? 0,
        },
      )
      result.propertiesCount++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({
        nodeId: prop.nodeId,
        error: `Property migration failed (${fieldSystemId}): ${message}`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2b: Migrate extends edges from supertag nodes (which were skipped in Step 1)
  // ---------------------------------------------------------------------------

  // Supertag nodes were not migrated as `node` records, but their extends
  // properties still need to become `extends` edges between SurrealDB supertag records.
  for (const sqliteNode of allSqliteNodes) {
    if (!sqliteNode.systemId || !sqliteNode.systemId.startsWith('supertag:')) continue

    const props = sqliteDb
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.nodeId, sqliteNode.id))
      .all()

    for (const prop of props) {
      const fieldSystemId = fieldIdMap.get(prop.fieldNodeId)
      if (fieldSystemId !== extendsFieldSystemId) continue

      let parsedValue: unknown
      try {
        parsedValue = JSON.parse(prop.value || 'null')
      } catch {
        parsedValue = prop.value
      }

      if (typeof parsedValue !== 'string') continue

      const sourceStSystemId = sqliteNode.systemId
      const targetStSystemId = supertagIdMap.get(parsedValue)
      if (!targetStSystemId) continue

      try {
        const surrealSourceStId = await getSurrealSupertagId(sourceStSystemId)
        const surrealTargetStId = await getSurrealSupertagId(targetStSystemId)

        if (surrealSourceStId && surrealTargetStId) {
          // Check if this extends edge already exists (from Step 2)
          const [existing] = await surrealDb.query<[Array<{ id: RecordId }>]>(
            'SELECT id FROM extends WHERE in = $from AND out = $to',
            {
              from: new StringRecordId(surrealSourceStId),
              to: new StringRecordId(surrealTargetStId),
            },
          )

          if (!existing || existing.length === 0) {
            await surrealDb.query(
              'RELATE $from->extends->$to SET created_at = time::now()',
              {
                from: new StringRecordId(surrealSourceStId),
                to: new StringRecordId(surrealTargetStId),
              },
            )
            result.extendsCount++
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push({
          nodeId: sqliteNode.id,
          error: `Extends edge migration failed: ${message}`,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2c: Migrate field definitions on supertag nodes
  // ---------------------------------------------------------------------------
  // In SQLite, supertag nodes can have has_field properties that define the
  // schema for instances of that supertag (default field values).
  // These need to be migrated as has_field edges from the corresponding
  // SurrealDB node record that has the same system_id as the supertag.
  // But supertag definitions are already in the `supertag` table, not `node`.
  // The SurrealBackend.getSupertagFieldDefsInternal looks for a `node` with
  // matching system_id. So we need to ensure those nodes exist.

  for (const sqliteNode of allSqliteNodes) {
    if (!sqliteNode.systemId || !sqliteNode.systemId.startsWith('supertag:')) continue

    const props = sqliteDb
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.nodeId, sqliteNode.id))
      .all()

    // Filter to field definition properties (skip supertag, extends, field_type)
    const skipFields = new Set([
      SYSTEM_FIELDS.SUPERTAG as string,
      SYSTEM_FIELDS.EXTENDS as string,
      SYSTEM_FIELDS.FIELD_TYPE as string,
    ])

    const fieldDefProps = props.filter((p) => {
      const fsId = fieldIdMap.get(p.fieldNodeId)
      return fsId && !skipFields.has(fsId)
    })

    if (fieldDefProps.length === 0) continue

    // Ensure a `node` record exists for this supertag's system_id
    const stSystemId = sqliteNode.systemId
    const [existingNodes] = await surrealDb.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM node WHERE system_id = $systemId LIMIT 1',
      { systemId: stSystemId },
    )

    let surrealNodeId: string
    if (existingNodes && existingNodes.length > 0) {
      surrealNodeId = rid(existingNodes[0].id)
    } else {
      // Create a node record for the supertag definition
      const [created] = await surrealDb.query<[Array<{ id: RecordId }>]>(
        `CREATE node SET content = $content, content_plain = $contentPlain, system_id = $systemId, props = {}, created_at = time::now(), updated_at = time::now()`,
        {
          content: sqliteNode.content,
          contentPlain: sqliteNode.contentPlain,
          systemId: stSystemId,
        },
      )
      if (!created || created.length === 0) continue
      surrealNodeId = rid(created[0].id)
    }

    // Migrate field definition properties as has_field edges
    for (const prop of fieldDefProps) {
      const fieldSystemId = fieldIdMap.get(prop.fieldNodeId)
      if (!fieldSystemId) continue

      const surrealFieldId = await getSurrealFieldId(fieldSystemId)
      if (!surrealFieldId) continue

      let parsedValue: unknown
      try {
        parsedValue = JSON.parse(prop.value || 'null')
      } catch {
        parsedValue = prop.value
      }

      try {
        await surrealDb.query(
          'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
          {
            from: new StringRecordId(surrealNodeId),
            to: new StringRecordId(surrealFieldId),
            value: parsedValue,
            order: prop.order ?? 0,
          },
        )
      } catch {
        // Non-critical: field definition edge creation can fail silently
      }
    }
  }

  if (verbose) {
    console.log(`[Migration] Migrated ${result.propertiesCount} properties, ${result.supertagsCount} supertags, ${result.extendsCount} extends edges`)
  }

  // ---------------------------------------------------------------------------
  // Step 3: Validate (optional)
  // ---------------------------------------------------------------------------

  if (validate) {
    result.validationDiffs = await validateMigration(
      sqliteDb,
      surrealDb,
      nodeIdMap,
      verbose,
    )
  }

  if (verbose) {
    console.log(`[Migration] Complete. Errors: ${result.errors.length}, Validation diffs: ${result.validationDiffs.length}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate migration by comparing assembled nodes from both backends.
 * Compares content, properties (by field name), and supertags (by system_id).
 * Does NOT compare node IDs (UUID vs RecordId format).
 */
async function validateMigration(
  sqliteDb: SqliteDb,
  surrealDb: Surreal,
  nodeIdMap: Map<string, string>,
  verbose: boolean,
): Promise<Array<{ nodeId: string; diff: string }>> {
  const diffs: Array<{ nodeId: string; diff: string }> = []

  const sqliteBackend = new SqliteBackend()
  sqliteBackend.initWithDb(sqliteDb)

  const surrealBackend = new SurrealBackend()
  surrealBackend.initWithDb(surrealDb)

  for (const [sqliteId, surrealId] of nodeIdMap) {
    // Use findNodeById (not assembleNode) to include soft-deleted nodes
    const sqliteNode = await sqliteBackend.findNodeById(sqliteId)
    const surrealNode = await surrealBackend.findNodeById(surrealId)

    if (!sqliteNode && !surrealNode) continue

    if (!sqliteNode) {
      diffs.push({ nodeId: sqliteId, diff: 'Node exists in SurrealDB but not in SQLite' })
      continue
    }

    if (!surrealNode) {
      diffs.push({ nodeId: sqliteId, diff: 'Node exists in SQLite but not in SurrealDB' })
      continue
    }

    // Compare content
    if (sqliteNode.content !== surrealNode.content) {
      diffs.push({
        nodeId: sqliteId,
        diff: `Content mismatch: "${sqliteNode.content}" vs "${surrealNode.content}"`,
      })
    }

    // Compare system_id
    if (sqliteNode.systemId !== surrealNode.systemId) {
      diffs.push({
        nodeId: sqliteId,
        diff: `SystemId mismatch: "${sqliteNode.systemId}" vs "${surrealNode.systemId}"`,
      })
    }

    // Compare properties (by field name, ignoring ID differences)
    const sqliteFieldNames = new Set(Object.keys(sqliteNode.properties))
    const surrealFieldNames = new Set(Object.keys(surrealNode.properties))

    // Skip 'Supertag' field name — in SurrealDB this is modeled as has_supertag edges, not properties
    sqliteFieldNames.delete('Supertag')

    for (const fieldName of sqliteFieldNames) {
      if (!surrealFieldNames.has(fieldName)) {
        diffs.push({
          nodeId: sqliteId,
          diff: `Missing property in SurrealDB: "${fieldName}"`,
        })
        continue
      }

      const sqliteValues = sqliteNode.properties[fieldName as import('../../schemas/node-schema.js').FieldContentName]
      const surrealValues = surrealNode.properties[fieldName as import('../../schemas/node-schema.js').FieldContentName]

      if (sqliteValues.length !== surrealValues.length) {
        diffs.push({
          nodeId: sqliteId,
          diff: `Property "${fieldName}" value count mismatch: ${sqliteValues.length} vs ${surrealValues.length}`,
        })
        continue
      }

      // Compare values (sorted by order)
      const sortedSqlite = [...sqliteValues].sort((a, b) => a.order - b.order)
      const sortedSurreal = [...surrealValues].sort((a, b) => a.order - b.order)

      for (let i = 0; i < sortedSqlite.length; i++) {
        const sv = sortedSqlite[i].value
        const gv = sortedSurreal[i].value

        // Normalize for comparison: both should be the same logical value
        // SQLite stores JSON strings, SurrealDB stores native values
        const svNorm = typeof sv === 'string' ? sv : JSON.stringify(sv)
        const gvNorm = typeof gv === 'string' ? gv : JSON.stringify(gv)

        if (svNorm !== gvNorm) {
          diffs.push({
            nodeId: sqliteId,
            diff: `Property "${fieldName}[${i}]" value mismatch: ${svNorm} vs ${gvNorm}`,
          })
        }
      }
    }

    // Compare supertags (by system_id)
    const sqliteSupertagIds = new Set(
      sqliteNode.supertags.map((st) => st.systemId).filter(Boolean),
    )
    const surrealSupertagIds = new Set(
      surrealNode.supertags.map((st) => st.systemId).filter(Boolean),
    )

    for (const stId of sqliteSupertagIds) {
      if (!surrealSupertagIds.has(stId)) {
        diffs.push({
          nodeId: sqliteId,
          diff: `Missing supertag in SurrealDB: ${stId}`,
        })
      }
    }

    for (const stId of surrealSupertagIds) {
      if (!sqliteSupertagIds.has(stId)) {
        diffs.push({
          nodeId: sqliteId,
          diff: `Extra supertag in SurrealDB: ${stId}`,
        })
      }
    }
  }

  if (verbose) {
    console.log(`[Migration] Validation found ${diffs.length} differences`)
  }

  return diffs
}
