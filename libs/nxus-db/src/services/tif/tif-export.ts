/**
 * tif-export.ts - Export a node (or the whole graph) to Tana Intermediate
 * Format v0.1, through the NodeBackend facade (works on both backends).
 *
 * Mirrors the import side's conventions so a round trip is stable:
 * - the exported `uid` of every node/supertag IS the node's database id in
 *   bare form (Surreal's `node:` prefix stripped) — no separate id scheme.
 * - `[[node:<id>]]` content tokens become bare `[[<id>]]` tokens (the TIF
 *   wire convention).
 * - `field:mentions` (derived, never authored — data-model.md §3.5) is
 *   reported both inline (already in content) and in the `refs[]` array,
 *   matching how Tana's own exports duplicate the two.
 * - Ordinary field values (anything not one of the engine-internal/TIF
 *   marker fields) are re-emitted as synthetic `type:'field'` carrier
 *   children, one per field, holding one value child per stored
 *   `PropertyValue` — the inverse of the deferred-field pass in
 *   tif-import.ts.
 */

import { FIELD_NAMES, type FieldContentName } from '../../schemas/node-schema.js'
import { getProperty, getPropertyValues } from '../node.service.js'
import type { AssembledNode } from '../../types/node.js'
import type { NodeBackend } from '../backends/types.js'
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

