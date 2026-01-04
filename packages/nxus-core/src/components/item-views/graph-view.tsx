import type { App } from '@/types/app'
import { GraphCanvas } from './graph-view/graph-canvas'

interface GraphViewProps {
  items: App[]
  searchQuery: string
}

export function GraphView({ items, searchQuery }: GraphViewProps) {
  return (
    <div className="h-[calc(100vh-220px)]">
      <GraphCanvas items={items} searchQuery={searchQuery} />
    </div>
  )
}
