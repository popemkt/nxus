import { useState, useCallback, useRef, useEffect } from 'react'
import { Hash } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { FieldType } from '@/types/outline'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { Bullet } from './bullet'

interface FieldValueProps {
  fieldType: FieldType
  fieldNodeId?: string
  value: unknown
  onChange: (value: unknown) => void
}

export function FieldValue({ fieldType, fieldNodeId, value, onChange }: FieldValueProps) {
  // Safety: if value is an object/array and not a reference type, render as JSON
  if (value !== null && value !== undefined && typeof value === 'object' && fieldType !== 'nodes') {
    return <JsonField value={value} />
  }

  switch (fieldType) {
    case 'boolean':
      return <BooleanField value={Boolean(value)} onChange={onChange} />
    case 'date':
      return <DateField value={String(value ?? '')} onChange={onChange} />
    case 'select':
      return <SelectField value={String(value ?? '')} fieldNodeId={fieldNodeId} onChange={onChange} />
    case 'node':
      return <NodeRefField value={String(value ?? '')} />
    case 'nodes':
      return <NodeRefsField values={Array.isArray(value) ? value : []} />
    case 'json':
      return <JsonField value={value} />
    case 'url':
      return <UrlField value={String(value ?? '')} onChange={onChange} />
    case 'email':
      return <EmailField value={String(value ?? '')} onChange={onChange} />
    case 'number':
    case 'text':
    default:
      return <EditableField value={String(value ?? '')} onChange={onChange} />
  }
}

/* ─── Shared styles ─── */

const editableClass = cn(
  'flex-1 outline-none rounded-sm px-1',
  'text-[14.5px] leading-[1.6]',
)

const emptyTextClass = cn(
  'rounded-sm px-1 text-[14.5px] leading-[1.6]',
  'text-foreground/25 italic',
)

/* ─── ContentEditable field (text, number, url, email) ─── */

/**
 * Uses contentEditable like NodeContent — same element in both states,
 * no layout shift between display and edit mode.
 */
function EditableField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isEditing = useRef(false)

  const handleClick = useCallback(() => {
    if (!isEditing.current && ref.current) {
      isEditing.current = true
      ref.current.contentEditable = 'true'
      ref.current.focus()
      // Place cursor at end
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = ref.current.textContent ?? ''
    if (newValue !== value) onChange(newValue)
  }, [value, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ref.current?.blur()
      }
      if (e.key === 'Escape') {
        // Revert content
        if (ref.current) ref.current.textContent = value
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  return (
    <div
      ref={ref}
      className={cn(
        editableClass,
        value ? 'text-foreground/70' : 'text-foreground/25 italic',
        'cursor-text',
      )}
      onClick={handleClick}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      suppressContentEditableWarning
    >
      {value || 'Empty'}
    </div>
  )
}

/* ─── Boolean field ─── */

function BooleanField({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: unknown) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors duration-150',
        value ? 'bg-primary/60' : 'bg-foreground/15',
      )}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!value)
      }}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-150',
          value && 'translate-x-4',
        )}
      />
    </button>
  )
}

/* ─── Date field ─── */

function DateField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        className={cn(
          editableClass,
          'text-foreground/80',
          'border border-foreground/10 bg-transparent',
          'focus:border-primary/40',
        )}
        defaultValue={value ? String(value).slice(0, 10) : ''}
        onChange={(e) => {
          onChange(e.target.value)
          setEditing(false)
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.stopPropagation()}
      />
    )
  }

  const displayDate = value
    ? new Date(String(value)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <span
      className={cn(
        editableClass,
        displayDate ? 'text-foreground/70' : 'text-foreground/25 italic',
        'cursor-text',
      )}
      onClick={() => setEditing(true)}
    >
      {displayDate || 'Empty'}
    </span>
  )
}

/* ─── Select field ─── */

