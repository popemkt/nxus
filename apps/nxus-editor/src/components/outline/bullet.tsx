import { cn } from '@nxus/ui'

interface BulletProps {
  hasChildren: boolean
  collapsed: boolean
  childCount: number
  tagColor: string | null
  isSupertag: boolean
  onClick: (e: React.MouseEvent) => void
}

export function Bullet({
  hasChildren,
  collapsed,
  childCount,
  tagColor,
  isSupertag,
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
          className="absolute inset-[3px] rounded-full border border-foreground/20"
          style={tagColor ? { borderColor: `${tagColor}40` } : undefined}
        />
      )}

      {/* Supertag definitions get # hashtag, regular nodes get round dot */}
      {isSupertag ? (
        <span
          className={cn(
            'block text-[11px] font-bold leading-none select-none',
            !tagColor && 'text-foreground/45',
            hasChildren && !tagColor && 'text-foreground/55',
            hasChildren &&
              !collapsed &&
              'group-hover/bullet:text-foreground/70',
          )}
          style={tagColor ? { color: tagColor } : undefined}
        >
          #
        </span>
      ) : (
        <span
          className={cn(
            'block rounded-full transition-all duration-100',
            hasChildren ? 'h-[5px] w-[5px]' : 'h-[4px] w-[4px]',
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

/**
 * Field icon — small square with lines, used as the "bullet" for field rows.
 * Matches Tana's field indicator that sits in the same column as child bullets.
 */
export function FieldBullet() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="text-foreground/25"
      >
        <rect
          x="1"
          y="1"
          width="10"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line x1="3.5" y1="4" x2="8.5" y2="4" stroke="currentColor" strokeWidth="0.8" />
        <line x1="3.5" y1="6.5" x2="7" y2="6.5" stroke="currentColor" strokeWidth="0.8" />
      </svg>
    </span>
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
