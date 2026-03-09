import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@nxus/ui'
import type { FieldType } from '@/types/outline'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { NodeBlock } from './node-block'

interface FieldValueProps {
  fieldType: FieldType
  value: unknown
  onChange: (value: unknown) => void
  /** Depth of the parent node — used to indent reference NodeBlocks */
  depth: number
}

export function FieldValue({ fieldType, value, onChange, depth }: FieldValueProps) {
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
      return <SelectField value={String(value ?? '')} />
    case 'node':
      return <NodeRefField value={String(value ?? '')} depth={depth} />
    case 'nodes':
      return <NodeRefsField values={Array.isArray(value) ? value : []} depth={depth} />
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
        'cursor-text hover:bg-foreground/5',
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
        'cursor-text hover:bg-foreground/5',
      )}
      onClick={() => setEditing(true)}
    >
      {displayDate || 'Empty'}
    </span>
  )
}

/* ─── Select field ─── */

function SelectField({ value }: { value: string }) {
  if (!value) {
    return <span className={emptyTextClass}>Empty</span>
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-px',
        'text-[14.5px] font-medium leading-[1.6]',
        'bg-foreground/8 text-foreground/60',
      )}
    >
      {String(value)}
    </span>
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
        className={cn(editableClass, 'text-foreground/25 italic cursor-text hover:bg-foreground/5')}
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
        className={cn(editableClass, 'text-foreground/25 italic cursor-text hover:bg-foreground/5')}
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

/* ─── Node reference fields — render as recursive NodeBlock tree ─── */

function NodeRefField({ value, depth }: { value: string; depth: number }) {
  const exists = useOutlineStore((s) => s.nodes.has(value))

  if (!value) {
    return <span className={emptyTextClass}>Empty</span>
  }

  if (exists) {
    return <NodeBlock nodeId={value} depth={depth + 2} />
  }

  // Node not in store — show ID as a reference pill
  return <UnresolvedRef nodeId={value} />
}

function NodeRefsField({ values, depth }: { values: string[]; depth: number }) {
  if (!values || values.length === 0) {
    return <span className={emptyTextClass}>Empty</span>
  }

  return (
    <div>
      {(Array.isArray(values) ? values : [values]).map((v) => (
        <NodeRefField key={String(v)} value={String(v)} depth={depth} />
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
