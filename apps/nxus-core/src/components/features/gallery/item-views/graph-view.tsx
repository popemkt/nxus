import { GraphCanvas } from './graph-view/graph-canvas'
import { ReactFlowGraph } from './graph-view/react-flow/react-flow-graph'
import { useViewModeStore } from '@/stores/view-mode.store'
import type { Item } from '@nxus/db'

interface GraphViewProps {
  items: Array<Item>
  searchQuery: string
}

export function GraphView({ items, searchQuery }: GraphViewProps) {
  const graphRenderer = useViewModeStore((s) => s.graphRenderer)

  return (
    <div className="h-full w-full">
      {graphRenderer === 'blocks' ? (
        <ReactFlowGraph items={items} searchQuery={searchQuery} />
      ) : (
        <GraphCanvas items={items} searchQuery={searchQuery} />
      )}
    </div>
  )
}
