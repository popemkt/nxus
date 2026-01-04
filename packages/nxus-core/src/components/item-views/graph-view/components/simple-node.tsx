import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { App } from '@/types/app'
import { cn } from '@/lib/utils'

// Type-based colors
const TYPE_COLORS: Record<App['type'], string> = {
  html: 'bg-orange-500',
  typescript: 'bg-blue-500',
  'remote-repo': 'bg-purple-500',
  tool: 'bg-green-500',
}

// Status-based opacity/ring
const STATUS_STYLES: Record<App['status'], string> = {
  installed: 'ring-2 ring-primary/50',
  'not-installed': 'opacity-70',
  available: '',
}

interface SimpleNodeData {
  type: App['type']
  status: App['status']
  label: string
  isDimmed: boolean
  dependencyCount: number
  showLabel?: boolean
}

interface SimpleNodeProps {
  data: SimpleNodeData
  selected?: boolean
}

export const SimpleNode = memo(function SimpleNode({
  data,
  selected,
}: SimpleNodeProps) {
  const {
    type,
    status,
    label,
    isDimmed,
    dependencyCount,
    showLabel = true,
  } = data

  // Size based on dependency count (more deps = larger node)
  const baseSize = 20
  const sizeMultiplier = Math.min(1 + dependencyCount * 0.25, 2)
  const size = baseSize * sizeMultiplier

  return (
    <div className="flex flex-col items-center gap-1">
      {/* The dot */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md',
          TYPE_COLORS[type],
          STATUS_STYLES[status],
          selected && 'ring-2 ring-white ring-offset-2 ring-offset-background',
          isDimmed && 'opacity-30',
        )}
        style={{ width: size, height: size }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-transparent !border-0 !w-1 !h-1"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-transparent !border-0 !w-1 !h-1"
        />
      </div>

      {/* Label - always visible when showLabel is true */}
      {showLabel && (
        <div
          className={cn(
            'text-[10px] font-medium text-foreground/80 max-w-[100px] text-center truncate px-1 py-0.5 rounded bg-background/80 backdrop-blur-sm',
            isDimmed && 'opacity-30',
          )}
        >
          {label}
        </div>
      )}
    </div>
  )
})
