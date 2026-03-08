import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@nxus/ui'
import type { FieldType } from '@/types/outline'

interface FieldValueProps {
  fieldType: FieldType
  value: unknown
  onChange: (value: unknown) => void
}

export function FieldValue({ fieldType, value, onChange }: FieldValueProps) {
  switch (fieldType) {
    case 'boolean':
      return <BooleanField value={value as boolean} onChange={onChange} />
    case 'number':
      return <NumberField value={value as number} onChange={onChange} />
    case 'date':
      return <DateField value={value as string} onChange={onChange} />
    case 'url':
      return <UrlField value={value as string} onChange={onChange} />
    case 'email':
      return <EmailField value={value as string} onChange={onChange} />
    case 'select':
      return <SelectField value={value as string} />
    case 'node':
      return <NodeRefField value={value as string} />
    case 'nodes':
      return <NodeRefsField values={value as string[]} />
    case 'json':
      return <JsonField value={value} />
    case 'text':
    default:
      return <TextField value={value as string} onChange={onChange} />
  }
}

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
        className={cn(
          'h-6 flex-1 rounded-sm border border-foreground/10 bg-transparent px-1.5',
          'text-[13px] text-foreground/80 outline-none',
          'focus:border-primary/40',
        )}
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
      className={cn(
        'cursor-text rounded-sm px-1 text-[13px]',
        'text-foreground/70 hover:bg-foreground/5',
        !value && 'text-foreground/25 italic',
      )}
      onClick={() => {
        setDraft(String(value ?? ''))
        setEditing(true)
      }}
    >
      {value || 'empty'}
    </span>
  )
}

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
        className={cn(
          'h-6 w-24 rounded-sm border border-foreground/10 bg-transparent px-1.5',
          'text-[13px] text-foreground/80 outline-none tabular-nums',
          'focus:border-primary/40',
        )}
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
      className={cn(
        'cursor-text rounded-sm px-1 text-[13px] tabular-nums',
        'text-amber-500/80 hover:bg-foreground/5',
        value === undefined && 'text-foreground/25 italic',
      )}
      onClick={() => {
        setDraft(String(value ?? ''))
        setEditing(true)
      }}
    >
      {value ?? 'empty'}
    </span>
  )
}

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
          'h-6 rounded-sm border border-foreground/10 bg-transparent px-1.5',
          'text-[13px] text-foreground/80 outline-none',
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
        'cursor-text rounded-sm px-1 text-[13px]',
        'text-foreground/70 hover:bg-foreground/5',
        !value && 'text-foreground/25 italic',
      )}
      onClick={() => setEditing(true)}
    >
      {displayDate || 'empty'}
    </span>
  )
}

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
        className={cn(
          'h-6 flex-1 rounded-sm border border-foreground/10 bg-transparent px-1.5',
          'text-[13px] text-foreground/80 outline-none',
          'focus:border-primary/40',
        )}
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
          className="truncate rounded-sm px-1 text-[13px] text-primary/70 underline decoration-primary/30 hover:text-primary"
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
      className="cursor-text rounded-sm px-1 text-[13px] text-foreground/25 italic hover:bg-foreground/5"
      onClick={() => {
        setDraft('')
        setEditing(true)
      }}
    >
      empty
    </span>
  )
}

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
        className={cn(
          'h-6 flex-1 rounded-sm border border-foreground/10 bg-transparent px-1.5',
          'text-[13px] text-foreground/80 outline-none',
          'focus:border-primary/40',
        )}
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
        className="truncate rounded-sm px-1 text-[13px] text-primary/70 underline decoration-primary/30 hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {String(value)}
      </a>
    )
  }

  return (
    <span
      className="cursor-text rounded-sm px-1 text-[13px] text-foreground/25 italic hover:bg-foreground/5"
      onClick={() => {
        setDraft('')
        setEditing(true)
      }}
    >
      empty
    </span>
  )
}

function SelectField({ value }: { value: string }) {
  if (!value) {
    return (
      <span className="rounded-sm px-1 text-[13px] text-foreground/25 italic">
        empty
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-px',
        'text-[12px] font-medium',
        'bg-foreground/8 text-foreground/60',
      )}
    >
      {String(value)}
    </span>
  )
}

function NodeRefField({ value }: { value: string }) {
  if (!value) {
    return (
      <span className="rounded-sm px-1 text-[13px] text-foreground/25 italic">
        empty
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-px',
        'text-[12px] font-medium',
        'bg-primary/10 text-primary/70',
        'cursor-pointer hover:bg-primary/15',
      )}
    >
      {String(value).slice(0, 8)}…
    </span>
  )
}

function NodeRefsField({ values }: { values: string[] }) {
  if (!values || values.length === 0) {
    return (
      <span className="rounded-sm px-1 text-[13px] text-foreground/25 italic">
        empty
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {(Array.isArray(values) ? values : [values]).map((v, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center rounded-sm px-1.5 py-px',
            'text-[12px] font-medium',
            'bg-primary/10 text-primary/70',
            'cursor-pointer hover:bg-primary/15',
          )}
        >
          {String(v).slice(0, 8)}…
        </span>
      ))}
    </div>
  )
}

function JsonField(_props: { value: unknown }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-px',
        'text-[12px] font-mono',
        'bg-foreground/5 text-foreground/40',
      )}
    >
      {'{…}'}
    </span>
  )
}
