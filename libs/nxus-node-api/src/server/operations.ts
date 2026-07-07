import type { AssembledNode, QueryDefinition } from '@nxus/db'
import type { FieldSystemId } from '@nxus/db'

type JsonScalar = string | number | boolean | null
type NodePropertyValue = JsonScalar | string[]

export interface GetNodeInput {
  identifier: string
}

export interface GetNodesBySupertagInput {
  supertagSystemId: string
}

export interface UpdateNodeContentInput {
  nodeId: string
  content: string
}

export interface UpdateNodeContentResult {
  node: AssembledNode
}

export interface CreateNodeInput {
  content: string
  systemId?: string
  supertagSystemId?: string
  ownerId?: string
  properties?: Record<string, JsonScalar>
}

export interface CreateNodeResult {
  node: AssembledNode
  nodeId: string
}

export interface SetNodePropertiesInput {
  nodeId: string
  properties: Record<string, NodePropertyValue>
}

export interface SetNodePropertiesResult {
  node: AssembledNode
}

export interface SearchNodesInput {
  query: string
  limit?: number
}

export interface SearchNodesResult {
  nodes: AssembledNode[]
}

export interface GetAllNodesInput {
  supertagSystemId?: string
  limit?: number
  includeSystemNodes?: boolean
}

export interface GetOwnerChainInput {
  nodeId: string
}

export interface GetOwnerChainResult {
  chain: Array<{ id: string; content: string | null; systemId: string | null }>
}

export interface ChildNodesInput {
  parentId: string
  supertagSystemId?: string
  limit?: number
}

export interface ChildNodesResult {
  children: AssembledNode[]
}

export interface BacklinksInput {
  nodeId: string
  limit?: number
}

export interface BacklinksResult {
  backlinks: AssembledNode[]
}

export interface SupertagsResult {
  supertags: AssembledNode[]
}

export interface EvaluateQueryInput {
  definition: QueryDefinition
  limit?: number
}

export interface EvaluateQueryResult {
  nodes: AssembledNode[]
  totalCount: number
  evaluatedAt: Date
}

export interface CreateOutlineNodeInput {
  content: string
  parentId: string | null
  order?: number
  hiddenFieldSystemIds?: string[]
}

export interface OutlineAppliedSupertag {
  id: string
  name: string
  systemId: string
  color: string | null
}

export interface OutlineAppliedField {
  fieldId: string
  fieldName: string
  fieldNodeId: string
  fieldSystemId: string | null
  fieldType: string
  values: Array<{ value: {}; order: number }>
}

export interface CreateOutlineNodeResult {
  nodeId: string
  appliedSupertag: OutlineAppliedSupertag | null
  appliedFields: OutlineAppliedField[]
}

export interface EditorQueryResultNode {
  id: string
  content: string
  supertags: AssembledNode['supertags']
}

export interface EvaluateEditorQueryResult {
  nodes: EditorQueryResultNode[]
  totalCount: number
}

export type BacklinkOriginKind = 'field-value' | 'supertag' | 'inline-mention'

export interface BacklinkNodeSummary {
  id: string
  content: string
  childCount: number
  supertags: Array<{ id: string; content: string; systemId: string | null }>
}

export interface BacklinkGroup {
  fieldKey: string
  originKind: BacklinkOriginKind
  fieldName: string
  nodes: BacklinkNodeSummary[]
}

export interface GroupedBacklinksResult {
  groups: BacklinkGroup[]
  totalCount: number
}

function toFieldSystemId(value: string): FieldSystemId {
  if (!value.startsWith('field:')) {
    throw new Error(`Expected field system ID, received: ${value}`)
  }
  return value as FieldSystemId
}

async function getFacade() {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()
  return nodeFacade
}

export async function getNode(input: GetNodeInput): Promise<AssembledNode | null> {
  const nodeFacade = await getFacade()
  const { isSystemId } = await import('@nxus/db/server')

  return isSystemId(input.identifier)
    ? nodeFacade.findNodeBySystemId(input.identifier)
    : nodeFacade.findNodeById(input.identifier)
}

export async function getNodesBySupertag(
  input: GetNodesBySupertagInput,
): Promise<AssembledNode[]> {
  const nodeFacade = await getFacade()
  return nodeFacade.getNodesBySupertagWithInheritance(input.supertagSystemId)
}

