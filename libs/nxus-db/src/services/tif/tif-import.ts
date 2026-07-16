/**
 * tif-import.ts - Import a Tana Intermediate Format (TIF) v0.1 file into the
 * node graph, through the NodeBackend facade (works on both backends).
 *
 * Strategy: because BulkNodeSpec ids are caller-allocated (generateNodeId),
 * the ENTIRE uid -> new-id map exists before anything is written. The import
 * is therefore pure spec-building — inline `[[uid]]` tokens, the top-level
 * `refs[]` array, and deferred `type:'field'` carriers are all resolved while
 * assembling specs — followed by ONE createNodesBulk call.
 *
 * `type:'field'` TIF nodes are NOT outline nodes — per TIF semantics they are
 * field-value carriers, so they materialize as properties on their owner spec
 * instead of children.
 *
 * Atomicity: the Zod parse and the duplicate-uid check happen before any
 * write. The bulk write itself is one transaction on SQLite; on SurrealDB it
 * commits in chunks (see createNodesBulk) — persistence.md records this.
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  type FieldType,
} from '../../schemas/node-schema.js'
import { generateNodeId } from '../node.service.js'
import type { BulkNodeSpec, BulkPropertySpec, NodeBackend } from '../backends/types.js'
import {
  TanaIntermediateFileSchema,
  type TanaIntermediateNode,
  type TanaIntermediateSupertag,
  type TifAttributeDataType,
} from './tif-types.js'

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

function toDateOr(fallback: Date, ms: number): Date {
  return Number.isFinite(ms) ? new Date(ms) : fallback
}

// ============================================================================
// Definition registry — dedups supertag/field definition specs, reusing
// nodes a previous import already created in the same database.
// ============================================================================

/**
 * Tracks systemIds claimed during THIS import (for slug-collision suffixing)
 * and the definition specs to prepend to the batch.
 */
class DefinitionRegistry {
  readonly defSpecs: BulkNodeSpec[] = []
  private readonly usedSystemIds = new Set<string>()
  private readonly existsCache = new Map<string, boolean>()

  constructor(private readonly backend: NodeBackend) {}

  private async exists(systemId: string): Promise<boolean> {
    const cached = this.existsCache.get(systemId)
    if (cached !== undefined) return cached
    const node = await this.backend.findNodeBySystemId(systemId)
    const result = node !== null
    this.existsCache.set(systemId, result)
    return result
  }

  /** Resolve a systemId candidate, suffixing on within-file slug collisions. */
  private async claimSystemId(candidate: string): Promise<{ systemId: string; existed: boolean }> {
    const existed = await this.exists(candidate)
    let systemId = candidate
    if (!existed && this.usedSystemIds.has(candidate)) {
      let n = 2
      while (this.usedSystemIds.has(`${candidate}_${n}`)) n++
      systemId = `${candidate}_${n}`
    }
    this.usedSystemIds.add(systemId)
    return { systemId, existed: existed && systemId === candidate }
  }

  /** Supertag definition backing a TIF supertag entry. Returns its systemId. */
  async ensureSupertag(tag: TanaIntermediateSupertag): Promise<string> {
    const slug = slugify(tag.name) || 'tag'
    const { systemId, existed } = await this.claimSystemId(`supertag:tif_${slug}`)
    if (!existed) {
      this.defSpecs.push({
        id: generateNodeId(),
        content: `#${tag.name}`,
        systemId,
        supertagSystemIds: [SYSTEM_SUPERTAGS.SUPERTAG],
      })
    }
    return systemId
  }

  /** Field definition backing a TIF attribute name. Returns its systemId. */
  async ensureAttributeField(
    attributeName: string,
    dataType: TifAttributeDataType | undefined,
  ): Promise<string> {
    const slug = slugify(attributeName) || 'field'
    const { systemId, existed } = await this.claimSystemId(`field:tif_${slug}`)
    if (!existed) {
      this.defSpecs.push({
        id: generateNodeId(),
        content: attributeName,
        systemId,
        supertagSystemIds: [SYSTEM_SUPERTAGS.FIELD],
        properties: [
          { fieldSystemId: SYSTEM_FIELDS.FIELD_TYPE as string, value: mapDataTypeToFieldType(dataType) },
        ],
      })
    }
    return systemId
  }

  /** Engine-internal marker field with a FIXED systemId (never suffixed). */
  async ensureMarkerField(systemId: string, content: string, fieldType: FieldType): Promise<string> {
    if (this.usedSystemIds.has(systemId)) return systemId
    const existed = await this.exists(systemId)
    this.usedSystemIds.add(systemId)
    if (!existed) {
      this.defSpecs.push({
        id: generateNodeId(),
        content,
        systemId,
        supertagSystemIds: [SYSTEM_SUPERTAGS.FIELD],
        properties: [
          { fieldSystemId: SYSTEM_FIELDS.FIELD_TYPE as string, value: fieldType },
        ],
      })
    }
    return systemId
  }
}