/** Our own `[[node:<uuid>]]` convention (see node.service.ts INLINE_MENTION_TOKEN_PATTERN). */
const NODE_REF_TOKEN =
  /\[\[node:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g

function toTifRefs(text: string): string {
  return text.replace(NODE_REF_TOKEN, (_m, id: string) => `[[${id}]]`)
}

/** TIF uids are backend-agnostic bare ids — strip Surreal's table prefix. */
function tifUid(id: string): string {
  return id.replace(/^node:/, '')
}

/** Content names of the marker fields tif-import.ts creates. */
const TIF_MARKER_CONTENT = {
  NODE_TYPE: 'TIF node type' as FieldContentName,
  MEDIA_URL: 'TIF media URL' as FieldContentName,
  CODE_LANGUAGE: 'TIF code language' as FieldContentName,
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
  FIELD_NAMES.TODO_STATE,
  FIELD_NAMES.DESCRIPTION,
  TIF_MARKER_CONTENT.NODE_TYPE,
  TIF_MARKER_CONTENT.MEDIA_URL,
  TIF_MARKER_CONTENT.CODE_LANGUAGE,
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
  if ((rawFieldType === 'node' || rawFieldType === 'nodes') && typeof value === 'string') return `[[${tifUid(value)}]]`
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

async function getChildrenOrdered(backend: NodeBackend, ownerId: string): Promise<AssembledNode[]> {
  // getChildrenByParents already returns outline order (field:order, then
  // createdAt, then id) — the backend contract proven by BULK/children tests.
  const byParent = await backend.getChildrenByParents([ownerId])
  return byParent.get(ownerId) ?? []
}

/** Resolve the raw field_type of the field-definition node behind a property. */
async function resolveRawFieldType(
  backend: NodeBackend,
  fieldSystemId: string | null,
  fieldNodeId: string,
): Promise<string | undefined> {
  const fieldNode = fieldSystemId
    ? await backend.findNodeBySystemId(fieldSystemId)
    : await backend.findNodeById(fieldNodeId)
  if (!fieldNode) return undefined
  return getProperty<string>(fieldNode, FIELD_NAMES.FIELD_TYPE) ?? undefined
}

async function buildFieldCarriers(
  backend: NodeBackend,
  assembled: AssembledNode,
  ctx: ExportContext,
): Promise<TanaIntermediateNode[]> {
  const entries = Object.entries(assembled.properties)
    .filter(([fieldName, values]) => values.length > 0 && !EXCLUDED_FIELD_NAMES.has(fieldName))
    .sort(([a], [b]) => a.localeCompare(b))

  const carriers: TanaIntermediateNode[] = []

  for (const [fieldName, values] of entries) {
    const fieldSystemId = values[0].fieldSystemId
    const attrKey = fieldSystemId ?? `unkeyed:${fieldName}`
    const sortedValues = [...values].sort((a, b) => a.order - b.order)

    let cachedAttr = ctx.attributesSeen.get(attrKey)
    let rawFieldType: string | undefined
    if (!cachedAttr) {
      rawFieldType = await resolveRawFieldType(backend, fieldSystemId, values[0].fieldNodeId)
      cachedAttr = {
        name: fieldName,
        values: new Set(),
        count: 0,
        dataType: mapFieldTypeToDataType(rawFieldType),
      }
      ctx.attributesSeen.set(attrKey, cachedAttr)
    } else {
      // Re-derive for value formatting from the accumulated dataType.
      rawFieldType =
        cachedAttr.dataType === 'checkbox'
          ? 'boolean'
          : cachedAttr.dataType === 'any'
            ? undefined
            : cachedAttr.dataType
    }

    const valueChildren: TanaIntermediateNode[] = sortedValues.map((pv, i) => {
      ctx.totalNodeObjects++
      const text = formatFieldValueForExport(pv.value, rawFieldType)
      cachedAttr!.values.add(text)
      cachedAttr!.count++
      return {
        uid: `${tifUid(assembled.id)}__${attrKey}__v${i}`,
        name: text,
        createdAt: assembled.createdAt.getTime(),
        editedAt: assembled.updatedAt.getTime(),
        type: 'node',
      }
    })

    ctx.totalNodeObjects++ // the field carrier node itself
    ctx.fieldApplications++

    carriers.push({
      uid: `${tifUid(assembled.id)}__field__${attrKey}`,
      name: fieldName,
      children: valueChildren,
      createdAt: assembled.createdAt.getTime(),
      editedAt: assembled.updatedAt.getTime(),
      type: 'field',
    })
  }

  return carriers
}

async function buildTifNode(
  backend: NodeBackend,
  assembled: AssembledNode,
  ctx: ExportContext,
): Promise<TanaIntermediateNode> {
  ctx.totalNodeObjects++

  const name = toTifRefs(assembled.content ?? '')

  const rawDescription = getProperty<string>(assembled, FIELD_NAMES.DESCRIPTION)
  const description = rawDescription ? toTifRefs(rawDescription) : undefined

  const mentionIds = getPropertyValues<string>(assembled, FIELD_NAMES.MENTIONS)
  const resolvedRefs: string[] = []
  for (const id of mentionIds) {
    if (await backend.findNodeById(id)) resolvedRefs.push(tifUid(id))
    else ctx.brokenRefs++
  }
  const refs = resolvedRefs.length > 0 ? resolvedRefs : undefined

  const rawNodeType = getProperty<string>(assembled, TIF_MARKER_CONTENT.NODE_TYPE)
  const type: TifNodeType =
    rawNodeType === 'date' || rawNodeType === 'image' || rawNodeType === 'codeblock'
      ? rawNodeType
      : 'node'
  if (type === 'date') ctx.calendarCount++

  const mediaUrl =
    type === 'image'
      ? (getProperty<string>(assembled, TIF_MARKER_CONTENT.MEDIA_URL) ?? undefined)
      : undefined
  const codeLanguage =
    type === 'codeblock'
      ? (getProperty<string>(assembled, TIF_MARKER_CONTENT.CODE_LANGUAGE) ?? undefined)
      : undefined

  const rawTodoState = getProperty<string>(assembled, FIELD_NAMES.TODO_STATE)
  const todoState =
    rawTodoState === 'todo' || rawTodoState === 'done' ? (rawTodoState as TifTodoState) : undefined

  const flags = getProperty<TifFlagType[]>(assembled, TIF_MARKER_CONTENT.FLAGS) ?? undefined

  const rawViewAs = getProperty<string>(assembled, FIELD_NAMES.VIEW_AS)
  const viewType: TifViewType | undefined =
    rawViewAs === 'table' ? 'table' : rawViewAs === 'outline' ? 'list' : undefined

  for (const st of assembled.supertags) {
    if (!ctx.supertagsSeen.has(tifUid(st.id))) {
      ctx.supertagsSeen.set(tifUid(st.id), st.content.replace(/^#/, ''))
    }
  }
  const supertags =
    assembled.supertags.length > 0 ? assembled.supertags.map((st) => tifUid(st.id)) : undefined

  const fieldCarriers = await buildFieldCarriers(backend, assembled, ctx)
  const childNodes: TanaIntermediateNode[] = []
  for (const child of await getChildrenOrdered(backend, assembled.id)) {
    childNodes.push(await buildTifNode(backend, child, ctx))
  }
  const children = [...fieldCarriers, ...childNodes]
  if (children.length === 0) ctx.leafCount++

  const result: TanaIntermediateNode = {
    uid: tifUid(assembled.id),
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
 * Export a node and its full subtree as a TIF file. Pass `null` to export
 * the whole graph (every root-level node, i.e. nodes with no owner).
 */
export async function exportSubtreeToTif(
  backend: NodeBackend,
  rootNodeId: string | null,
): Promise<TanaIntermediateFile> {
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
    const roots = await backend.getRootNodes()
    topNodes = []
    for (const root of roots) {
      topNodes.push(await buildTifNode(backend, root, ctx))
    }
  } else {
    const root = await backend.findNodeById(rootNodeId)
    if (!root) {
      throw new Error(`tif-export: root node not found: ${rootNodeId}`)
    }
    topNodes = [await buildTifNode(backend, root, ctx)]
  }

  const attributes: TanaIntermediateAttribute[] = [...ctx.attributesSeen.values()].map((attr) => ({
    name: attr.name,
    values: [...attr.values],
    count: attr.count,
    dataType: attr.dataType,
  }))

  const supertags: TanaIntermediateSupertag[] = [...ctx.supertagsSeen.entries()].map(
    ([uid, name]) => ({ uid, name }),
  )

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
