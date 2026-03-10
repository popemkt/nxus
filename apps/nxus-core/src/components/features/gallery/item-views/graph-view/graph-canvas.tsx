import type { Item } from '@nxus/db'
import { Canvas2DGraph } from './canvas-2d-graph'

interface GraphCanvasProps {
  items: Array<Item>
  searchQuery: string
  className?: string
}

export function GraphCanvas({ items, searchQuery, className }: GraphCanvasProps) {
  return <Canvas2DGraph items={items} searchQuery={searchQuery} className={className} />
}