export async function updateNodeContent(
  input: UpdateNodeContentInput,
): Promise<UpdateNodeContentResult> {
  const nodeFacade = await getFacade()
  await nodeFacade.updateNodeContent(input.nodeId, input.content)

  const node = await nodeFacade.assembleNode(input.nodeId)
  if (!node) {
    throw new Error('Node not found after update')
  }

  return { node }
}

export async function createNode(input: CreateNodeInput): Promise<CreateNodeResult> {
  const nodeFacade = await getFacade()
  const nodeId = await nodeFacade.createNode({
    content: input.content,
    systemId: input.systemId,
    supertagId: input.supertagSystemId,
    ownerId: input.ownerId,
  })

  if (input.properties) {
    for (const [fieldSystemId, value] of Object.entries(input.properties)) {
      if (value !== null) {
        await nodeFacade.setProperty(nodeId, toFieldSystemId(fieldSystemId), value)
      }
    }
  }

  const node = await nodeFacade.assembleNode(nodeId)
  if (!node) {
    throw new Error('Failed to assemble created node')
  }

  return { node, nodeId }
}

export async function deleteNode(nodeId: string): Promise<void> {
  const nodeFacade = await getFacade()
  const existingNode = await nodeFacade.findNodeById(nodeId)
  if (!existingNode) {
    throw new Error('Node not found')
  }

  await nodeFacade.deleteNode(nodeId)
}

export async function setNodeProperties(
  input: SetNodePropertiesInput,
): Promise<SetNodePropertiesResult> {
  const nodeFacade = await getFacade()
  const existingNode = await nodeFacade.findNodeById(input.nodeId)
  if (!existingNode) {
    throw new Error('Node not found')
  }

  for (const [fieldSystemId, value] of Object.entries(input.properties)) {
    await nodeFacade.setProperty(input.nodeId, toFieldSystemId(fieldSystemId), value)
  }

  const node = await nodeFacade.assembleNode(input.nodeId)
  if (!node) {
    throw new Error('Failed to assemble updated node')
  }

  return { node }
}

export async function evaluateQuery(
  input: EvaluateQueryInput,
): Promise<EvaluateQueryResult> {
  const nodeFacade = await getFacade()
  const effectiveDefinition = {
    ...input.definition,
    limit: input.limit ?? input.definition.limit ?? 500,
  }
  return nodeFacade.evaluateQuery(effectiveDefinition)
}

export async function searchNodes(input: SearchNodesInput): Promise<SearchNodesResult> {
  const query = input.query.trim()
  if (!query) {
    return { nodes: [] }
  }

  const nodeFacade = await getFacade()
  const result = await nodeFacade.evaluateQuery({
    filters: [{ type: 'content', query, caseSensitive: false }],
    limit: input.limit ?? 50,
  })

  return { nodes: result.nodes }
}

export async function getSupertags(): Promise<SupertagsResult> {
  const nodeFacade = await getFacade()
  const { SYSTEM_SUPERTAGS } = await import('@nxus/db/server')
  const supertags = await nodeFacade.getNodesBySupertagWithInheritance(
    SYSTEM_SUPERTAGS.SUPERTAG,
  )
  return { supertags }
}

export async function getAllNodes(input: GetAllNodesInput): Promise<SearchNodesResult> {
  const limit = input.limit ?? 200

  if (input.supertagSystemId) {
    const nodes = await getNodesBySupertag({
      supertagSystemId: input.supertagSystemId,
    })
    return { nodes: nodes.slice(0, limit) }
  }

  const nodeFacade = await getFacade()
  const result = await nodeFacade.evaluateQuery({ filters: [], limit })
  const nodes = input.includeSystemNodes === false
    ? result.nodes.filter((node) => !node.systemId?.startsWith('field:'))
    : result.nodes

  return { nodes }
}

export async function getBacklinks(input: BacklinksInput): Promise<BacklinksResult> {
  const nodeFacade = await getFacade()
  const result = await nodeFacade.evaluateQuery({
    filters: [
      { type: 'relation', relationType: 'linksTo', targetNodeId: input.nodeId },
    ],
    limit: input.limit ?? Number.MAX_SAFE_INTEGER,
  })

  return {
    backlinks: result.nodes.filter((node) => node.id !== input.nodeId),
  }
}

