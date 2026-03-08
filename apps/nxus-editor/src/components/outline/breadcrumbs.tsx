import { CaretRight, House } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

interface BreadcrumbItem {
  id: string
  content: string
}

function getAncestorChain(
  nodeId: string,
  nodes: Map<string, { content: string; parentId: string | null }>,
): BreadcrumbItem[] {
  const chain: BreadcrumbItem[] = []
  let current = nodes.get(nodeId)
  let currentId = nodeId

  while (current && current.parentId) {
    chain.unshift({ id: currentId, content: current.content || 'Untitled' })
    currentId = current.parentId
    current = nodes.get(currentId)
  }

  return chain
}

export function Breadcrumbs() {
  const rootNodeId = useOutlineStore((s) => s.rootNodeId)
  const nodes = useOutlineStore((s) => s.nodes)
  const setRootNodeId = useOutlineStore((s) => s.setRootNodeId)
  const rootNode = nodes.get(rootNodeId)

  if (!rootNode) return null

  const ancestors = getAncestorChain(rootNodeId, nodes)
  const isAtRoot = ancestors.length === 0

  return (
    <nav className="breadcrumbs flex items-center gap-1 px-1 py-2 text-[13px]">
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 rounded-sm px-1.5 py-0.5',
          'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5',
          'transition-colors duration-100',
          isAtRoot && 'text-foreground/60',
        )}
        onClick={() => setRootNodeId(WORKSPACE_ROOT_ID)}
      >
        <House size={14} weight="bold" />
        <span>Home</span>
      </button>

      {ancestors.map((item) => (
        <div key={item.id} className="flex items-center gap-1">
          <CaretRight
            size={10}
            weight="bold"
            className="text-foreground/20"
          />
          <button
            type="button"
            className={cn(
              'rounded-sm px-1.5 py-0.5',
              'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5',
              'transition-colors duration-100',
              item.id === rootNodeId && 'text-foreground/70 font-medium',
            )}
            onClick={() => setRootNodeId(item.id)}
          >
            {item.content}
          </button>
        </div>
      ))}
    </nav>
  )
}
