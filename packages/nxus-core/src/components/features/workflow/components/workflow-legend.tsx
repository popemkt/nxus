import { Panel } from '@xyflow/react'
import {
  TerminalIcon,
  GitBranchIcon,
  RowsIcon,
  ClockIcon,
  BellIcon,
  ChatCircleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { STEP_TYPE_COLORS, EDGE_TYPE_STYLES } from '../types'
import type { WorkflowNodeData } from '../types'

/**
 * Legend entry configuration
 */
interface LegendEntry {
  type: WorkflowNodeData['type']
  label: string
  Icon: Icon
}

const STEP_TYPE_LEGEND: LegendEntry[] = [
  { type: 'command', label: 'Command', Icon: TerminalIcon },
  { type: 'condition', label: 'Condition', Icon: GitBranchIcon },
  { type: 'parallel', label: 'Parallel', Icon: RowsIcon },
  { type: 'delay', label: 'Delay', Icon: ClockIcon },
  { type: 'notify', label: 'Notify', Icon: BellIcon },
  { type: 'prompt', label: 'Prompt', Icon: ChatCircleIcon },
  { type: 'end', label: 'End', Icon: CheckCircleIcon },
]

interface EdgeLegendEntry {
  type: keyof typeof EDGE_TYPE_STYLES
  label: string
}

const EDGE_TYPE_LEGEND: EdgeLegendEntry[] = [
  { type: 'success', label: 'Success' },
  { type: 'failure', label: 'Failure' },
  { type: 'next', label: 'Next' },
  { type: 'branch', label: 'Branch' },
  { type: 'parallel', label: 'Parallel' },
]

/**
 * Legend panel showing step types and edge styles for workflow graphs
 */
export function WorkflowLegend() {
  return (
    <Panel
      position="bottom-left"
      className="p-3 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm max-w-xs"
    >
      {/* Step Types */}
      <div className="mb-2">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          Step Types
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STEP_TYPE_LEGEND.map(({ type, label, Icon }) => (
            <div key={type} className="flex items-center gap-1.5">
              <Icon
                className="w-3.5 h-3.5"
                weight="fill"
                style={{ color: STEP_TYPE_COLORS[type] }}
              />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge Types */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          Transitions
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {EDGE_TYPE_LEGEND.map(({ type, label }) => {
            const style = EDGE_TYPE_STYLES[type]
            return (
              <div key={type} className="flex items-center gap-1.5">
                <svg width="16" height="8" className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="16"
                    y2="4"
                    stroke={style.stroke}
                    strokeWidth="2"
                    strokeDasharray={
                      style.strokeDasharray === 'none'
                        ? undefined
                        : style.strokeDasharray
                    }
                  />
                </svg>
                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}