export async function getOwnerChain(
  input: GetOwnerChainInput,
): Promise<GetOwnerChainResult> {
  const nodeFacade = await getFacade()
  const chain: GetOwnerChainResult['chain'] = []
  const visited = new Set<string>()
  let currentId: string | null = input.nodeId

  while (currentId && chain.length < 20) {
    if (visited.has(currentId)) {
      break
    }
    visited.add(currentId)

    const node = await nodeFacade.findNodeById(currentId)
    if (!node) {
      break
    }

    chain.unshift({
      id: node.id,
      content: node.content,
      systemId: node.systemId,
    })

    currentId = node.ownerId
  }

  return { chain }
}

export async function getChildNodes(
  input: ChildNodesInput,
): Promise<ChildNodesResult> {
  const nodeFacade = await getFacade()
  const result = await nodeFacade.evaluateQuery({
    filters: [
      { type: 'relation', relationType: 'childOf', targetNodeId: input.parentId },
    ],
    limit: input.limit ?? 50,
  })

  if (!input.supertagSystemId) {
    return { children: result.nodes }
  }

  return {
    children: result.nodes.filter((node) =>
      node.supertags.some((supertag) => supertag.systemId === input.supertagSystemId),
    ),
  }
}

export async function createOutlineNode(
  input: CreateOutlineNodeInput,
): Promise<CreateOutlineNodeResult> {
  const nodeFacade = await getFacade()
  const { getProperty, FIELD_NAMES, SYSTEM_FIELDS } = await import('@nxus/db/server')
  const hiddenFieldSystemIds = new Set(input.hiddenFieldSystemIds ?? [])

  const nodeId = await nodeFacade.createNode({
    content: input.content,
    ownerId: input.parentId ?? undefined,
  })

  if (input.order !== undefined) {
    await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.ORDER, input.order)
  }

  let appliedSupertag: OutlineAppliedSupertag | null = null
  const appliedFields: OutlineAppliedField[] = []

  if (!input.parentId) {
    return { nodeId, appliedSupertag, appliedFields }
  }

  const parentAssembled = await nodeFacade.assembleNode(input.parentId)
  if (!parentAssembled) {
    return { nodeId, appliedSupertag, appliedFields }
  }

  for (const parentTag of parentAssembled.supertags) {
    const tagAssembled = await nodeFacade.assembleNode(parentTag.id)
    if (!tagAssembled) {
      continue
    }

    const defaultChildRef = getProperty(
      tagAssembled,
      FIELD_NAMES.DEFAULT_CHILD_SUPERTAG,
    )
    if (typeof defaultChildRef !== 'string') {
      continue
    }

    const childTagNode = await nodeFacade.assembleNode(defaultChildRef)
    if (!childTagNode?.systemId) {
      continue
    }

    const added = await nodeFacade.addNodeSupertag(nodeId, childTagNode.systemId)
    if (!added) {
      break
    }

    const dbColor = getProperty(childTagNode, FIELD_NAMES.COLOR)
    appliedSupertag = {
      id: childTagNode.id,
      name: childTagNode.content ?? '',
      systemId: childTagNode.systemId,
      color: typeof dbColor === 'string' ? dbColor : null,
    }

    const fieldDefs = await nodeFacade.getSupertagFieldDefinitions(childTagNode.id)
    const ancestors = await nodeFacade.getAncestorSupertags(childTagNode.id)
    for (const ancestorId of ancestors) {
      const ancestorDefs = await nodeFacade.getSupertagFieldDefinitions(ancestorId)
      for (const [key, value] of ancestorDefs) {
        if (!fieldDefs.has(key)) {
          fieldDefs.set(key, value)
        }
      }
    }

    for (const [systemId, definition] of fieldDefs) {
      if (hiddenFieldSystemIds.has(systemId)) {
        continue
      }

      const fieldNode = await nodeFacade.assembleNode(definition.fieldNodeId)
      const fieldType = fieldNode
        ? getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE)
        : undefined

      appliedFields.push({
        fieldId: systemId,
        fieldName: definition.fieldName,
        fieldNodeId: definition.fieldNodeId,
        fieldSystemId: systemId,
        fieldType: typeof fieldType === 'string' ? fieldType : 'text',
        values: [],
      })
    }

    const templateRaw = getProperty(childTagNode, FIELD_NAMES.CONTENT_TEMPLATE)
    if (typeof templateRaw === 'string') {
      try {
        const parsedTemplate: unknown = JSON.parse(templateRaw)
        if (
          parsedTemplate &&
          typeof parsedTemplate === 'object' &&
          'children' in parsedTemplate &&
          Array.isArray(parsedTemplate.children)
        ) {
          for (const childDefinition of parsedTemplate.children) {
            if (
              childDefinition &&
              typeof childDefinition === 'object' &&
              'content' in childDefinition &&
              typeof childDefinition.content === 'string'
            ) {
              await nodeFacade.createNode({
                content: childDefinition.content,
                ownerId: nodeId,
              })
            }
          }
        }
      } catch {
        // Invalid templates are ignored to preserve existing editor behavior.
      }
    }

    break
  }

  return { nodeId, appliedSupertag, appliedFields }
}

