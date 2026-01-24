import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  TerminalIcon,
  GitBranchIcon,
  RowsIcon,
  ClockIcon,
  BellIcon,
  ChatCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { WorkflowNodeData } from '../types'
import { STEP_TYPE_COLORS } from '../types'

/**
 * Icon mapping for each step type
 */
const STEP_TYPE_ICONS: Record<WorkflowNodeData['type'], Icon> = {
  command: TerminalIcon,
  condition: GitBranchIcon,
  parallel: RowsIcon,
  delay: ClockIcon,
  notify: BellIcon,
  prompt: ChatCircleIcon,
  end: CheckCircleIcon, // Will be overridden for failure status
}

/**
 * Shape configuration for each step type
 */
type ShapeType =
  | 'rectangle'
  | 'diamond'
  | 'wide-rectangle'
  | 'circle'
  | 'rounded-rectangle'

const STEP_TYPE_SHAPES: Record<WorkflowNodeData['type'], ShapeType> = {
  command: 'rectangle',
  condition: 'diamond',
  parallel: 'wide-rectangle',
  delay: 'circle',
  notify: 'rounded-rectangle',
  prompt: 'rounded-rectangle',
  end: 'circle',
}

/**
 * Get CSS classes for the node shape
 */
function getShapeClasses(shape: ShapeType): string {
  switch (shape) {
    case 'rectangle':
      return 'w-44 h-14 rounded-md'
    case 'diamond':
      return 'w-20 h-20 rotate-45'
    case 'wide-rectangle':
      return 'w-52 h-14 rounded-md'
    case 'circle':
      return 'w-16 h-16 rounded-full'
    case 'rounded-rectangle':
      return 'w-44 h-14 rounded-xl'
  }
}

/**
 * Get handle positions based on shape and layout direction
 */
function getHandlePositions(shape: ShapeType): {
  targetPosition: Position
  sourcePosition: Position
} {
  // Diamond shape needs different positions due to rotation
  if (shape === 'diamond') {
    return {
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    }
  }
  return {
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
  }
}

interface WorkflowStepNodeProps extends NodeProps {
  data: WorkflowNodeData
}

export const WorkflowStepNode = memo(function WorkflowStepNode({
  data,
  selected,
}: WorkflowStepNodeProps) {
  const { stepId, type, description, status } = data

  // Get the appropriate icon
  const IconComponent =
    type === 'end' && status === 'failure' ? XCircleIcon : STEP_TYPE_ICONS[type]

  // Get the appropriate color
  const color =
    type === 'end' && status === 'failure'
      ? '#ef4444' // Red for failure
      : STEP_TYPE_COLORS[type]

  const shape = STEP_TYPE_SHAPES[type]
  const shapeClasses = getShapeClasses(shape)
  const { targetPosition, sourcePosition } = getHandlePositions(shape)

  const isDiamond = shape === 'diamond'

  return (
    <div
      className={cn(
        'flex items-center justify-center border-2 shadow-md transition-all bg-background',
        shapeClasses,
        selected && 'ring-2 ring-offset-2 ring-offset-background',
      )}
      style={{
        borderColor: color,
        // Apply ring color that matches the step type
        ...(selected
          ? ({ '--tw-ring-color': color } as React.CSSProperties)
          : {}),
      }}
    >
      <Handle
        type="target"
        position={targetPosition}
        className={cn(
          '!w-2 !h-2 !border-2',
          isDiamond && '-rotate-45', // Counter-rotate for diamond
        )}
        style={{
          backgroundColor: color,
          borderColor: 'var(--background)',
        }}
      />

      {/* Content - counter-rotate for diamond shape */}
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 p-2',
          isDiamond && '-rotate-45',
        )}
      >
        <IconComponent
          className="shrink-0"
          style={{ color }}
          weight="fill"
          size={isDiamond ? 20 : 18}
        />
        <span
          className={cn(
            'font-medium text-foreground leading-tight text-center',
            isDiamond ? 'text-[9px]' : 'text-xs',
            shape === 'circle' && 'text-[10px]',
          )}
        >
          {stepId}
        </span>
        {/* Show description for non-diamond, non-circle shapes */}
        {description && !isDiamond && shape !== 'circle' && (
          <span
            className="text-[10px] text-muted-foreground truncate max-w-full leading-tight"
            title={description}
          >
            {description.length > 25
              ? `${description.slice(0, 25)}...`
              : description}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={sourcePosition}
        className={cn(
          '!w-2 !h-2 !border-2',
          isDiamond && '-rotate-45', // Counter-rotate for diamond
        )}
        style={{
          backgroundColor: color,
          borderColor: 'var(--background)',
        }}
      />
    </div>
  )
})

/**
 * Node types configuration for React Flow
 */
export const workflowNodeTypes = {
  'workflow-step': WorkflowStepNode,
}
