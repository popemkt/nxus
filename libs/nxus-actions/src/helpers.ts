import type { AssembledNode, FieldSystemId } from '@nxus/db'

export interface CompactNodeSummary {
  id: string
  content: string | null
  supertags: Array<{ id: string; content: string; systemId: string | null }>
  fields: Record<string, unknown[]>
}

export async function getFacade() {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()
  return nodeFacade
}

export function compactNode(node: AssembledNode): CompactNodeSummary {
  return {
    id: node.id,
    content: node.content,
    supertags: node.supertags,
    fields: Object.fromEntries(
      Object.entries(node.properties).map(([fieldName, values]) => [
        fieldName,
        values.map((value) => value.value),
      ]),
    ),
  }
}

export function ensureLiveNode(node: AssembledNode | null, nodeId?: string): AssembledNode {
  if (!node || node.deletedAt !== null) {
    throw new Error(nodeId ? `Node not found: ${nodeId}` : 'Node not found')
  }
  return node
}

export function nodeOrder(node: AssembledNode): number {
  const values = Object.values(node.properties).flat()
  const orderValue = values.find((value) => value.fieldSystemId === 'field:order')
  return typeof orderValue?.value === 'number' ? orderValue.value : Number.MAX_SAFE_INTEGER
}

export async function resolveSupertagSystemId(input: string): Promise<string> {
  const nodeFacade = await getFacade()

  if (input.startsWith('supertag:')) {
    const tag = await nodeFacade.findNodeBySystemId(input)
    if (!tag || tag.deletedAt !== null) {
      throw new Error(`Supertag not found: ${input}`)
    }
    return input
  }

  const { SYSTEM_SUPERTAGS } = await import('@nxus/db/server')
  const tags = await nodeFacade.getNodesBySupertagWithInheritance(
    SYSTEM_SUPERTAGS.SUPERTAG,
  )
  const normalized = input.startsWith('#') ? input.slice(1) : input
  const match = tags.find((tag) => {
    const content = tag.content ?? ''
    return content === input || content === `#${normalized}` || content === normalized
  })

  if (!match?.systemId) {
    throw new Error(`Supertag not found: ${input}`)
  }
  return match.systemId
}

export async function resolveSupertagNode(input: string): Promise<AssembledNode> {
  const nodeFacade = await getFacade()
  const bySystemId = input.startsWith('supertag:')
    ? await nodeFacade.findNodeBySystemId(input)
    : null
  if (bySystemId) {
    return ensureLiveNode(bySystemId)
  }

  const byId = await nodeFacade.findNodeById(input)
  if (byId) {
    return ensureLiveNode(byId)
  }

  const systemId = await resolveSupertagSystemId(input)
  const resolved = await nodeFacade.findNodeBySystemId(systemId)
  return ensureLiveNode(resolved)
}

export function isFieldSystemId(value: string): value is FieldSystemId {
  return value.startsWith('field:')
}

export function toFieldSystemId(value: string): FieldSystemId {
  if (!isFieldSystemId(value)) {
    throw new Error(`Expected field system ID, received: ${value}`)
  }
  return value
}
