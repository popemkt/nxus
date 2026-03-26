import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Plus } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { FieldType } from '@/types/outline'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { Bullet } from './bullet'
import { SupertagPill } from './supertag-pill'

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
    case 'instance':
      return <InstanceField value={String(value ?? '')} fieldNodeId={fieldNodeId} onChange={onChange} />
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
      return <NumberField value={value} onChange={onChange} />
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
  const [hasContent, setHasContent] = useState(!!value)

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

  const handleInput = useCallback(() => {
    if (ref.current) {
      setHasContent(!!(ref.current.textContent?.trim()))
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = (ref.current.textContent ?? '').trim()
    // Clear leftover browser DOM (e.g. <br>) so placeholder can show
    if (!newValue) ref.current.innerHTML = ''
    setHasContent(!!newValue)
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
        setHasContent(!!value)
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  // Sync when value prop changes externally
  useEffect(() => {
    setHasContent(!!value)
  }, [value])

  return (
    <div className="relative cursor-text" onClick={handleClick}>
      <div
        ref={ref}
        className={cn(
          editableClass,
          hasContent ? 'text-foreground/70' : 'text-foreground/25 italic',
          'cursor-text min-h-[1.6em]',
        )}
        onInput={handleInput}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        {value || undefined}
      </div>
      {!hasContent && (
        <span className="pointer-events-none absolute inset-0 flex items-center px-1 text-[14.5px] leading-[1.6] text-foreground/25 italic">
          Empty
        </span>
      )}
    </div>
  )
}

/* ─── Number field — validates on commit, reverts on NaN ─── */

function NumberField({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isEditing = useRef(false)
  const displayValue = value !== null && value !== undefined && value !== '' ? String(value) : ''
  const [hasContent, setHasContent] = useState(!!displayValue)

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

  const handleInput = useCallback(() => {
    if (ref.current) {
      setHasContent(!!(ref.current.textContent?.trim()))
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const text = ref.current.textContent ?? ''
    if (text.trim() === '') {
      // Clear leftover browser DOM (e.g. <br>) so placeholder can show
      ref.current.innerHTML = ''
      setHasContent(false)
      if (displayValue !== '') onChange('')
      return
    }
    const trimmed = text.trim()
    const parsed = Number(trimmed)
    if (trimmed === '' || Number.isNaN(parsed)) {
      // Revert to previous value
      ref.current.textContent = displayValue
      setHasContent(!!displayValue)
    } else if (String(parsed) !== String(value)) {
      setHasContent(true)
      onChange(parsed)
    }
  }, [value, displayValue, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ref.current?.blur()
      }
      if (e.key === 'Escape') {
        if (ref.current) ref.current.textContent = displayValue
        setHasContent(!!displayValue)
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [displayValue],
  )

  // Sync when value prop changes externally
  useEffect(() => {
    setHasContent(!!displayValue)
  }, [displayValue])

  return (
    <div className="relative cursor-text" onClick={handleClick}>
      <div
        ref={ref}
        className={cn(
          editableClass,
          hasContent ? 'text-foreground/70' : 'text-foreground/25 italic',
          'cursor-text min-h-[1.6em]',
        )}
        onInput={handleInput}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning
      >
        {displayValue || undefined}
      </div>
      {!hasContent && (
        <span className="pointer-events-none absolute inset-0 flex items-center px-1 text-[14.5px] leading-[1.6] text-foreground/25 italic">
          Empty
        </span>
      )}
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
          'text-foreground/70 bg-transparent border-none',
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

/* ─── Select field with self-collecting options ─── */

/**
 * Enhanced select field that:
 * 1. Loads options from field definition
 * 2. Collects used values from other nodes as suggestions
 * 3. Allows creating new options (auto-collect) when typing a value not in the list
 * 4. Supports search/filter with keyboard navigation
 */
function SelectField({
  value,
  fieldNodeId,
  onChange,
}: {
  value: string
  fieldNodeId?: string
  onChange: (v: unknown) => void
}) {
  const [definedOptions, setDefinedOptions] = useState<string[]>([])
  const [usedValues, setUsedValues] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadOptions = useCallback(() => {
    if (loaded || !fieldNodeId) return
    Promise.all([
      import('@/services/field.server').then(({ getFieldOptionsServerFn }) =>
        getFieldOptionsServerFn({ data: { fieldNodeId } }),
      ),
      import('@/services/field.server').then(({ getUsedFieldValuesServerFn }) =>
        getUsedFieldValuesServerFn({ data: { fieldNodeId } }),
      ),
    ])
      .then(([optionsResult, usedResult]) => {
        if (optionsResult.success) setDefinedOptions(optionsResult.options)
        if (usedResult.success) setUsedValues(usedResult.values)
        setLoaded(true)
      })
      .catch(() => {
        /* leave loaded=false so next click retries */
      })
  }, [fieldNodeId, loaded])

  const handleOpen = useCallback(() => {
    loadOptions()
    setOpen(true)
    setSearch('')
    setHighlightIndex(0)
  }, [loadOptions])

  // Merge defined options and used values, deduplicating
  const allOptions = useMemo(() => {
    const set = new Set<string>()
    const result: { value: string; source: 'defined' | 'used' }[] = []
    for (const opt of definedOptions) {
      if (!set.has(opt)) {
        set.add(opt)
        result.push({ value: opt, source: 'defined' })
      }
    }
    for (const val of usedValues) {
      if (!set.has(val)) {
        set.add(val)
        result.push({ value: val, source: 'used' })
      }
    }
    return result
  }, [definedOptions, usedValues])

  const filtered = useMemo(() => {
    if (!search) return allOptions
    const q = search.toLowerCase()
    return allOptions.filter((o) => o.value.toLowerCase().includes(q))
  }, [allOptions, search])

  const canCreateNew = search.trim() && !allOptions.some((o) => o.value.toLowerCase() === search.toLowerCase().trim())

  // Total items: filtered + optional "create new" row
  const totalItems = filtered.length + (canCreateNew ? 1 : 0)

  useEffect(() => {
    setHighlightIndex(0)
  }, [search])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

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

  const selectOption = useCallback(
    (opt: string) => {
      onChange(opt)
      setOpen(false)
    },
    [onChange],
  )

  const createAndSelect = useCallback(
    (newValue: string) => {
      const trimmed = newValue.trim()
      if (!trimmed || !fieldNodeId) return
      // Auto-collect: add to field definition's options list
      import('@/services/field.server').then(({ addFieldOptionServerFn }) => {
        addFieldOptionServerFn({ data: { fieldNodeId, option: trimmed } }).catch(() => {
          /* best-effort */
        })
      })
      // Update local state for immediate feedback
      setDefinedOptions((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
      onChange(trimmed)
      setOpen(false)
    },
    [fieldNodeId, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex < filtered.length) {
          selectOption(filtered[highlightIndex]!.value)
        } else if (canCreateNew) {
          createAndSelect(search)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
      e.stopPropagation()
    },
    [totalItems, highlightIndex, filtered, canCreateNew, search, selectOption, createAndSelect],
  )

  return (
    <div ref={anchorRef} className="relative">
      <span
        className={cn(
          editableClass,
          'cursor-text',
          value ? 'text-foreground/70' : 'text-foreground/25 italic',
        )}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else handleOpen()
        }}
      >
        {value || 'Empty'}
      </span>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-foreground/10 bg-popover shadow-lg">
          {/* Search input */}
          <div className="p-1.5 border-b border-foreground/5">
            <input
              ref={searchRef}
              type="text"
              className="w-full bg-transparent text-xs outline-none placeholder:text-foreground/30 px-1.5 py-1"
              placeholder="Search or type new..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && !canCreateNew && (
              <span className="block px-2 py-1 text-xs text-foreground/40">No options</span>
            )}
            {filtered.map((opt, i) => (
              <div
                key={opt.value}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-1 text-xs flex items-center gap-1.5',
                  'hover:bg-accent hover:text-accent-foreground',
                  i === highlightIndex && 'bg-accent text-accent-foreground',
                  opt.value === value && 'font-medium',
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectOption(opt.value)
                }}
              >
                <span className="flex-1 truncate">{opt.value}</span>
                {opt.source === 'used' && (
                  <span className="text-[10px] text-foreground/25 shrink-0">used</span>
                )}
              </div>
            ))}
            {/* Create new option */}
            {canCreateNew && (
              <div
                className={cn(
                  'cursor-pointer rounded-md px-2 py-1 text-xs flex items-center gap-1.5',
                  'hover:bg-primary/10 hover:text-primary',
                  highlightIndex === filtered.length && 'bg-primary/10 text-primary',
                  'border-t border-foreground/5 mt-0.5 pt-1.5',
                )}
                onMouseEnter={() => setHighlightIndex(filtered.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  createAndSelect(search)
                }}
              >
                <Plus size={12} weight="bold" className="shrink-0" />
                <span>Create &ldquo;{search.trim()}&rdquo;</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Instance field (options from supertag) ─── */

/**
 * Field type where options come from nodes tagged with a specific supertag.
 * E.g., an "Assignee" field shows all #Person nodes.
 * Typing a new value prompts creation of a new node with that supertag.
 */
function InstanceField({
  value,
  fieldNodeId,
  onChange,
}: {
  value: string
  fieldNodeId?: string
  onChange: (v: unknown) => void
}) {
  const [nodes, setNodes] = useState<{ id: string; content: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [supertagId, setSupertagId] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load the supertag ID from field definition's options (which stores the supertag reference)
  const loadNodes = useCallback(() => {
    if (loaded || !fieldNodeId) return
    import('@/services/field.server').then(async ({ getFieldOptionsServerFn, getNodesBySupertagServerFn }) => {
      try {
        // The field's options contain the supertag ID/systemId to pull from
        const optResult = await getFieldOptionsServerFn({ data: { fieldNodeId } })
        if (!optResult.success || optResult.options.length === 0) {
          setLoaded(true)
          return
        }
        const stId = optResult.options[0]! // First option is the supertag ID
        setSupertagId(stId)
        const nodesResult = await getNodesBySupertagServerFn({ data: { supertagId: stId } })
        if (nodesResult.success) setNodes(nodesResult.nodes)
        setLoaded(true)
      } catch {
        /* leave loaded=false */
      }
    })
  }, [fieldNodeId, loaded])

  const handleOpen = useCallback(() => {
    loadNodes()
    setOpen(true)
    setSearch('')
    setHighlightIndex(0)
  }, [loadNodes])

  const filtered = useMemo(() => {
    if (!search) return nodes
    const q = search.toLowerCase()
    return nodes.filter((n) => n.content.toLowerCase().includes(q))
  }, [nodes, search])

  // Display the selected node's content
  const selectedNode = useMemo(() => nodes.find((n) => n.id === value), [nodes, value])
  const displayValue = selectedNode?.content || value || ''

  const canCreateNew = search.trim() && !nodes.some((n) => n.content.toLowerCase() === search.toLowerCase().trim())
  const totalItems = filtered.length + (canCreateNew ? 1 : 0)

  useEffect(() => {
    setHighlightIndex(0)
  }, [search])

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

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

  const selectNode = useCallback(
    (nodeId: string) => {
      onChange(nodeId)
      setOpen(false)
    },
    [onChange],
  )

  const createAndSelect = useCallback(
    async (name: string) => {
      if (!supertagId) return
      try {
        const { createNodeServerFn } = await import('@/services/outline.server')
        const { addSupertagByNodeIdServerFn } = await import('@/services/supertag.server')
        // Create a new node
        const _result: unknown = await createNodeServerFn({ data: { content: name.trim(), parentId: null } })
        const result = _result as { success: boolean; nodeId: string }
        if (!result.success) return
        // Tag it with the supertag
        await addSupertagByNodeIdServerFn({ data: { nodeId: result.nodeId, supertagNodeId: supertagId } })
        // Update local list
        setNodes((prev) => [...prev, { id: result.nodeId, content: name.trim() }])
        onChange(result.nodeId)
        setOpen(false)
      } catch {
        /* best effort */
      }
    },
    [supertagId, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex < filtered.length) {
          selectNode(filtered[highlightIndex]!.id)
        } else if (canCreateNew) {
          createAndSelect(search)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
      e.stopPropagation()
    },
    [totalItems, highlightIndex, filtered, canCreateNew, search, selectNode, createAndSelect],
  )

  return (
    <div ref={anchorRef} className="relative">
      <span
        className={cn(
          editableClass,
          'cursor-text',
          displayValue ? 'text-foreground/70' : 'text-foreground/25 italic',
        )}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else handleOpen()
        }}
      >
        {displayValue || 'Empty'}
      </span>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-foreground/10 bg-popover shadow-lg">
          <div className="p-1.5 border-b border-foreground/5">
            <input
              ref={searchRef}
              type="text"
              className="w-full bg-transparent text-xs outline-none placeholder:text-foreground/30 px-1.5 py-1"
              placeholder="Search or create..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && !canCreateNew && (
              <span className="block px-2 py-1 text-xs text-foreground/40">
                {loaded ? 'No matching nodes' : 'Loading...'}
              </span>
            )}
            {filtered.map((node, i) => (
              <div
                key={node.id}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-1 text-xs',
                  'hover:bg-accent hover:text-accent-foreground',
                  i === highlightIndex && 'bg-accent text-accent-foreground',
                  node.id === value && 'font-medium',
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectNode(node.id)
                }}
              >
                {node.content || 'Untitled'}
              </div>
            ))}
            {canCreateNew && (
              <div
                className={cn(
                  'cursor-pointer rounded-md px-2 py-1 text-xs flex items-center gap-1.5',
                  'hover:bg-primary/10 hover:text-primary',
                  highlightIndex === filtered.length && 'bg-primary/10 text-primary',
                  'border-t border-foreground/5 mt-0.5 pt-1.5',
                )}
                onMouseEnter={() => setHighlightIndex(filtered.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  createAndSelect(search)
                }}
              >
                <Plus size={12} weight="bold" className="shrink-0" />
                <span>Create &ldquo;{search.trim()}&rdquo;</span>
              </div>
            )}
          </div>
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
  const [hasContent, setHasContent] = useState(!!value)

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

  const handleInput = useCallback(() => {
    if (ref.current) {
      setHasContent(!!(ref.current.textContent?.trim()))
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = (ref.current.textContent ?? '').trim()
    // Clear leftover browser DOM (e.g. <br>) so placeholder can show
    if (!newValue) ref.current.innerHTML = ''
    setHasContent(!!newValue)
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
        setHasContent(!!value)
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  useEffect(() => {
    setHasContent(!!value)
  }, [value])

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="relative flex-1 min-w-0 cursor-text" onClick={handleClick}>
        <div
          ref={ref}
          className={cn(
            editableClass,
            hasContent
              ? 'text-primary/70 underline underline-offset-2 decoration-primary/20'
              : 'text-foreground/25 italic',
            'cursor-text truncate min-h-[1.6em]',
          )}
          onInput={handleInput}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
        >
          {value || undefined}
        </div>
        {!hasContent && (
          <span className="pointer-events-none absolute inset-0 flex items-center px-1 text-[14.5px] leading-[1.6] text-foreground/25 italic">
            Empty
          </span>
        )}
      </div>
      {value && (
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
      )}
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
  const [hasContent, setHasContent] = useState(!!value)

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

  const handleInput = useCallback(() => {
    if (ref.current) {
      setHasContent(!!(ref.current.textContent?.trim()))
    }
  }, [])

  const commit = useCallback(() => {
    if (!ref.current) return
    isEditing.current = false
    ref.current.contentEditable = 'false'
    const newValue = (ref.current.textContent ?? '').trim()
    // Clear leftover browser DOM (e.g. <br>) so placeholder can show
    if (!newValue) ref.current.innerHTML = ''
    setHasContent(!!newValue)
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
        setHasContent(!!value)
        ref.current?.blur()
      }
      e.stopPropagation()
    },
    [value],
  )

  useEffect(() => {
    setHasContent(!!value)
  }, [value])

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="relative flex-1 min-w-0 cursor-text" onClick={handleClick}>
        <div
          ref={ref}
          className={cn(
            editableClass,
            hasContent
              ? 'text-primary/70 underline underline-offset-2 decoration-primary/20'
              : 'text-foreground/25 italic',
            'cursor-text truncate min-h-[1.6em]',
          )}
          onInput={handleInput}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
        >
          {value || undefined}
        </div>
        {!hasContent && (
          <span className="pointer-events-none absolute inset-0 flex items-center px-1 text-[14.5px] leading-[1.6] text-foreground/25 italic">
            Empty
          </span>
        )}
      </div>
      {value && (
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
      )}
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
        'flex items-start rounded-sm cursor-pointer',
        'hover:bg-foreground/[0.03] transition-colors duration-75',
      )}
      onClick={(e) => {
        e.stopPropagation()
        navigateToNode(value)
      }}
      title={`Go to: ${node.content || 'Untitled'}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigateToNode(value)
      }}
    >
      <Bullet
        hasChildren={node.children.length > 0}
        collapsed={true}
        childCount={node.children.length}
        tagColor={primaryTagColor}
        isSupertag={false}
        isReference
        onClick={(e) => {
          e.stopPropagation()
          navigateToNode(value)
        }}
      />
      <div className="node-content flex min-h-6 flex-1 items-start gap-1.5 px-1">
        <span className="text-[14.5px] leading-[1.6] text-foreground/70 truncate flex-1">
          {node.content || '\u200B'}
        </span>
        {node.supertags.length > 0 && (
          <div className="flex h-6 items-center gap-0.5">
            {node.supertags.map((tag) => (
              <SupertagPill key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
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
