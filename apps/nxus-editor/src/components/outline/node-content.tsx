import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as PhosphorIcons from '@phosphor-icons/react'
import { CaretRight, Plus, Question } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type {
  OutlineCommandCatalog,
  OutlineFieldDefinition,
  OutlineSupertagDefinition,
  SupertagBadge,
} from '@/types/outline'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { TiptapNodeEditor } from './tiptap-node-editor'
import type { OutlineKeyboardCallbacks } from './tiptap-node-editor'

interface NodeContentProps {
  nodeId: string
  content: string
  isActive: boolean
  isSelected: boolean
  supertags: SupertagBadge[]
  commandCatalog: OutlineCommandCatalog
  cursorPosition: number
  onActivate: (cursorPos?: number) => void
  onAddField: (nodeId: string, fieldId: string, value: unknown) => Promise<void> | void
  onApplySupertag: (nodeId: string, supertagId: string) => Promise<void> | void
  onChange: (content: string) => void
  onCreateSupertag: (
    nodeId: string,
    name: string,
  ) => Promise<OutlineSupertagDefinition | null>
  outlineCallbacks: OutlineKeyboardCallbacks
}

type MenuState =
  | {
      mode: 'supertag'
      query: string
      selectedIndex: number
      rect: { top: number; left: number }
    }
  | {
      mode: 'field'
      query: string
      selectedIndex: number
      rect: { top: number; left: number }
    }
  | {
      mode: 'value'
      field: OutlineFieldDefinition
      query: string
      rect: { top: number; left: number }
    }

function getCaretAnchor(el: HTMLElement): { top: number; left: number } {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if (rect.width || rect.height) {
      return {
        top: rect.bottom + 8,
        left: rect.left,
      }
    }
  }

  const rect = el.getBoundingClientRect()
  return {
    top: rect.bottom + 8,
    left: rect.left + 12,
  }
}

function fuzzyScore(label: string, query: string): number {
  const normalizedLabel = label.toLowerCase()
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) return 1
  if (normalizedLabel === normalizedQuery) return 100
  if (normalizedLabel.startsWith(normalizedQuery)) return 80

  const substringIndex = normalizedLabel.indexOf(normalizedQuery)
  if (substringIndex >= 0) {
    return 60 - substringIndex
  }

  let score = 0
  let queryIndex = 0

  for (let i = 0; i < normalizedLabel.length && queryIndex < normalizedQuery.length; i++) {
    if (normalizedLabel[i] === normalizedQuery[queryIndex]) {
      score += 5
      queryIndex += 1
    }
  }

  return queryIndex === normalizedQuery.length ? score : -1
}

