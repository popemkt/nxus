import { cn } from '@nxus/ui'
import {
  TextT,
  Hash,
  ToggleRight,
  CalendarBlank,
  CaretCircleDown,
  DotsSixVertical,
  LinkSimple,
  At,
  ArrowSquareOut,
  TreeStructure,
  BracketsAngle,
} from '@phosphor-icons/react'
import type { FieldType } from '@/types/outline'

interface BulletProps {
  hasChildren: boolean
  collapsed: boolean
  childCount: number
  tagColor: string | null
  isSupertag: boolean
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  onClick: (e: React.MouseEvent) => void
}

export function Bullet({
  hasChildren,
  collapsed,
  childCount,
  tagColor,
  isSupertag,
  dragHandleProps,
  onClick,
}: BulletProps) {
  const { className: dragHandleClassName, ...dragHandleRest } = dragHandleProps ?? {}

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'drag-handle flex h-6 w-4 items-center justify-center rounded-sm',
          'cursor-grab text-foreground/18 transition-colors duration-100',
          'hover:bg-foreground/5 hover:text-foreground/40',
          'active:cursor-grabbing',
          dragHandleClassName,
        )}
        tabIndex={-1}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...dragHandleRest}
      >
        <DotsSixVertical size={12} weight="bold" />
      </button>

      <button
        type="button"
        onClick={onClick}
        className={cn(
          'bullet-container group/bullet relative flex shrink-0 items-center justify-center',
          'h-6 w-6 rounded-sm',
          'cursor-pointer transition-colors duration-100 hover:bg-foreground/5',
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
              'block select-none text-[11px] font-bold leading-none',
              !tagColor && 'text-foreground/45',
              hasChildren && !tagColor && 'text-foreground/55',
              hasChildren && !collapsed && 'group-hover/bullet:text-foreground/70',
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
              hasChildren && !collapsed && 'group-hover/bullet:bg-foreground/60',
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
    </div>
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
