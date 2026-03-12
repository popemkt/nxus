import { cn } from '@nxus/ui'
import {
  TextT,
  Hash,
  ToggleRight,
  CalendarBlank,
  CaretCircleDown,
  LinkSimple,
  At,
  ArrowSquareOut,
  TreeStructure,
  BracketsAngle,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import type { FieldType } from '@/types/outline'

interface BulletProps {
  hasChildren: boolean
  collapsed: boolean
  childCount: number
  tagColor: string | null
  isSupertag: boolean
  isQuery?: boolean
  isReference?: boolean
  onClick: (e: React.MouseEvent) => void
}

export function Bullet({
  hasChildren,
  collapsed,
  childCount,
  tagColor,
  isSupertag,
  isQuery,
  isReference,
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
      {/* Filled halo — only visible when collapsed with children */}
      {hasChildren && collapsed && (
        <span
          className="absolute inset-[3px] rounded-full bg-foreground/8"
          style={tagColor ? { backgroundColor: `${tagColor}20` } : undefined}
        />
      )}

      {/* Supertag definitions get # hashtag, queries get search icon, regular nodes get round dot */}
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
      ) : isQuery ? (
        <MagnifyingGlass
          size={14}
          weight="bold"
          className={cn(
            !tagColor && 'text-foreground/45',
          )}
          style={tagColor ? { color: tagColor } : undefined}
        />
      ) : isReference ? (
        /* Referenced node — dashed circle matches collapsed halo size (inset-[3px] → 18px) */
        <span
          className={cn(
            'flex items-center justify-center rounded-full',
            'h-[18px] w-[18px] border border-dashed',
            !tagColor && 'border-foreground/20',
          )}
          style={tagColor ? { borderColor: `${tagColor}40` } : undefined}
        >
          <span
            className={cn(
              'block h-[4px] w-[4px] rounded-full',
              !tagColor && 'bg-foreground/40',
            )}
            style={tagColor ? { backgroundColor: tagColor } : undefined}
          />
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

const fieldIconMap: Record<FieldType, React.ComponentType<{ size: number; weight?: 'regular' | 'bold' }>> = {
  text: TextT,
  number: Hash,
  boolean: ToggleRight,
  date: CalendarBlank,
  select: CaretCircleDown,
  url: LinkSimple,
  email: At,
  node: ArrowSquareOut,
  nodes: TreeStructure,
  json: BracketsAngle,
}

/**
 * Field icon — type-specific Phosphor icon used as the "bullet" for field rows.
 * Sits in the same column as child bullets.
 */
export function FieldBullet({ fieldType }: { fieldType?: FieldType }) {
  const Icon = fieldType ? fieldIconMap[fieldType] : TextT
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-foreground/25">
      <Icon size={13} />
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
