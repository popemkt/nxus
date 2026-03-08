import { cn } from '@nxus/ui'

interface BulletProps {
  hasChildren: boolean
  collapsed: boolean
  childCount: number
  tagColor: string | null
  hasSupertag: boolean
  onClick: (e: React.MouseEvent) => void
}

export function Bullet({
  hasChildren,
  collapsed,
  childCount,
  tagColor,
  hasSupertag,
  onClick,
}: BulletProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bullet-container group/bullet relative flex shrink-0 items-center justify-center',
        'w-6 h-6 rounded-sm',
        'hover:bg-foreground/5 transition-colors duration-100',
        'cursor-pointer',
      )}
      tabIndex={-1}
      title={hasChildren ? 'Click to toggle, Cmd+click to focus' : 'Cmd+click to focus'}
      aria-label={
        hasChildren
          ? collapsed
            ? `Expand (${childCount} children)`
            : 'Collapse'
          : undefined
      }
    >
      {/* Outer halo ring — only visible when collapsed with children */}
      {hasChildren && collapsed && (
        <span
          className={cn(
            'absolute inset-[3px] border border-foreground/20',
            hasSupertag ? 'rounded-[3px]' : 'rounded-full',
          )}
          style={tagColor ? { borderColor: `${tagColor}40` } : undefined}
        />
      )}

      {/* Inner bullet dot — diamond for supertag nodes, circle for plain */}
      {hasSupertag ? (
        <span
          className={cn(
            'block transition-all duration-100',
            hasChildren ? 'h-[7px] w-[7px]' : 'h-[5px] w-[5px]',
            'rotate-45 rounded-[1px]',
            !tagColor && 'bg-foreground/40',
            !tagColor && hasChildren && 'bg-foreground/50',
            hasChildren &&
              !collapsed &&
              'group-hover/bullet:bg-foreground/60',
          )}
          style={tagColor ? { backgroundColor: tagColor } : undefined}
        />
      ) : (
        <span
          className={cn(
            'block rounded-full transition-all duration-100',
            hasChildren ? 'h-[5px] w-[5px]' : 'h-1 w-1',
            !tagColor && 'bg-foreground/40',
            !tagColor && hasChildren && 'bg-foreground/50',
            hasChildren &&
              !collapsed &&
              'group-hover/bullet:bg-foreground/60',
          )}
          style={tagColor ? { backgroundColor: tagColor } : undefined}
        />
      )}

      {/* Collapsed children count badge */}
      {hasChildren && collapsed && childCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground/10 px-0.5 text-[9px] font-medium text-foreground/50">
          {childCount}
        </span>
      )}
    </button>
  )
}

interface TreeLineProps {
  depth: number
  isLast: boolean
}

export function TreeLine({ depth }: TreeLineProps) {
  if (depth === 0) return null
  return (
    <div
      className="tree-line absolute top-0 bottom-0 w-px bg-foreground/[0.06] hover:bg-foreground/15 transition-colors duration-200"
      style={{ left: `${depth * 24 + 11}px` }}
    />
  )
}
