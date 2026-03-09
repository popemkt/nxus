import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@nxus/ui'
import type { FieldType } from '@/types/outline'
import { useOutlineStore } from '@/stores/outline.store'

interface FieldValueProps {
  fieldType: FieldType
  value: unknown
  onChange: (value: unknown) => void
}

export function FieldValue({ fieldType, value, onChange }: FieldValueProps) {
  // Safety: if value is an object/array and not a primitive type, render as JSON
  if (value !== null && value !== undefined && typeof value === 'object' && fieldType !== 'nodes') {
    return <JsonField value={value} />
  }

  switch (fieldType) {
    case 'boolean':
      return <BooleanField value={Boolean(value)} onChange={onChange} />
    case 'number':
      return <NumberField value={Number(value ?? 0)} onChange={onChange} />
    case 'date':
      return <DateField value={String(value ?? '')} onChange={onChange} />
    case 'url':
      return <UrlField value={String(value ?? '')} onChange={onChange} />
    case 'email':
      return <EmailField value={String(value ?? '')} onChange={onChange} />
    case 'select':
      return <SelectField value={String(value ?? '')} />
    case 'node':
      return <NodeRefField value={String(value ?? '')} />
    case 'nodes':
      return <NodeRefsField values={Array.isArray(value) ? value : []} />
    case 'json':
      return <JsonField value={value} />
    case 'text':
    default:
      return <TextField value={String(value ?? '')} onChange={onChange} />
  }
}

/* ─── Shared inline editing styles ─── */

const displayTextClass = cn(
  'cursor-text rounded-sm px-1 text-[14.5px] leading-[1.6]',
  'text-foreground/70 hover:bg-foreground/5',
)

const emptyTextClass = cn(
  'cursor-text rounded-sm px-1 text-[14.5px] leading-[1.6]',
  'text-foreground/25 italic hover:bg-foreground/5',
)

const inputClass = cn(
  'min-h-[28px] flex-1 rounded-sm border border-foreground/10 bg-transparent px-1.5',
  'text-[14.5px] text-foreground/80 outline-none leading-[1.6]',
  'focus:border-primary/40',
)

/* ─── Text field ─── */

function TextField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    if (draft !== String(value ?? '')) onChange(draft)
  }, [draft, value, onChange])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={inputClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
          e.stopPropagation()
        }}
      />
    )
  }

  return (
    <span
      className={value ? displayTextClass : emptyTextClass}
      onClick={() => {
        setDraft(String(value ?? ''))
        setEditing(true)
      }}
    >
      {value || 'Empty'}
    </span>
  )
}

/* ─── Number field ─── */

function NumberField({
  value,
  onChange,
}: {
  value: number
  onChange: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    const num = Number(draft)
    if (!isNaN(num) && num !== value) onChange(num)
  }, [draft, value, onChange])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className={cn(inputClass, 'w-24 tabular-nums')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
          e.stopPropagation()
        }}
      />
    )
  }

  return (
    <span
      className={cn(displayTextClass, 'tabular-nums text-amber-500/80')}
      onClick={() => {
        setDraft(String(value ?? ''))
        setEditing(true)
      }}
    >
      {value ?? 'Empty'}
    </span>
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
        className={inputClass}
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
      className={displayDate ? displayTextClass : emptyTextClass}
      onClick={() => setEditing(true)}
    >
      {displayDate || 'Empty'}
    </span>
  )
}

/* ─── URL field ─── */

function UrlField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    if (draft !== String(value ?? '')) onChange(draft)
  }, [draft, value, onChange])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="url"
        className={inputClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
          e.stopPropagation()
        }}
      />
    )
  }

  if (value) {
    return (
      <span className="flex items-center gap-1">
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate rounded-sm px-1 text-[14.5px] leading-[1.6] text-primary/70 underline decoration-primary/30 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value).replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
        <button
          type="button"
          className="text-[11px] text-foreground/30 hover:text-foreground/60"
          onClick={(e) => {
            e.stopPropagation()
            setDraft(String(value))
            setEditing(true)
          }}
        >
          edit
        </button>
      </span>
    )
  }

  return (
    <span
      className={emptyTextClass}
      onClick={() => {
        setDraft('')
        setEditing(true)
      }}
    >
      Empty
    </span>
  )
}

/* ─── Email field ─── */

function EmailField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    if (draft !== String(value ?? '')) onChange(draft)
  }, [draft, value, onChange])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="email"
        className={inputClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
          e.stopPropagation()
        }}
      />
    )
  }

  if (value) {
    return (
      <a
        href={`mailto:${value}`}
        className="truncate rounded-sm px-1 text-[14.5px] leading-[1.6] text-primary/70 underline decoration-primary/30 hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {String(value)}
      </a>
    )
  }

  return (
    <span
      className={emptyTextClass}
      onClick={() => {
        setDraft('')
        setEditing(true)
      }}
    >
      Empty
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

/* ─── Node reference fields ─── */

/**
 * Renders a single node reference as an inline pill with a bullet dot
 * and the referenced node's content — similar to Tana's @-mention pills.
 */
function NodeRefPill({ nodeId }: { nodeId: string }) {
  const node = useOutlineStore((s) => s.nodes.get(nodeId))
  const setRootNodeId = useOutlineStore((s) => s.setRootNodeId)

  if (!nodeId) {
    return <span className={emptyTextClass}>Empty</span>
  }

  const displayContent = node?.content || nodeId.slice(0, 8)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-px',
        'text-[14.5px] leading-[1.6]',
        'bg-primary/8 text-foreground/70',
        'cursor-pointer hover:bg-primary/12 transition-colors duration-100',
      )}
      onClick={(e) => {
        e.stopPropagation()
        setRootNodeId(nodeId)
      }}
      title={node ? `Go to: ${node.content}` : `Node: ${nodeId}`}
    >
      {/* Inline bullet dot */}
      <span className="h-[4px] w-[4px] shrink-0 rounded-full bg-foreground/35" />
      <span className="truncate max-w-[200px]">{displayContent}</span>
    </span>
  )
}

function NodeRefField({ value }: { value: string }) {
  if (!value) {
    return <span className={emptyTextClass}>Empty</span>
  }
  return <NodeRefPill nodeId={String(value)} />
}

function NodeRefsField({ values }: { values: string[] }) {
  if (!values || values.length === 0) {
    return <span className={emptyTextClass}>Empty</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {(Array.isArray(values) ? values : [values]).map((v) => (
        <NodeRefPill key={String(v)} nodeId={String(v)} />
      ))}
    </div>
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
