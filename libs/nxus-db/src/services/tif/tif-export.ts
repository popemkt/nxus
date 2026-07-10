/**
 * tif-export.ts - Export a node (or the whole graph) to Tana Intermediate
 * Format v0.1.
 *
 * Mirrors the import side's conventions so a round trip is stable:
 *  - The exported `uid` for every node/supertag IS the node's real database
 *    id (no separate id scheme to keep in sync).
 *  - `[[node:<id>]]` content tokens become bare `[[<id>]]` tokens (the TIF
 *    wire convention) by stripping the `node:` prefix — no remapping needed
 *    since uid === id.
 *  - `field:mentions` (derived, never authored — see data-model.md §3.5) is
 *    reported both inline (already in content) and in the `refs[]` array,
 *    matching how Tana's own exports duplicate the two.
 *  - Ordinary field values (anything not one of the engine-internal/TIF
 *    marker fields) are re-emitted as synthetic `type:'field'` carrier
 *    children, one per field, holding one value child per stored
 *    `PropertyValue` — the inverse of the deferred-field pass in
 *    tif-import.ts.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { nodes, FIELD_NAMES, type FieldContentName } from '../../schemas/node-schema.js'
import type { getDatabase } from '../../client/master-client.js'
import { assembleNodes, findNodeById, getProperty, getPropertyValues, type AssembledNode } from '../node.service.js'
import type { JsonValue } from '../../types/common.js'
import type {
  TanaIntermediateAttribute,
  TanaIntermediateFile,
  TanaIntermediateNode,
  TanaIntermediateSummary,
  TanaIntermediateSupertag,
  TifAttributeDataType,
  TifFlagType,
  TifNodeType,
  TifTodoState,
  TifViewType,
} from './tif-types.js'

type Db = ReturnType<typeof getDatabase>

/** Our own `[[node:<uuid>]]` convention (see node.service.ts INLINE_MENTION_TOKEN_PATTERN). */
const NODE_REF_TOKEN =
  /\[\[node:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g

function toTifRefs(text: string): string {
  return text.replace(NODE_REF_TOKEN, (_match, id: string) => `[[${id}]]`)
}

/** Content names created by tif-import.ts's `ensureMarkerField` — excluded from generic field-carrier export. */
const TIF_MARKER_CONTENT = {
  NODE_TYPE: 'TIF node type' as FieldContentName,
  MEDIA_URL: 'TIF media URL' as FieldContentName,
  CODE_LANGUAGE: 'TIF code language' as FieldContentName,
  TODO_STATE: 'TIF todo state' as FieldContentName,
  FLAGS: 'TIF flags' as FieldContentName,
}

const EXCLUDED_FIELD_NAMES = new Set<string>([
  FIELD_NAMES.SUPERTAG,
  FIELD_NAMES.EXTENDS,
  FIELD_NAMES.FIELD_TYPE,
  FIELD_NAMES.BASE_TYPE,
  FIELD_NAMES.FORMULA,
  FIELD_NAMES.MENTIONS,
  FIELD_NAMES.ORDER,
  FIELD_NAMES.VIEW_AS,
  FIELD_NAMES.DESCRIPTION,
  TIF_MARKER_CONTENT.NODE_TYPE,
  TIF_MARKER_CONTENT.MEDIA_URL,
  TIF_MARKER_CONTENT.CODE_LANGUAGE,
  TIF_MARKER_CONTENT.TODO_STATE,
  TIF_MARKER_CONTENT.FLAGS,
])

function mapFieldTypeToDataType(fieldType: string | undefined): TifAttributeDataType {
  switch (fieldType) {
    case 'url':
      return 'url'
    case 'email':
      return 'email'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'boolean':
      return 'checkbox'
    default:
      return 'any'
  }
}

function formatFieldValueForExport(value: JsonValue, rawFieldType: string | undefined): string {
  if (rawFieldType === 'boolean') return value === true ? 'True' : 'False'
  if ((rawFieldType === 'node' || rawFieldType === 'nodes') && typeof value === 'string') return `[[${value}]]`
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

interface AttributeAccumulator {
  name: string
  values: Set<string>
  count: number
  dataType: TifAttributeDataType
}

interface ExportContext {
  supertagsSeen: Map<string, string>
  attributesSeen: Map<string, AttributeAccumulator>
  totalNodeObjects: number
  leafCount: number
  calendarCount: number
  fieldApplications: number
  brokenRefs: number
}

function getChildrenOrdered(db: Db, ownerId: string | null): AssembledNode[] {
  const rows =
    ownerId === null
      ? db
          .select({ id: nodes.id })
          .from(nodes)
          .where(and(isNull(nodes.ownerId), isNull(nodes.deletedAt)))
          .all()
      : db
          .select({ id: nodes.id })
          .from(nodes)
          .where(and(eq(nodes.ownerId, ownerId), isNull(nodes.deletedAt)))
          .all()

  const assembled = assembleNodes(db, rows.map((r) => r.id))
  return assembled.sort((a, b) => {
    const orderA = getProperty<number>(a, FIELD_NAMES.ORDER) ?? Number.MAX_SAFE_INTEGER
    const orderB = getProperty<number>(b, FIELD_NAMES.ORDER) ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    const createdA = a.createdAt.getTime()
    const createdB = b.createdAt.getTime()
    if (createdA !== createdB) return createdA - createdB
    return a.id.localeCompare(b.id)
  })
}

function buildFieldCarriers(db: Db, assembled: AssembledNode, ctx: ExportContext): TanaIntermediateNode[] {
  const entries = Object.entries(assembled.properties)
    .filter(([fieldName, values]) => values.length > 0 && !EXCLUDED_FIELD_NAMES.has(fieldName))
    .sort(([a], [b]) => a.localeCompare(b))

  const carriers: TanaIntermediateNode[] = []

  for (const [fieldName, values] of entries) {
    const fieldSystemId = values[0].fieldSystemId
    const attrKey = fieldSystemId ?? `unkeyed:${fieldName}`
    const sortedValues = [...values].sort((a, b) => a.order - b.order)

    let rawFieldType: string | undefined
    let cachedAttr = ctx.attributesSeen.get(attrKey)
    if (!cachedAttr) {
      const fieldNode = findNodeById(db, values[0].fieldNodeId)
      rawFieldType = fieldNode ? getProperty<string>(fieldNode, FIELD_NAMES.FIELD_TYPE) : undefined
      cachedAttr = { name: fieldName, values: new Set(), count: 0, dataType: mapFieldTypeToDataType(rawFieldType) }
      ctx.attributesSeen.set(attrKey, cachedAttr)
    }

    const valueChildren: TanaIntermediateNode[] = sortedValues.map((pv, i) => {
      ctx.totalNodeObjects++
      const text = formatFieldValueForExport(pv.value, rawFieldType)
      cachedAttr!.values.add(text)
      cachedAttr!.count++
      return {
        uid: `${assembled.id}__${attrKey}__v${i}`,
        name: text,
        createdAt: assembled.createdAt.getTime(),
        editedAt: assembled.updatedAt.getTime(),
        type: 'node',
      }
    })

    ctx.totalNodeObjects++ // the field carrier node itself
    ctx.fieldApplications++

    carriers.push({
      uid: `${assembled.id}__field__${attrKey}`,
      name: fieldName,
      children: valueChildren,
      createdAt: assembled.createdAt.getTime(),
      editedAt: assembled.updatedAt.getTime(),
      type: 'field',
    })
  }

  return carriers
}

function buildTifNode(db: Db, assembled: AssembledNode, ctx: ExportContext): TanaIntermediateNode {
  ctx.totalNodeObjects++

  const name = toTifRefs(assembled.content ?? '')

  const rawDescription = getProperty<string>(assembled, FIELD_NAMES.DESCRIPTION)
  const description = rawDescription ? toTifRefs(rawDescription) : undefined

  const mentionIds = getPropertyValues<string>(assembled, FIELD_NAMES.MENTIONS)
  const resolvedRefs: string[] = []
  for (const id of mentionIds) {
    if (findNodeById(db, id)) resolvedRefs.push(id)
    else ctx.brokenRefs++
  }
  const refs = resolvedRefs.length > 0 ? resolvedRefs : undefined

  const rawNodeType = getProperty<string>(assembled, TIF_MARKER_CONTENT.NODE_TYPE)
  const type: TifNodeType =
    rawNodeType === 'date' || rawNodeType === 'image' || rawNodeType === 'codeblock' ? rawNodeType : 'node'
  if (type === 'date') ctx.calendarCount++

  const mediaUrl = type === 'image' ? getProperty<string>(assembled, TIF_MARKER_CONTENT.MEDIA_URL) : undefined
  const codeLanguage = type === 'codeblock' ? getProperty<string>(assembled, TIF_MARKER_CONTENT.CODE_LANGUAGE) : undefined

  const rawTodoState = getProperty<string>(assembled, TIF_MARKER_CONTENT.TODO_STATE)
  const todoState: TifTodoState | undefined =
    rawTodoState === 'todo' || rawTodoState === 'done' ? rawTodoState : undefined

  const flags = getProperty<TifFlagType[]>(assembled, TIF_MARKER_CONTENT.FLAGS)

  const rawViewAs = getProperty<string>(assembled, FIELD_NAMES.VIEW_AS)
  const viewType: TifViewType | undefined = rawViewAs === 'table' ? 'table' : rawViewAs === 'outline' ? 'list' : undefined

  for (const st of assembled.supertags) {
    if (!ctx.supertagsSeen.has(st.id)) {
      ctx.supertagsSeen.set(st.id, st.content.replace(/^#/, ''))
    }
  }
  const supertags = assembled.supertags.length > 0 ? assembled.supertags.map((st) => st.id) : undefined

  const fieldCarriers = buildFieldCarriers(db, assembled, ctx)
  const childNodes = getChildrenOrdered(db, assembled.id).map((child) => buildTifNode(db, child, ctx))
  const children = [...fieldCarriers, ...childNodes]
  if (children.length === 0) ctx.leafCount++

  const result: TanaIntermediateNode = {
    uid: assembled.id,
    name,
    createdAt: assembled.createdAt.getTime(),
    editedAt: assembled.updatedAt.getTime(),
    type,
  }
  if (description !== undefined) result.description = description
  if (children.length > 0) result.children = children
  if (refs !== undefined) result.refs = refs
  if (mediaUrl !== undefined) result.mediaUrl = mediaUrl
  if (codeLanguage !== undefined) result.codeLanguage = codeLanguage
  if (supertags !== undefined) result.supertags = supertags
  if (flags !== undefined && flags.length > 0) result.flags = flags
  if (viewType !== undefined) result.viewType = viewType
  if (todoState !== undefined) result.todoState = todoState

  return result
}

/**
 * Export a node and its full subtree to a TIF file. Pass `null` to export
 * the whole graph (every root-level node, i.e. `ownerId IS NULL`).
 */
export function exportSubtreeToTif(db: Db, rootNodeId: string | null): TanaIntermediateFile {
  const ctx: ExportContext = {
    supertagsSeen: new Map(),
    attributesSeen: new Map(),
    totalNodeObjects: 0,
    leafCount: 0,
    calendarCount: 0,
    fieldApplications: 0,
    brokenRefs: 0,
  }

  let topNodes: TanaIntermediateNode[]
  if (rootNodeId === null) {
    topNodes = getChildrenOrdered(db, null).map((root) => buildTifNode(db, root, ctx))
  } else {
    const root = findNodeById(db, rootNodeId)
    if (!root) throw new Error(`tif-export: node not found: ${rootNodeId}`)
    topNodes = [buildTifNode(db, root, ctx)]
  }

  const attributes: TanaIntermediateAttribute[] = [...ctx.attributesSeen.values()].map((attr) => ({
    name: attr.name,
    values: [...attr.values],
    count: attr.count,
    dataType: attr.dataType,
  }))

  const supertags: TanaIntermediateSupertag[] = [...ctx.supertagsSeen.entries()].map(([uid, name]) => ({ uid, name }))

  const summary: TanaIntermediateSummary = {
    leafNodes: ctx.leafCount,
    topLevelNodes: topNodes.length,
    totalNodes: ctx.totalNodeObjects,
    calendarNodes: ctx.calendarCount,
    fields: ctx.fieldApplications,
    brokenRefs: ctx.brokenRefs,
  }

  return {
    version: 'TanaIntermediateFile V0.1',
    summary,
    nodes: topNodes,
    ...(attributes.length > 0 ? { attributes } : {}),
    ...(supertags.length > 0 ? { supertags } : {}),
  }
}