function filterByQuery<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
): T[] {
  return items
    .map((item) => ({
      item,
      score: fuzzyScore(getLabel(item), query),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || getLabel(a.item).localeCompare(getLabel(b.item)))
    .map((entry) => entry.item)
}

function normalizeSupertagName(name: string): string {
  const trimmed = name.trim().replace(/^#+/, '')
  return trimmed ? `#${trimmed}` : '#Untitled'
}

function parseFieldValue(field: OutlineFieldDefinition, rawValue: string): unknown {
  switch (field.fieldType) {
    case 'boolean':
      return ['true', '1', 'yes', 'y', 'on'].includes(rawValue.trim().toLowerCase())
    case 'number': {
      const parsed = Number(rawValue)
      return Number.isFinite(parsed) ? parsed : 0
    }
    case 'json':
      return rawValue.trim() ? JSON.parse(rawValue) : null
    case 'nodes':
      return rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    case 'node':
    case 'date':
    case 'email':
    case 'select':
    case 'text':
    case 'url':
    default:
      return rawValue
  }
}

function DynamicSupertagIcon({
  iconName,
  color,
}: {
  iconName: string | null
  color: string | null
}) {
  const iconKey = iconName ? (iconName.endsWith('Icon') ? iconName : `${iconName}Icon`) : 'TagIcon'
  const IconComponent = (
    PhosphorIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>
  )[iconKey]

  const Icon = IconComponent ?? Question
  return <Icon size={14} className={cn(color ? '' : 'text-foreground/40')} />
}

export function NodeContent({
  nodeId,
  content,
  isActive,
  isSelected,
  supertags,
  commandCatalog,
  cursorPosition,
  onActivate,
  onAddField,
  onApplySupertag,
  onChange,
  onCreateSupertag,
  outlineCallbacks,
}: NodeContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    if (!isActive) {
      setMenu(null)
    }
  }, [isActive])

  useEffect(() => {
    if (!menu) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        target &&
        (contentRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return
      }
      setMenu(null)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [menu])

  const filteredSupertags = useMemo(
    () => filterByQuery(commandCatalog.supertags, menu?.mode === 'supertag' ? menu.query : '', (tag) => tag.name),
    [commandCatalog.supertags, menu],
  )

  const filteredFields = useMemo(
    () => filterByQuery(commandCatalog.fields, menu?.mode === 'field' ? menu.query : '', (field) => field.name),
    [commandCatalog.fields, menu],
  )

  const exactSupertagMatch = useMemo(() => {
    if (menu?.mode !== 'supertag') return false
    const normalized = normalizeSupertagName(menu.query).toLowerCase()
    return commandCatalog.supertags.some((tag) => tag.name.toLowerCase() === normalized)
  }, [commandCatalog.supertags, menu])

  const openMenu = useCallback((mode: 'supertag' | 'field') => {
    const el = contentRef.current
    if (!el) return

    setMenu({
      mode,
      query: '',
      selectedIndex: 0,
      rect: getCaretAnchor(el),
    })
  }, [])

  const commitSupertag = useCallback(async () => {
    if (menu?.mode !== 'supertag') return

    const selected = filteredSupertags[menu.selectedIndex]
    if (selected) {
      await onApplySupertag(nodeId, selected.id)
      setMenu(null)
      return
    }

    if (!menu.query.trim() || exactSupertagMatch) return

    const created = await onCreateSupertag(nodeId, normalizeSupertagName(menu.query))
    if (created) {
      setMenu(null)
    }
  }, [
    exactSupertagMatch,
    filteredSupertags,
    menu,
    nodeId,
    onApplySupertag,
    onCreateSupertag,
  ])

  const commitFieldValue = useCallback(async () => {
    if (menu?.mode !== 'value') return

    try {
      const value = parseFieldValue(menu.field, menu.query)
      await onAddField(nodeId, menu.field.id, value)
      setMenu(null)
    } catch (error) {
      console.error('[outline] Failed to parse field value:', error)
    }
  }, [menu, nodeId, onAddField])

  /**
   * Handle keyboard events forwarded from Tiptap when a menu is open.
   * This receives raw DOM KeyboardEvents (not React synthetic events).
   */
  const handleMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!menu) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
        return
      }

      if (menu.mode === 'value') {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          void commitFieldValue()
          return
        }

        if (e.key === 'Backspace') {
          e.preventDefault()
          setMenu({ ...menu, query: menu.query.slice(0, -1) })
          return
        }

        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          setMenu({ ...menu, query: menu.query + e.key })
        }
        return
      }

      const options = menu.mode === 'supertag' ? filteredSupertags : filteredFields

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const optionCount =
          menu.mode === 'supertag' && menu.query.trim() && !exactSupertagMatch
            ? options.length + 1
            : options.length
        if (optionCount > 0) {
          setMenu({
            ...menu,
            selectedIndex: (menu.selectedIndex + 1) % optionCount,
          })
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const optionCount =
          menu.mode === 'supertag' && menu.query.trim() && !exactSupertagMatch
            ? options.length + 1
            : options.length
        if (optionCount > 0) {
          setMenu({
            ...menu,
            selectedIndex:
              (menu.selectedIndex - 1 + optionCount) % optionCount,
          })
        }
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        setMenu({
          ...menu,
          query: menu.query.slice(0, -1),
          selectedIndex: 0,
        })
        return
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (menu.mode === 'supertag') {
          void commitSupertag()
          return
        }

        const selectedField = filteredFields[menu.selectedIndex]
        if (!selectedField) return

        setMenu({
          mode: 'value',
          field: selectedField,
          query: '',
          rect: menu.rect,
        })
        return
      }

      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setMenu({
          ...menu,
          query: menu.query + e.key,
          selectedIndex: 0,
        })
      }
    },
    [
      commitFieldValue,
      commitSupertag,
      exactSupertagMatch,
      filteredFields,
      filteredSupertags,
      menu,
    ],
  )

  const handleHashKey = useCallback(() => {
    openMenu('supertag')
  }, [openMenu])

  const handleAngleBracketKey = useCallback(() => {
    openMenu('field')
  }, [openMenu])

  const activeSupertagItem = menu?.mode === 'supertag' ? filteredSupertags[menu.selectedIndex] : null
  const showCreateSupertag =
    menu?.mode === 'supertag' &&
    menu.query.trim().length > 0 &&
    !exactSupertagMatch

  return (
    <div
      ref={contentRef}
      className={cn(
        'node-content flex min-h-6 flex-1 items-start gap-1.5',
        'rounded-sm px-1',
        isSelected && !isActive && 'bg-primary/8',
      )}
    >
      <TiptapNodeEditor
        content={content}
        isActive={isActive}
        cursorPosition={cursorPosition}
        outlineCallbacks={outlineCallbacks}
        onChange={onChange}
        onActivate={onActivate}
        onHashKey={handleHashKey}
        onAngleBracketKey={handleAngleBracketKey}
        menuOpen={menu !== null}
        onMenuKeyDown={handleMenuKeyDown}
      />

      {supertags.length > 0 && <SupertagBadges supertags={supertags} />}

      {menu && (
        <div
          ref={menuRef}
          className={cn(
            'fixed z-50 min-w-[260px] rounded-xl border border-foreground/10',
            'bg-popover/95 p-1 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur',
          )}
          style={{ top: menu.rect.top, left: menu.rect.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {menu.mode === 'value' ? (
            <div className="px-2 py-1.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
                <CaretRight size={12} />
                {menu.field.name}
              </div>
              <div className="rounded-lg bg-foreground/[0.04] px-2 py-1.5 text-[13px] text-foreground/80">
                {menu.query || <span className="text-foreground/35">Enter value…</span>}
              </div>
            </div>
          ) : (
            <>
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
                {menu.mode === 'supertag' ? '# Supertags' : '> Fields'}
                {menu.query && (
                  <span className="ml-2 font-normal tracking-normal text-foreground/55">
                    {menu.query}
                  </span>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto py-0.5">
                {(menu.mode === 'supertag' ? filteredSupertags : filteredFields).map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]',
                      index === menu.selectedIndex
                        ? 'bg-primary/12 text-foreground'
                        : 'text-foreground/72 hover:bg-foreground/[0.04]',
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (menu.mode === 'supertag') {
                        void onApplySupertag(nodeId, item.id)
                        setMenu(null)
                        return
                      }

                      setMenu({
                        mode: 'value',
                        field: item as OutlineFieldDefinition,
                        query: '',
                        rect: menu.rect,
                      })
                    }}
                  >
                    {'fieldType' in item ? (
                      <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                        {item.fieldType}
                      </span>
                    ) : (
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md border border-foreground/10"
                        style={item.color ? { color: item.color } : undefined}
                      >
                        <DynamicSupertagIcon iconName={item.icon} color={item.color} />
                      </span>
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}

                {showCreateSupertag && (
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]',
                      menu.selectedIndex === filteredSupertags.length
                        ? 'bg-primary/12 text-foreground'
                        : 'text-foreground/72 hover:bg-foreground/[0.04]',
                    )}
                    onMouseDown={async (e) => {
                      e.preventDefault()
                      const created = await onCreateSupertag(
                        nodeId,
                        normalizeSupertagName(menu.query),
                      )
                      if (created) {
                        setMenu(null)
                      }
                    }}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-foreground/20 text-foreground/50">
                      <Plus size={12} />
                    </span>
                    <span>Create {normalizeSupertagName(menu.query)}</span>
                  </button>
                )}

                {menu.mode === 'supertag' && filteredSupertags.length === 0 && !showCreateSupertag && (
                  <div className="px-2 py-2 text-[13px] text-foreground/45">No matching supertags.</div>
                )}

                {menu.mode === 'field' && filteredFields.length === 0 && (
                  <div className="px-2 py-2 text-[13px] text-foreground/45">No matching fields.</div>
                )}
              </div>

              {menu.mode === 'supertag' && activeSupertagItem && (
                <div className="border-t border-foreground/8 px-2 py-1.5 text-[11px] text-foreground/45">
                  Applies {activeSupertagItem.name} and its template.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SupertagBadges({ supertags }: { supertags: SupertagBadge[] }) {
  const navigateToNode = useNavigateToNode()

  return (
    <div className="flex h-6 items-center gap-0.5">
      {supertags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            'inline-flex items-center rounded-sm px-1.5 py-px',
            'text-[11px] font-medium leading-[1.8]',
            'select-none whitespace-nowrap',
            'cursor-pointer transition-opacity hover:opacity-70',
            !tag.color && 'bg-foreground/8 text-foreground/50',
          )}
          style={
            tag.color
              ? {
                  backgroundColor: `${tag.color}18`,
                  color: tag.color,
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            navigateToNode(tag.id)
          }}
          title={`Go to: ${tag.name}`}
        >
          {tag.name}
        </span>
      ))}
    </div>
  )
}
