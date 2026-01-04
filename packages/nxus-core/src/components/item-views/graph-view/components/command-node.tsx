import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Command } from '@phosphor-icons/react'
import type { CommandNodeData } from '../hooks/use-graph-nodes'
import { cn } from '@/lib/utils'

interface CommandNodeProps {
  data: CommandNodeData
  selected?: boolean
}

export const CommandNode = memo(function CommandNode({
  data,
  selected,
}: CommandNodeProps) {
  const { label } = data

  return (
    <div
      className={cn(
        'w-12 h-12 rounded-full border bg-muted flex items-center justify-center shadow-sm',
        selected && 'ring-2 ring-primary',
      )}
      title={label}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !border-background !w-1.5 !h-1.5"
      />

      <Command className="h-5 w-5 text-muted-foreground" />

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !border-background !w-1.5 !h-1.5"
      />
    </div>
  )
})
