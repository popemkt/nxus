import { cn } from '@nxus/ui'
import { List, Graph, Funnel, House } from '@phosphor-icons/react'
import { SidebarIcon } from './SidebarIcon.js'

/** Available view modes in the workbench */
export type ViewMode = 'list' | 'graph' | 'query'

export interface SidebarProps {
  /** Currently active view mode */
  activeView: ViewMode
  /** Callback when view mode changes */
  onViewChange: (view: ViewMode) => void
  /** Additional class names */
  className?: string
}

/**
 * Sidebar - Discord-style vertical icon bar for view navigation
 *
 * Features:
 * - Compact icon-only navigation
 * - View mode switching (list/graph/query)
 * - Active state indicators
 * - Hover tooltips
 *
 * Icons:
 * - List: NodeBrowser view (default)
 * - Graph: Graph visualization view
 * - Funnel: Query Builder view
 */
export function Sidebar({
  activeView,
  onViewChange,
  className,
}: SidebarProps) {
  return (
    <div
      className={cn(
        'w-16 bg-card/50 border-r border-border flex flex-col py-3',
        className
      )}
    >
      {/* Navigation Icons */}
      <nav className="flex flex-col gap-2">
        <SidebarIcon
          icon={List}
          tooltip="Node Browser"
          isActive={activeView === 'list'}
          onClick={() => onViewChange('list')}
        />
        <SidebarIcon
          icon={Graph}
          tooltip="Graph View"
          isActive={activeView === 'graph'}
          onClick={() => onViewChange('graph')}
        />
        <SidebarIcon
          icon={Funnel}
          tooltip="Query Builder"
          isActive={activeView === 'query'}
          onClick={() => onViewChange('query')}
        />
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Home (Gateway) */}
      <nav className="flex flex-col gap-2 pb-1">
        <a href="/" title="Home">
          <SidebarIcon
            icon={House}
            tooltip="Home"
          />
        </a>
      </nav>
    </div>
  )
}