// ============================================================================
// Walk state
// ============================================================================

interface WalkedNode {
  tifNode: TanaIntermediateNode
  newId: string
  ownerNewId: string | undefined
  siblingOrder: number
}

interface DeferredField {
  ownerNewId: string
  tifNode: TanaIntermediateNode
}

interface ImportContext {
  uidMap: Map<string, string>
  walked: WalkedNode[]
  deferredFields: DeferredField[]
  skipped: ImportTifSkipped[]
  brokenRefs: number
  refsResolved: number
  fieldsImported: number
}

/** Pass 1 — walk the tree, allocate ids, build the complete uid map. */
function walkAllocate(
  tifNode: TanaIntermediateNode,
  ownerNewId: string | undefined,
  siblingOrder: number,
  ctx: ImportContext,
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

  const newId = generateNodeId()
  ctx.uidMap.set(tifNode.uid, newId)
  ctx.walked.push({ tifNode, newId, ownerNewId, siblingOrder })

  let childOrder = 0
  for (const child of tifNode.children ?? []) {
    const isField = child.type === 'field'
    walkAllocate(child, newId, childOrder, ctx)
    if (!isField) childOrder++
  }
}

// ============================================================================
// Public entry point
// ============================================================================

export async function importTanaIntermediateFile(
  backend: NodeBackend,
  input: unknown,
  options: ImportTifOptions = {},
): Promise<ImportTifSummary> {
  // Parse BEFORE anything else — an invalid file must never touch the DB.
  const tif = TanaIntermediateFileSchema.parse(input)

  const ctx: ImportContext = {
    uidMap: new Map(),
    walked: [],
    deferredFields: [],
    skipped: [],
    brokenRefs: 0,
    refsResolved: 0,
    fieldsImported: 0,
  }

  const registry = new DefinitionRegistry(backend)

  const supertagUidMap = new Map<string, string>()
  for (const tag of tif.supertags ?? []) {
    supertagUidMap.set(tag.uid, await registry.ensureSupertag(tag))
  }

  // Pass 1 — allocate ids + complete the uid map (duplicate uids throw here,
  // before any write exists to roll back).
  const topLevelNodeIds: string[] = []
  let topLevelOrder = 0
  for (const topNode of tif.nodes) {
    const isField = topNode.type === 'field'
    walkAllocate(topNode, options.ownerId, topLevelOrder, ctx)
    if (!isField) {
      topLevelOrder++
      const newId = ctx.uidMap.get(topNode.uid)
      if (newId) topLevelNodeIds.push(newId)
    }
  }

  // Pass 2 — build one spec per walked node with FINAL content (refs resolved
  // against the complete uid map) and all properties.
  const nodeSpecs = new Map<string, BulkNodeSpec>()

  for (const { tifNode, newId, ownerNewId, siblingOrder } of ctx.walked) {
    const rawText = `${tifNode.name}\n${tifNode.description ?? ''}`
    const rewrittenName = rewriteInlineRefs(tifNode.name, ctx.uidMap, () => ctx.brokenRefs++)
    const content = appendResolvedRefTokens(
      rewrittenName,
      rawText,
      tifNode.refs,
      ctx.uidMap,
      () => ctx.brokenRefs++,
      () => ctx.refsResolved++,
    )

    const createdAt = toDateOr(new Date(), tifNode.createdAt)
    const properties: BulkPropertySpec[] = [
      { fieldSystemId: SYSTEM_FIELDS.ORDER as string, value: siblingOrder },
    ]

    if (tifNode.description) {
      properties.push({
        fieldSystemId: SYSTEM_FIELDS.DESCRIPTION as string,
        value: rewriteInlineRefs(tifNode.description, ctx.uidMap, () => ctx.brokenRefs++),
      })
    }

    // `type:'node'` is the overwhelming common case — no marker needed for it.
    if (tifNode.type !== 'node') {
      const marker = await registry.ensureMarkerField('field:tif_node_type', 'TIF node type', 'text')
      properties.push({ fieldSystemId: marker, value: tifNode.type })
    }
    if (tifNode.type === 'image') {
      const marker = await registry.ensureMarkerField('field:tif_media_url', 'TIF media URL', 'url')
      properties.push({ fieldSystemId: marker, value: tifNode.mediaUrl ?? '' })
    }
    if (tifNode.type === 'codeblock') {
      const marker = await registry.ensureMarkerField('field:tif_code_language', 'TIF code language', 'text')
      properties.push({ fieldSystemId: marker, value: tifNode.codeLanguage ?? '' })
    }
    // TIF todoState maps onto the engine's canonical checkbox field
    // (field:todo_state, 'todo' | 'done' — spec/product/data-model.md).
    if (tifNode.todoState) {
      properties.push({ fieldSystemId: SYSTEM_FIELDS.TODO_STATE as string, value: tifNode.todoState })
    }
    if (tifNode.flags && tifNode.flags.length > 0) {
      const marker = await registry.ensureMarkerField('field:tif_flags', 'TIF flags', 'json')
      properties.push({ fieldSystemId: marker, value: tifNode.flags })
    }
    // viewType maps onto the existing engine concept (`field:view_as`)
    // instead of a redundant TIF-only field.
    if (tifNode.viewType) {
      properties.push({
        fieldSystemId: SYSTEM_FIELDS.VIEW_AS as string,
        value: tifNode.viewType === 'table' ? 'table' : 'outline',
      })
    }

    const supertagSystemIds: string[] = []
    for (const supertagUid of tifNode.supertags ?? []) {
      const supertagSystemId = supertagUidMap.get(supertagUid)
      if (!supertagSystemId) {
        ctx.brokenRefs++
        ctx.skipped.push({ uid: supertagUid, reason: `unknown supertag uid referenced by node '${tifNode.uid}'` })
        continue
      }
      supertagSystemIds.push(supertagSystemId)
    }

    nodeSpecs.set(newId, {
      id: newId,
      content,
      ownerId: ownerNewId,
      supertagSystemIds,
      properties,
      createdAt,
      updatedAt: toDateOr(createdAt, tifNode.editedAt),
    })
  }

  // Pass 3 — materialize deferred `type:'field'` carriers as properties on
  // their owner's spec. Multi-value ordering counts per (owner, field).
  const attributesByName = new Map((tif.attributes ?? []).map((a) => [a.name, a] as const))
  const attributeFieldRegistry = new Map<string, string>()
  const valueOrderCounters = new Map<string, number>()

  for (const { ownerNewId, tifNode } of ctx.deferredFields) {
    const attributeName = tifNode.name
    if (!attributeName) {
      ctx.skipped.push({ uid: tifNode.uid, reason: 'field carrier has an empty attribute name' })
      continue
    }
    const declared = attributesByName.get(attributeName)
    let fieldSystemId = attributeFieldRegistry.get(attributeName)
    if (!fieldSystemId) {
      fieldSystemId = await registry.ensureAttributeField(attributeName, declared?.dataType)
      attributeFieldRegistry.set(attributeName, fieldSystemId)
    }
    ctx.fieldsImported++

    const ownerSpec = nodeSpecs.get(ownerNewId)
    if (!ownerSpec) continue // owner was skipped — nothing to attach to

    for (const valueChild of tifNode.children ?? []) {
      if (valueChild.type === 'field') {
        ctx.skipped.push({ uid: valueChild.uid, reason: 'nested field carrier under a field carrier is not supported' })
        continue
      }
      const rewritten = rewriteInlineRefs(valueChild.name, ctx.uidMap, () => ctx.brokenRefs++)
      const coerced = coerceFieldValue(rewritten, declared?.dataType)
      const counterKey = `${ownerNewId}::${fieldSystemId}`
      const order = valueOrderCounters.get(counterKey) ?? 0
      valueOrderCounters.set(counterKey, order + 1)
      ownerSpec.properties = ownerSpec.properties ?? []
      ownerSpec.properties.push({ fieldSystemId, value: coerced, order })
    }
  }

  // The single write: definitions first, then nodes in walk order.
  const orderedSpecs = [
    ...registry.defSpecs,
    ...ctx.walked.map(({ newId }) => nodeSpecs.get(newId)!),
  ]
  const canonicalIds = await backend.createNodesBulk(orderedSpecs)

  // The backend may canonicalize ids (Surreal: 'node:<uuid>') — report ids
  // in the form the backend's own read methods expect.
  const canonicalById = new Map(orderedSpecs.map((spec, i) => [spec.id, canonicalIds[i]] as const))

  const topLevelNodesImported = tif.nodes.filter((n) => n.type !== 'field').length

  return {
    nodesImported: ctx.walked.length,
    topLevelNodesImported,
    supertagsImported: supertagUidMap.size,
    fieldsImported: ctx.fieldsImported,
    refsResolved: ctx.refsResolved,
    brokenRefs: ctx.brokenRefs,
    skipped: ctx.skipped,
    topLevelNodeIds: topLevelNodeIds.map((id) => canonicalById.get(id) ?? id),
  } satisfies ImportTifSummary
}
