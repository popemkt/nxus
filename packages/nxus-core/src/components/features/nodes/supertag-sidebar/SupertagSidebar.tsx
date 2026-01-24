import { cn } from '@nxus/ui'
import type { AssembledNode } from '@/services/nodes/node.service'
import { Hash, TreeStructure } from '@phosphor-icons/react'

export interface SupertagSidebarProps {
  supertags: AssembledNode[]
  selectedSupertag: string | null
  onSelectSupertag: (systemId: string | null) => void
  isLoading?: boolean
}

/**
 * SupertagSidebar - Filter panel for browsing nodes by supertag
 *
 * Features:
 * - "All Nodes" option to clear filter
 * - List of all available supertags
 * - Visual selection state
 * - Icon and count display
 */
export function SupertagSidebar({
  supertags,
  selectedSupertag,
  onSelectSupertag,
  isLoading,
}: SupertagSidebarProps) {
  return (
    <div className="w-64 border-r border-border flex flex-col bg-card/50">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <TreeStructure className="size-4" />
          Supertags
        </h2>
      </div>

      {/* Supertag List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* All Nodes option */}
        <button
          className={cn(
            'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
            !selectedSupertag
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted text-foreground',
          )}
          onClick={() => onSelectSupertag(null)}
        >
          All Nodes
        </button>

        {/* Loading state */}
        {isLoading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Loading supertags...
          </div>
        )}

        {/* Supertag items */}
        {supertags.map((st) => (
          <button
            key={st.id}
            className={cn(
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
              selectedSupertag === st.systemId
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-foreground',
            )}
            onClick={() => onSelectSupertag(st.systemId)}
          >
            <Hash className="size-3 text-muted-foreground" />
            {st.content}
          </button>
        ))}

        {/* Empty state */}
        {!isLoading && supertags.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            No supertags found
          </div>
        )}
      </div>
    </div>
  )
}
