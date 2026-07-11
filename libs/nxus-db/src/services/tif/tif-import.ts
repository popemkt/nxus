/**
 * tif-import.ts - Import a Tana Intermediate Format (TIF) v0.1 file into the
 * node graph.
 *
 * Two-pass strategy:
 *   Pass 1 (`walkCreate`) walks the TIF node tree depth-first, creating one
 *   real node per non-`field` TIF node (preserving sibling order via
 *   `field:order`) and building the `uid -> new node id` map. `type:'field'`
 *   nodes are NOT outline nodes — per TIF semantics they are field-value
 *   carriers, so they are collected into `deferredFields` instead of being
 *   materialized as children.
 *   Pass 2 resolves everything that needs the COMPLETE uid map (which can
 *   only exist once every node has been created): inline `[[uid]]` tokens in
 *   content/description, the top-level `refs[]` array, and the deferred
 *   field values (which may themselves reference nodes anywhere in the file).
 *
 * The whole import runs inside one transaction (`withNodeMutationTransaction`)
 * so a failure anywhere (a Zod rejection happens even earlier, before the
 * transaction opens) leaves the database exactly as it was.
 */

import { eq } from 'drizzle-orm'
import { nodes, SYSTEM_FIELDS, SYSTEM_SUPERTAGS, type FieldSystemId, type FieldType } from '../../schemas/node-schema.js'
import type { getDatabase } from '../../client/master-client.js'
import {
  addNodeSupertag,
  addPropertyValue,
  createNode,
  getSystemNode,
  setProperty,
  updateNodeContent,
  withNodeMutationTransaction,
} from '../node.service.js'
import {
  TanaIntermediateFileSchema,
  type TanaIntermediateNode,
  type TanaIntermediateSupertag,
  type TifAttributeDataType,
} from './tif-types.js'

type Db = ReturnType<typeof getDatabase>

// ============================================================================
// Public types
// ============================================================================

export interface ImportTifOptions {
  /** Attach imported top-level TIF nodes under this existing node. Defaults to root (no owner). */
  ownerId?: string
}

export interface ImportTifSkipped {
  uid: string
  reason: string
}

export interface ImportTifSummary {
  /** Real outline nodes created (excludes `type:'field'` carriers and field-value children). */
  nodesImported: number
  topLevelNodesImported: number
  supertagsImported: number
  /** Number of field-carrier applications materialized as properties. */
  fieldsImported: number
  refsResolved: number
  brokenRefs: number
  skipped: ImportTifSkipped[]
  /** New node ids for each non-`field` top-level TIF node, in `tif.nodes` order — the caller's hook for navigating to what was just imported. */
  topLevelNodeIds: string[]
}

// ============================================================================
// Helpers
// ============================================================================

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Bare `[[uid]]` tokens as they appear in raw TIF text (distinct from our own `[[node:<uuid>]]` convention). */
const TIF_REF_TOKEN = /\[\[([^[\]]+)\]\]/g

function rewriteInlineRefs(text: string, uidMap: Map<string, string>, onBroken: () => void): string {
  return text.replace(TIF_REF_TOKEN, (match, uid: string) => {
    const newId = uidMap.get(uid)
    if (!newId) {
      onBroken()
      return match // leave the literal token in place — traceable, never silently dropped
    }
    return `[[node:${newId}]]`
  })
}

/**
 * Append `[[node:<id>]]` tokens for `refs[]` entries that are not already
 * embedded inline in the node's raw name/description text, so a hard link
 * that Tana only recorded in `refs` still becomes a real mention.
 */
function appendResolvedRefTokens(
  rewrittenContent: string,
  rawText: string,
  refs: string[] | undefined,
  uidMap: Map<string, string>,
  onBroken: () => void,
  onResolved: () => void,
): string {
  if (!refs || refs.length === 0) return rewrittenContent
  const extras: string[] = []
  for (const uid of refs) {
    if (rawText.includes(`[[${uid}]]`)) continue // already covered by the inline rewrite above
    const newId = uidMap.get(uid)
    if (!newId) {
      onBroken()
      continue
    }
    onResolved()
    extras.push(`[[node:${newId}]]`)
  }
  if (extras.length === 0) return rewrittenContent
  return `${rewrittenContent} ${extras.join(' ')}`.trim()
}