export async function evaluateEditorQuery(
  definition: QueryDefinition,
): Promise<EvaluateEditorQueryResult> {
  const result = await evaluateQuery({ definition })
  return {
    nodes: result.nodes.map((node) => ({
      id: node.id,
      content: node.content ?? '',
      supertags: node.supertags,
    })),
    totalCount: result.totalCount,
  }
}

export async function getGroupedBacklinks(
  nodeId: string,
): Promise<GroupedBacklinksResult> {
  const nodeFacade = await getFacade()
  const result = await nodeFacade.evaluateQuery({
    filters: [{ type: 'relation', relationType: 'linksTo', targetNodeId: nodeId }],
    limit: Number.MAX_SAFE_INTEGER,
  })

  const systemFieldSystemIds = new Set([
    'field:order',
    'field:field_type',
    'field:query_definition',
    'field:color',
  ])
  const fieldGroups = new Map<
    string,
    {
      fieldKey: string
      fieldName: string
      originKind: BacklinkOriginKind
      nodeIds: Set<string>
    }
  >()

  for (const assembled of result.nodes) {
    for (const propValues of Object.values(assembled.properties)) {
      const first = propValues[0]
      if (!first) {
        continue
      }

      const fieldKey = first.fieldSystemId ?? first.fieldNodeId ?? first.fieldName
      if (first.fieldSystemId && systemFieldSystemIds.has(first.fieldSystemId)) {
        continue
      }

      const referencesTarget = propValues.some((propertyValue) => {
        if (propertyValue.value === nodeId) {
          return true
        }
        return Array.isArray(propertyValue.value) && propertyValue.value.includes(nodeId)
      })

      if (!referencesTarget) {
        continue
      }

      const originKind: BacklinkOriginKind =
        first.fieldSystemId === 'field:supertag'
          ? 'supertag'
          : first.fieldSystemId === 'field:mentions'
            ? 'inline-mention'
            : 'field-value'
      const existingGroup = fieldGroups.get(fieldKey)
      if (existingGroup) {
        existingGroup.nodeIds.add(assembled.id)
      } else {
        fieldGroups.set(fieldKey, {
          fieldKey,
          fieldName: first.fieldName,
          originKind,
          nodeIds: new Set([assembled.id]),
        })
      }
    }
  }

  const childCountMap = new Map<string, number>()
  for (const assembled of result.nodes) {
    const childResult = await nodeFacade.evaluateQuery({
      filters: [
        { type: 'relation', relationType: 'childOf', targetNodeId: assembled.id },
      ],
      limit: Number.MAX_SAFE_INTEGER,
    })
    childCountMap.set(assembled.id, childResult.totalCount)
  }

  const nodeDataMap = new Map<string, BacklinkNodeSummary>(
    result.nodes.map((node) => [
      node.id,
      {
        id: node.id,
        content: node.content ?? '',
        childCount: childCountMap.get(node.id) ?? 0,
        supertags: node.supertags.map((supertag) => ({
          id: supertag.id,
          content: supertag.content,
          systemId: supertag.systemId,
        })),
      },
    ]),
  )

  const groups = Array.from(fieldGroups.values())
    .map((group) => ({
      fieldKey: group.fieldKey,
      originKind: group.originKind,
      fieldName: group.fieldName,
      nodes: Array.from(group.nodeIds).flatMap((id) => {
        const node = nodeDataMap.get(id)
        return node ? [node] : []
      }),
    }))
    .filter((group) => group.nodes.length > 0)

  return { groups, totalCount: result.totalCount }
}
