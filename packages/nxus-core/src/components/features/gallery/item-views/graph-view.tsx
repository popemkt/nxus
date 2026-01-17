import type { Item } from '@/types/item'
import { GraphCanvas } from './graph-view/graph-canvas'

interface GraphViewProps {
  items: Item[]
  searchQuery: string
}

export function GraphView({ items, searchQuery }: GraphViewProps) {
  return (
    <div className="h-full w-full">
      <GraphCanvas items={items} searchQuery={searchQuery} />
    </div>
  )
}