function applyOriginalTimestamps(tx: Db, nodeId: string, createdAtMs: number, editedAtMs: number): void {
  const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs) : new Date()
  const updatedAt = Number.isFinite(editedAtMs) ? new Date(editedAtMs) : createdAt
  tx.update(nodes).set({ createdAt, updatedAt }).where(eq(nodes.id, nodeId)).run()
}

function mapDataTypeToFieldType(dataType: TifAttributeDataType | undefined): FieldType {
  switch (dataType) {
    case 'url':
      return 'url'
    case 'email':
      return 'email'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'boolean'
    case 'any':
    default:
      return 'text'
  }
}

function coerceFieldValue(raw: string, dataType: TifAttributeDataType | undefined): unknown {
  if (dataType === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) && raw.trim() !== '' ? n : raw
  }
  if (dataType === 'checkbox') {
    return /^(true|done|yes)$/i.test(raw.trim())
  }
  return raw
}

/**
 * Ensure a system field node exists for a fixed, engine-internal marker
 * systemId (e.g. `field:tif_node_type`), reusing one created by a previous
 * import into the same database rather than colliding on the unique
 * `systemId` constraint.
 */
function ensureMarkerField(
  tx: Db,
  cache: Map<string, FieldSystemId>,
  systemId: string,
  content: string,
  fieldType: FieldType,
): FieldSystemId {
  const cached = cache.get(systemId)
  if (cached) return cached
  if (!getSystemNode(tx, systemId)) {
    const fieldNodeId = createNode(tx, { content, systemId })
    addNodeSupertag(tx, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
    setProperty(tx, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, fieldType)
  }
  const fieldSystemId = systemId as FieldSystemId
  cache.set(systemId, fieldSystemId)
  return fieldSystemId
}

/**
 * Resolve (creating if needed) the field-definition node backing a TIF
 * attribute name. Reuses a field created by a previous import with the same
 * generated systemId; disambiguates within-file slug collisions between
 * distinct attribute names with a numeric suffix.
 */
function getOrCreateAttributeField(
  tx: Db,
  registry: Map<string, string>,
  usedSystemIds: Set<string>,
  attributeName: string,
  dataType: TifAttributeDataType | undefined,
): string {
  const cached = registry.get(attributeName)
  if (cached) return cached

  const slug = slugify(attributeName) || 'field'
  let systemId = `field:tif_${slug}`
  const existing = getSystemNode(tx, systemId)

  if (!existing && usedSystemIds.has(systemId)) {
    let n = 2
    while (usedSystemIds.has(`${systemId}_${n}`)) n++
    systemId = `${systemId}_${n}`
  }
  usedSystemIds.add(systemId)

  if (!existing) {
    const fieldNodeId = createNode(tx, { content: attributeName, systemId })
    addNodeSupertag(tx, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
    setProperty(tx, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, mapDataTypeToFieldType(dataType))
  }

  registry.set(attributeName, systemId)
  return systemId
}

/**
 * Resolve (creating if needed) the supertag node backing a TIF supertag
 * entry. Returns the systemId (not the node UUID) since callers hand it
 * straight to `addNodeSupertag`.
 */
function ensureTifSupertag(tx: Db, usedSystemIds: Set<string>, tag: TanaIntermediateSupertag): string {
  const slug = slugify(tag.name) || 'tag'
  let systemId = `supertag:tif_${slug}`
  const existing = getSystemNode(tx, systemId)

  if (!existing && usedSystemIds.has(systemId)) {
    let n = 2
    while (usedSystemIds.has(`${systemId}_${n}`)) n++
    systemId = `${systemId}_${n}`
  }
  usedSystemIds.add(systemId)

  if (!existing) {
    createNode(tx, { content: `#${tag.name}`, systemId, supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
  }
  return systemId
}

// ============================================================================
// Import context (mutable accumulator threaded through both passes)
// ============================================================================

interface PendingNode {
  tifNode: TanaIntermediateNode
  newId: string
}

interface DeferredField {
  ownerNewId: string
  tifNode: TanaIntermediateNode
}

interface ImportContext {
  uidMap: Map<string, string>
  pendingNodes: PendingNode[]
  deferredFields: DeferredField[]
  skipped: ImportTifSkipped[]
  brokenRefs: number
  refsResolved: number
  fieldsImported: number
}

// ============================================================================
// Pass 1 — structure + uid mapping
// ============================================================================

function walkCreate(
  tx: Db,
  tifNode: TanaIntermediateNode,
  ownerNewId: string | undefined,
  siblingOrder: number,
  ctx: ImportContext,
  supertagUidMap: Map<string, string>,
): void {
  if (tifNode.type === 'field') {
    if (ownerNewId === undefined) {
      ctx.skipped.push({ uid: tifNode.uid, reason: 'top-level field carrier has no owner node to attach to' })
      return
    }
    ctx.deferredFields.push({ ownerNewId, tifNode })
    return
  }

  if (ctx.uidMap.has(tifNode.uid)) {
    throw new Error(`tif-import: duplicate uid '${tifNode.uid}' in TanaIntermediateFile`)
  }

  const newId = createNode(tx, { content: tifNode.name, ownerId: ownerNewId })
  ctx.uidMap.set(tifNode.uid, newId)
  ctx.pendingNodes.push({ tifNode, newId })
  setProperty(tx, newId, SYSTEM_FIELDS.ORDER, siblingOrder)

  for (const supertagUid of tifNode.supertags ?? []) {
    const supertagSystemId = supertagUidMap.get(supertagUid)
    if (!supertagSystemId) {
      ctx.brokenRefs++
      ctx.skipped.push({ uid: supertagUid, reason: `unknown supertag uid referenced by node '${tifNode.uid}'` })
      continue
    }
    addNodeSupertag(tx, newId, supertagSystemId)
  }

  let childOrder = 0
  for (const child of tifNode.children ?? []) {
    const isField = child.type === 'field'
    walkCreate(tx, child, newId, childOrder, ctx, supertagUidMap)
    if (!isField) childOrder++
  }
}

// ============================================================================
// Public entry point
// ============================================================================

export function importTanaIntermediateFile(
  db: Db,
  input: unknown,
  options: ImportTifOptions = {},
): ImportTifSummary {
  // Parse BEFORE opening a transaction — an invalid file must never touch the DB.
  const tif = TanaIntermediateFileSchema.parse(input)

  return withNodeMutationTransaction(db, (tx) => {
    const ctx: ImportContext = {
      uidMap: new Map(),
      pendingNodes: [],
      deferredFields: [],
      skipped: [],
      brokenRefs: 0,
      refsResolved: 0,
      fieldsImported: 0,
    }

    const usedSystemIds = new Set<string>()
    const supertagUidMap = new Map<string, string>()
    for (const tag of tif.supertags ?? []) {
      supertagUidMap.set(tag.uid, ensureTifSupertag(tx, usedSystemIds, tag))
    }

    const topLevelNodeIds: string[] = []
    let topLevelOrder = 0
    for (const topNode of tif.nodes) {
      const isField = topNode.type === 'field'
      const beforeLen = ctx.pendingNodes.length
      walkCreate(tx, topNode, options.ownerId, topLevelOrder, ctx, supertagUidMap)
      if (!isField) {
        topLevelOrder++
        // `walkCreate` pushes the top node's own PendingNode entry before
        // recursing into its children, so this index is always the top node.
        const created = ctx.pendingNodes[beforeLen]
        if (created) topLevelNodeIds.push(created.newId)
      }
    }

    // ---- Pass 2a: content/description ref resolution, timestamps, type-specific fields ----
    const markerFieldCache = new Map<string, FieldSystemId>()

    for (const { tifNode, newId } of ctx.pendingNodes) {
      const rawText = `${tifNode.name}\n${tifNode.description ?? ''}`
      const rewrittenName = rewriteInlineRefs(tifNode.name, ctx.uidMap, () => ctx.brokenRefs++)
      const finalContent = appendResolvedRefTokens(
        rewrittenName,
        rawText,
        tifNode.refs,
        ctx.uidMap,
        () => ctx.brokenRefs++,
        () => ctx.refsResolved++,
      )
      if (finalContent !== tifNode.name) {
        updateNodeContent(tx, newId, finalContent)
      }

      if (tifNode.description) {
        const rewrittenDesc = rewriteInlineRefs(tifNode.description, ctx.uidMap, () => ctx.brokenRefs++)
        setProperty(tx, newId, SYSTEM_FIELDS.DESCRIPTION, rewrittenDesc)
      }

      applyOriginalTimestamps(tx, newId, tifNode.createdAt, tifNode.editedAt)

      // `type:'node'` is the overwhelming common case — no marker needed for it.
      if (tifNode.type !== 'node') {
        const nodeTypeField = ensureMarkerField(tx, markerFieldCache, 'field:tif_node_type', 'TIF node type', 'text')
        setProperty(tx, newId, nodeTypeField, tifNode.type)
      }
      if (tifNode.type === 'image') {
        const mediaField = ensureMarkerField(tx, markerFieldCache, 'field:tif_media_url', 'TIF media URL', 'url')
        setProperty(tx, newId, mediaField, tifNode.mediaUrl ?? '')
      }
      if (tifNode.type === 'codeblock') {
        const codeField = ensureMarkerField(tx, markerFieldCache, 'field:tif_code_language', 'TIF code language', 'text')
        setProperty(tx, newId, codeField, tifNode.codeLanguage ?? '')
      }
      // TIF todoState maps onto the engine's canonical checkbox field
      // (field:todo_state, 'todo' | 'done' — spec/product/data-model.md).
      if (tifNode.todoState) {
        setProperty(tx, newId, SYSTEM_FIELDS.TODO_STATE, tifNode.todoState)
      }
      if (tifNode.flags && tifNode.flags.length > 0) {
        const flagsField = ensureMarkerField(tx, markerFieldCache, 'field:tif_flags', 'TIF flags', 'json')
        setProperty(tx, newId, flagsField, tifNode.flags)
      }
      // viewType maps onto the existing engine concept (`field:view_as`)
      // instead of a redundant TIF-only field.
      if (tifNode.viewType) {
        setProperty(tx, newId, SYSTEM_FIELDS.VIEW_AS, tifNode.viewType === 'table' ? 'table' : 'outline')
      }
    }

    // ---- Pass 2b: materialize deferred `type:'field'` carriers as properties ----
    const attributesByName = new Map((tif.attributes ?? []).map((a) => [a.name, a] as const))
    const fieldRegistry = new Map<string, string>()

    for (const { ownerNewId, tifNode } of ctx.deferredFields) {
      const attributeName = tifNode.name
      if (!attributeName) {
        ctx.skipped.push({ uid: tifNode.uid, reason: 'field carrier has an empty attribute name' })
        continue
      }
      const declared = attributesByName.get(attributeName)
      const fieldSystemId = getOrCreateAttributeField(tx, fieldRegistry, usedSystemIds, attributeName, declared?.dataType)
      ctx.fieldsImported++

      for (const valueChild of tifNode.children ?? []) {
        if (valueChild.type === 'field') {
          ctx.skipped.push({ uid: valueChild.uid, reason: 'nested field carrier under a field carrier is not supported' })
          continue
        }
        const rewritten = rewriteInlineRefs(valueChild.name, ctx.uidMap, () => ctx.brokenRefs++)
        const coerced = coerceFieldValue(rewritten, declared?.dataType)
        addPropertyValue(tx, ownerNewId, fieldSystemId as FieldSystemId, coerced)
      }
    }

    const topLevelNodesImported = tif.nodes.filter((n) => n.type !== 'field').length

    return {
      nodesImported: ctx.pendingNodes.length,
      topLevelNodesImported,
      supertagsImported: supertagUidMap.size,
      fieldsImported: ctx.fieldsImported,
      refsResolved: ctx.refsResolved,
      brokenRefs: ctx.brokenRefs,
      skipped: ctx.skipped,
      topLevelNodeIds,
    } satisfies ImportTifSummary
  })
}