function SelectField({
  value,
  fieldNodeId,
  onChange,
}: {
  value: string
  fieldNodeId?: string
  onChange: (v: unknown) => void
}) {
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const loadOptions = useCallback(() => {
    if (loaded || !fieldNodeId) return
    import('@/services/field.server').then(({ getFieldOptionsServerFn }) => {
      getFieldOptionsServerFn({ data: { fieldNodeId } })
        .then((result) => {
          if (result.success) setOptions(result.options)
          setLoaded(true)
        })
        .catch(() => setLoaded(true))
    })
  }, [fieldNodeId, loaded])

  const handleClick = useCallback(() => {
    loadOptions()
    setOpen((o) => !o)
  }, [loadOptions])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={anchorRef} className="relative">
      <span
        className={cn(
          'inline-flex items-center rounded-sm px-1.5 py-px cursor-pointer',
          'text-[14.5px] font-medium leading-[1.6]',
          value ? 'bg-foreground/8 text-foreground/60' : 'text-foreground/25 italic',
        )}
        onClick={(e) => {
          e.stopPropagation()
          handleClick()
        }}
      >
        {value || 'Empty'}
      </span>

      {open && options.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[140px] overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-lg">
          {options.map((opt) => (
            <div
              key={opt}
              className={cn(
                'cursor-pointer rounded-md px-2 py-1 text-xs',
                'hover:bg-accent hover:text-accent-foreground',
                opt === value && 'bg-accent/50 font-medium',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(opt)
                setOpen(false)
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── URL field — editable with clickable link ─── */

function UrlField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isEditing = useRef(false)

  const handleClick = useCallback(() => {
    if (!isEditing.current && ref.current) {
      isEditing.current = true
      ref.current.contentEditable = 'true'
      ref.current.focus()
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = ref.current.textContent ?? ''
    if (newValue !== value) onChange(newValue)
  }, [value, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ref.current?.blur()
      }
      if (e.key === 'Escape') {
        if (ref.current) ref.current.textContent = value
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  if (!value) {
    return (
      <div
        ref={ref}
        className={cn(editableClass, 'text-foreground/25 italic cursor-text')}
        onClick={handleClick}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        Empty
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div
        ref={ref}
        className={cn(
          editableClass,
          'text-primary/70 underline underline-offset-2 decoration-primary/20',
          'cursor-text hover:bg-foreground/5 truncate',
        )}
        onClick={handleClick}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        {value}
      </div>
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-foreground/25 hover:text-foreground/50 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="Open URL"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4.5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <path d="M7 2h3v3M10 2L5.5 6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  )
}

/* ─── Email field — editable with clickable mailto ─── */

function EmailField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isEditing = useRef(false)

  const handleClick = useCallback(() => {
    if (!isEditing.current && ref.current) {
      isEditing.current = true
      ref.current.contentEditable = 'true'
      ref.current.focus()
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = ref.current.textContent ?? ''
    if (newValue !== value) onChange(newValue)
  }, [value, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ref.current?.blur()
      }
      if (e.key === 'Escape') {
        if (ref.current) ref.current.textContent = value
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  if (!value) {
    return (
      <div
        ref={ref}
        className={cn(editableClass, 'text-foreground/25 italic cursor-text')}
        onClick={handleClick}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        Empty
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div
        ref={ref}
        className={cn(
          editableClass,
          'text-primary/70 underline underline-offset-2 decoration-primary/20',
          'cursor-text hover:bg-foreground/5 truncate',
        )}
        onClick={handleClick}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        {value}
      </div>
      <a
        href={`mailto:${value}`}
        className="shrink-0 text-foreground/25 hover:text-foreground/50 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="Send email"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="2.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
          <path d="M1.5 3L6 6.5L10.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  )
}

/* ─── Node reference fields — inline content-only (no recursive fields/children) ─── */

function NodeRefField({ value }: { value: string }) {
  const node = useOutlineStore((s) => s.nodes.get(value))
  const navigateToNode = useNavigateToNode()

  if (!value) {
    return <span className={emptyTextClass}>Empty</span>
  }

  if (!node) {
    return <UnresolvedRef nodeId={value} />
  }

  const primaryTagColor = node.supertags[0]?.color ?? null

  return (
    <div
      className={cn(
        'flex items-start group/ref',
        'rounded-sm cursor-pointer',
      )}
      onClick={(e) => {
        e.stopPropagation()
        navigateToNode(value)
      }}
      title={`Go to: ${node.content || 'Untitled'}`}
    >
      <Bullet
        hasChildren={node.children.length > 0}
        collapsed={false}
        childCount={node.children.length}
        tagColor={primaryTagColor}
        isSupertag={false}
        isReference
        onClick={(e) => {
          e.stopPropagation()
          navigateToNode(value)
        }}
      />
      <span className={cn('text-[14.5px] leading-[1.6] text-foreground/70 truncate')}>
        {node.content || '\u200B'}
      </span>
      {node.supertags.length > 0 && (
        <div className="flex items-center gap-0.5 ml-1.5">
          {node.supertags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
                'text-[11px] font-medium leading-[1.8]',
                'select-none whitespace-nowrap',
                !tag.color && 'bg-foreground/8 text-foreground/50',
              )}
              style={tag.color ? { backgroundColor: `${tag.color}18`, color: tag.color } : undefined}
            >
              <Hash size={10} weight="bold" className="shrink-0 opacity-60" />
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function NodeRefsField({ values }: { values: string[] }) {
  if (!values || values.length === 0) {
    return <span className={emptyTextClass}>Empty</span>
  }

  return (
    <div>
      {(Array.isArray(values) ? values : [values]).map((v) => (
        <NodeRefField key={String(v)} value={String(v)} />
      ))}
    </div>
  )
}

function UnresolvedRef({ nodeId }: { nodeId: string }) {
  const navigateToNode = useNavigateToNode()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-px',
        'text-[14.5px] leading-[1.6]',
        'bg-primary/8 text-foreground/50',
        'cursor-pointer hover:bg-primary/12 transition-colors duration-100',
      )}
      onClick={(e) => {
        e.stopPropagation()
        navigateToNode(nodeId)
      }}
      title={`Node: ${nodeId}`}
    >
      <span className="h-[4px] w-[4px] shrink-0 rounded-full bg-foreground/35" />
      <span className="truncate max-w-[200px]">{nodeId.slice(0, 12)}</span>
    </span>
  )
}

/* ─── JSON field ─── */

function JsonField({ value }: { value: unknown }) {
  const preview = (() => {
    try {
      const str = JSON.stringify(value)
      return str.length > 40 ? `${str.slice(0, 40)}...` : str
    } catch {
      return '{...}'
    }
  })()

  return (
    <span
      title={JSON.stringify(value, null, 2)}
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-px',
        'text-[14.5px] font-mono leading-[1.6]',
        'bg-foreground/5 text-foreground/40',
      )}
    >
      {preview}
    </span>
  )
}
