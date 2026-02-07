import { GraphCanvas } from './graph-view/graph-canvas'
import type { Item } from '@nxus/db'

interface GraphViewProps {
  items: Array<Item>
  searchQuery: string
}

export function GraphView({ items, searchQuery }: GraphViewProps) {
  return (
    <div className="h-full w-full">
      <GraphCanvas items={items} searchQuery={searchQuery} />
    </div>
  )
}
