import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { App } from '@/types/app'
import { cn } from '@/lib/utils'

// Type-based colors - solid, not transparent
const TYPE_COLORS: Record<App['type'], { bg: string; solid: string }> = {
  html: { bg: 'bg-orange-500', solid: '#f97316' },
  typescript: { bg: 'bg-blue-500', solid: '#3b82f6' },
  'remote-repo': { bg: 'bg-purple-500', solid: '#a855f7' },
  tool: { bg: 'bg-green-500', solid: '#22c55e' },
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
  isForceLayout?: boolean
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
    isForceLayout = false,
  } = data

  // Size based on dependency count (more deps = larger node)
  const baseSize = 20
  const sizeMultiplier = Math.min(1 + dependencyCount * 0.25, 2)
  const size = baseSize * sizeMultiplier

  const colors = TYPE_COLORS[type]

  return (
    <div className="flex flex-col items-center gap-1">
      {/* The dot - solid opaque circle */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg relative',
          colors.bg,
          STATUS_STYLES[status],
          selected && 'ring-2 ring-primary',
          isDimmed && 'opacity-30',
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: colors.solid, // Ensure solid opaque color
        }}
      >
        {/* For force layout: single centered handles */}
        {isForceLayout ? (
          <>
            <Handle
              type="target"
              position={Position.Top}
              id="center-target"
              className="!bg-transparent !border-0"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 1,
                height: 1,
              }}
            />
            <Handle
              type="source"
              position={Position.Bottom}
              id="center-source"
              className="!bg-transparent !border-0"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 1,
                height: 1,
              }}
            />
          </>
        ) : (
          <>
            {/* For hierarchical: left/right handles */}
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
          </>
        )}
      </div>

      {/* Label - always visible when showLabel is true */}
      {showLabel && (
        <div
          className={cn(
            'text-[10px] font-medium text-foreground/80 max-w-[100px] text-center truncate px-1 py-0.5 rounded bg-background/80 backdrop-blur-sm pointer-events-none',
            isDimmed && 'opacity-30',
          )}
        >
          {label}
        </div>
      )}
    </div>
  )
})
