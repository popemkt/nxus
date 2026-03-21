import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Plus,
  Trash,
  Hash,
  GearSix,
  CaretDown,
  TreeStructure,
  Palette,
  PushPin,
  Asterisk,
  EyeSlash,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { FieldType, HideWhen, SupertagBadge } from '@/types/outline'

interface SupertagConfigPanelProps {
  supertagId: string
  anchorRect: { top: number; left: number; width: number; height: number }
  onClose: () => void
}

interface SupertagConfig {
  id: string
  name: string
  systemId: string | null
  color: string | null
  ownFields: ConfigField[]
  inheritedFields: InheritedField[]
  defaultChildSupertag: SupertagBadge | null
  contentTemplate: string | null
  extendsSupertag: SupertagBadge | null
}

interface ConfigField {
  fieldNodeId: string
  fieldName: string
  fieldSystemId: string
  fieldType: string
  required?: boolean
  hideWhen?: string
  pinned?: boolean
}

interface InheritedField extends ConfigField {
  fromSupertagId: string
  fromSupertagName: string
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'instance', label: 'Instance' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'node', label: 'Node ref' },
  { value: 'nodes', label: 'Node refs' },
]

const HIDE_WHEN_OPTIONS: { value: HideWhen; label: string }[] = [
  { value: 'never', label: 'Always show' },
  { value: 'when_empty', label: 'Hide when empty' },
  { value: 'when_not_empty', label: 'Hide when filled' },
  { value: 'always', label: 'Always hide' },
]

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
]

export function SupertagConfigPanel({
  supertagId,
  anchorRect,
  onClose,
}: SupertagConfigPanelProps) {
  const [config, setConfig] = useState<SupertagConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'fields' | 'config'>('fields')
  const panelRef = useRef<HTMLDivElement>(null)

  // Load config on mount
  useEffect(() => {
    import('@/services/supertag.server').then(({ getSupertagConfigServerFn }) => {
      getSupertagConfigServerFn({ data: { supertagId } })
        .then((_result: unknown) => {
          const result = _result as { success: boolean; config?: SupertagConfig }
          if (result.success && result.config) {
            setConfig(result.config)
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [supertagId])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Position the panel below anchor, clamped to viewport
  const style = useMemo(() => {
    const top = anchorRect.top + anchorRect.height + 4
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 340))
    return {
      position: 'fixed' as const,
      top: Math.min(top, window.innerHeight - 420),
      left,
      zIndex: 100,
    }
  }, [anchorRect])

  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        'w-[320px] max-h-[400px] overflow-y-auto rounded-lg',
        'border border-foreground/10 bg-popover shadow-xl',
        'text-[13px] text-foreground/80',
      )}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <div className="px-4 py-6 text-center text-foreground/30">Loading…</div>
      ) : !config ? (
        <div className="px-4 py-6 text-center text-foreground/30">Failed to load</div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground/[0.06]">
            <Hash
              size={14}
              weight="bold"
              style={config.color ? { color: config.color } : undefined}
              className={!config.color ? 'text-foreground/40' : ''}
            />
            <span className="font-medium text-foreground/70 flex-1 truncate">
              {config.name}
            </span>
            <button
              type="button"
              className="p-0.5 rounded-sm text-foreground/30 hover:text-foreground/60 hover:bg-foreground/8"
              onClick={onClose}
            >
              <X size={14} weight="bold" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-foreground/[0.06]">
            <button
              type="button"
              className={cn(
                'flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors',
                activeSection === 'fields'
                  ? 'text-foreground/70 border-b-2 border-foreground/30'
                  : 'text-foreground/30 hover:text-foreground/50',
              )}
              onClick={() => setActiveSection('fields')}
            >
              Fields
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors',
                activeSection === 'config'
                  ? 'text-foreground/70 border-b-2 border-foreground/30'
                  : 'text-foreground/30 hover:text-foreground/50',
              )}
              onClick={() => setActiveSection('config')}
            >
              Settings
            </button>
          </div>

          {/* Content */}
          {activeSection === 'fields' ? (
            <FieldsTab
              config={config}
              onConfigChange={setConfig}
            />
          ) : (
            <SettingsTab
              config={config}
              onConfigChange={setConfig}
            />
          )}
        </>
      )}
    </div>,
    document.body,
  )
}

/* ─── Fields Tab ─── */

function FieldsTab({
  config,
  onConfigChange,
}: {
  config: SupertagConfig
  onConfigChange: (config: SupertagConfig) => void
}) {
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldType>('text')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingField && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [addingField])

  const handleAddField = useCallback(async () => {
    const trimmed = newFieldName.trim()
    if (!trimmed) return

    const { addSupertagFieldServerFn } = await import('@/services/supertag.server')
    const _result: unknown = await addSupertagFieldServerFn({
      data: {
        supertagId: config.id,
        fieldName: trimmed,
        fieldType: newFieldType,
      },
    })
    const result = _result as { success: boolean; field?: ConfigField }
    if (result.success && result.field) {
      onConfigChange({
        ...config,
        ownFields: [...config.ownFields, result.field],
      })
      setNewFieldName('')
      setNewFieldType('text')
      setAddingField(false)
    }
  }, [config, newFieldName, newFieldType, onConfigChange])

  const handleRemoveField = useCallback(
    async (fieldNodeId: string) => {
      const { removeSupertagFieldServerFn } = await import('@/services/supertag.server')
      await removeSupertagFieldServerFn({
        data: { supertagId: config.id, fieldNodeId },
      })
      onConfigChange({
        ...config,
        ownFields: config.ownFields.filter((f) => f.fieldNodeId !== fieldNodeId),
      })
    },
    [config, onConfigChange],
  )

  const handleChangeFieldType = useCallback(
    async (fieldNodeId: string, fieldType: FieldType) => {
      const { updateFieldTypeServerFn } = await import('@/services/supertag.server')
      await updateFieldTypeServerFn({ data: { fieldNodeId, fieldType } })
      onConfigChange({
        ...config,
        ownFields: config.ownFields.map((f) =>
          f.fieldNodeId === fieldNodeId ? { ...f, fieldType } : f,
        ),
      })
    },
    [config, onConfigChange],
  )

  const handleChangeConstraints = useCallback(
    async (fieldNodeId: string, constraints: { required?: boolean | null; hideWhen?: HideWhen | null; pinned?: boolean | null }) => {
      const { updateFieldConstraintsServerFn } = await import('@/services/supertag.server')
      await updateFieldConstraintsServerFn({ data: { fieldNodeId, ...constraints } })
      onConfigChange({
        ...config,
        ownFields: config.ownFields.map((f) => {
          if (f.fieldNodeId !== fieldNodeId) return f
          const updated = { ...f }
          if (constraints.required !== undefined) {
            updated.required = constraints.required ?? undefined
          }
          if (constraints.hideWhen !== undefined) {
            updated.hideWhen = constraints.hideWhen ?? undefined
          }
          if (constraints.pinned !== undefined) {
            updated.pinned = constraints.pinned ?? undefined
          }
          return updated
        }),
      })
    },
    [config, onConfigChange],
  )

  return (
    <div className="px-1 py-1">
      {/* Own fields */}
      {config.ownFields.length > 0 && (
        <div className="mb-1">
          {config.ownFields.map((field) => (
            <FieldConfigRow
              key={field.fieldNodeId}
              field={field}
              inherited={false}
              onRemove={() => handleRemoveField(field.fieldNodeId)}
              onChangeType={(type) => handleChangeFieldType(field.fieldNodeId, type)}
              onChangeConstraints={(c) => handleChangeConstraints(field.fieldNodeId, c)}
            />
          ))}
        </div>
      )}

      {/* Inherited fields */}
      {config.inheritedFields.length > 0 && (
        <div className="mb-1">
          <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-foreground/25 uppercase tracking-wider">
            Inherited
          </div>
          {config.inheritedFields.map((field) => (
            <FieldConfigRow
              key={field.fieldNodeId}
              field={field}
              inherited
              inheritedFrom={field.fromSupertagName}
              onRemove={() => {}}
              onChangeType={() => {}}
            />
          ))}
        </div>
      )}

      {/* Add field form */}
      {addingField ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            ref={nameInputRef}
            type="text"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddField()
              if (e.key === 'Escape') {
                setAddingField(false)
                setNewFieldName('')
              }
            }}
            className="flex-1 bg-transparent text-[12px] text-foreground/70 outline-none border-b border-foreground/10 px-1 py-0.5"
            placeholder="Field name…"
          />
          <FieldTypeSelect
            value={newFieldType}
            onChange={setNewFieldType}
          />
          <button
            type="button"
            className="text-foreground/30 hover:text-foreground/60 p-0.5"
            onClick={() => {
              setAddingField(false)
              setNewFieldName('')
            }}
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1 w-full px-2 py-1 text-[11px] text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03] rounded-md transition-colors"
          onClick={() => setAddingField(true)}
        >
          <Plus size={12} weight="bold" />
          Add field
        </button>
      )}

      {config.ownFields.length === 0 && config.inheritedFields.length === 0 && !addingField && (
        <div className="px-3 py-4 text-center text-foreground/25 text-[12px]">
          No fields defined
        </div>
      )}
    </div>
  )
}

function FieldConfigRow({
  field,
  inherited,
  inheritedFrom,
  onRemove,
  onChangeType,
  onChangeConstraints,
}: {
  field: ConfigField
  inherited: boolean
  inheritedFrom?: string
  onRemove: () => void
  onChangeType: (type: FieldType) => void
  onChangeConstraints?: (constraints: { required?: boolean | null; hideWhen?: HideWhen | null; pinned?: boolean | null }) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(inherited && 'opacity-60')}>
      <div
        className={cn(
          'group/configfield flex items-center gap-1 px-2 py-1 rounded-md',
          'hover:bg-foreground/[0.03] transition-colors',
        )}
      >
        {/* Expand toggle for constraints (own fields only) */}
        {!inherited && (
          <button
            type="button"
            className={cn(
              'p-0.5 rounded-sm text-foreground/20 hover:text-foreground/50 transition-colors shrink-0',
              expanded && 'text-foreground/40',
            )}
            onClick={() => setExpanded(!expanded)}
            title="Field settings"
          >
            <GearSix size={10} weight="bold" />
          </button>
        )}
        <span className={cn('flex-1 truncate text-[12px] text-foreground/60', inherited && 'pl-[18px]')}>
          {field.fieldName}
          {inheritedFrom && (
            <span className="text-foreground/20 ml-1 text-[10px]">
              from {inheritedFrom}
            </span>
          )}
          {/* Constraint badges */}
          {field.required && (
            <Asterisk size={8} weight="bold" className="inline ml-0.5 text-red-400/60" title="Required" />
          )}
          {field.pinned && (
            <PushPin size={8} weight="bold" className="inline ml-0.5 text-foreground/30" title="Pinned" />
          )}
          {field.hideWhen && field.hideWhen !== 'never' && (
            <EyeSlash size={8} weight="bold" className="inline ml-0.5 text-foreground/30" title={`Hide: ${field.hideWhen}`} />
          )}
        </span>
        <FieldTypeSelect
          value={field.fieldType as FieldType}
          onChange={onChangeType}
          disabled={inherited}
        />
        {!inherited && (
          <button
            type="button"
            className="p-0.5 rounded-sm text-foreground/15 opacity-0 group-hover/configfield:opacity-100 hover:text-red-400 hover:bg-foreground/8 transition-all"
            onClick={onRemove}
            title="Remove field"
          >
            <Trash size={11} weight="bold" />
          </button>
        )}
      </div>

      {/* Expanded constraint settings */}
      {expanded && !inherited && onChangeConstraints && (
        <div className="pl-6 pr-2 pb-1.5 space-y-1">
          {/* Required toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-foreground/40 hover:text-foreground/60">
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onChangeConstraints({ required: e.target.checked || null })}
              className="accent-red-400 w-3 h-3"
            />
            <Asterisk size={9} weight="bold" className="text-red-400/50" />
            Required
          </label>

          {/* Pinned toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-foreground/40 hover:text-foreground/60">
            <input
              type="checkbox"
              checked={!!field.pinned}
              onChange={(e) => onChangeConstraints({ pinned: e.target.checked || null })}
              className="accent-blue-400 w-3 h-3"
            />
            <PushPin size={9} weight="bold" className="text-foreground/30" />
            Pinned (show first)
          </label>

          {/* Hide-when select */}
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/40">
            <EyeSlash size={9} weight="bold" className="text-foreground/30 shrink-0" />
            <select
              value={field.hideWhen ?? 'never'}
              onChange={(e) => {
                const val = e.target.value as HideWhen
                onChangeConstraints({ hideWhen: val === 'never' ? null : val })
              }}
              className="bg-transparent text-[10px] text-foreground/50 outline-none cursor-pointer rounded-sm px-1 py-0.5 hover:bg-foreground/[0.05]"
            >
              {HIDE_WHEN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function FieldTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: FieldType
  onChange: (type: FieldType) => void
  disabled?: boolean
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FieldType)}
        disabled={disabled}
        className={cn(
          'appearance-none bg-transparent text-[10px] text-foreground/35',
          'pl-1 pr-3 py-0.5 rounded-sm cursor-pointer',
          'hover:bg-foreground/[0.05] hover:text-foreground/50 transition-colors',
          'focus:outline-none',
          disabled && 'cursor-default opacity-50',
        )}
      >
        {FIELD_TYPES.map((ft) => (
          <option key={ft.value} value={ft.value}>
            {ft.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={8}
        weight="bold"
        className="absolute right-0.5 top-1/2 -translate-y-1/2 text-foreground/20 pointer-events-none"
      />
    </div>
  )
}

/* ─── Settings Tab ─── */

function SettingsTab({
  config,
  onConfigChange,
}: {
  config: SupertagConfig
  onConfigChange: (config: SupertagConfig) => void
}) {
  const [supertags, setSupertags] = useState<SupertagBadge[]>([])
  const [supertagsLoaded, setSupertagsLoaded] = useState(false)

  // Fetch supertag list for pickers
  useEffect(() => {
    import('@/services/supertag.server').then(({ listSupertagsServerFn }) => {
      listSupertagsServerFn()
        .then((_result: unknown) => {
          const result = _result as { success: boolean; supertags?: SupertagBadge[] }
          if (result.success && result.supertags) {
            setSupertags(result.supertags)
          }
          setSupertagsLoaded(true)
        })
        .catch(() => setSupertagsLoaded(true))
    })
  }, [])

  const handleChangeDefaultChild = useCallback(
    async (supertagNodeId: string | null) => {
      const { updateSupertagConfigServerFn } = await import('@/services/supertag.server')
      await updateSupertagConfigServerFn({
        data: { supertagId: config.id, defaultChildSupertagId: supertagNodeId },
      })
      const newChild = supertagNodeId
        ? supertags.find((s) => s.id === supertagNodeId) ?? null
        : null
      onConfigChange({
        ...config,
        defaultChildSupertag: newChild,
      })
    },
    [config, onConfigChange, supertags],
  )

  const handleChangeExtends = useCallback(
    async (supertagNodeId: string | null) => {
      const { updateSupertagConfigServerFn } = await import('@/services/supertag.server')
      await updateSupertagConfigServerFn({
        data: { supertagId: config.id, extendsId: supertagNodeId },
      })
      const newParent = supertagNodeId
        ? supertags.find((s) => s.id === supertagNodeId) ?? null
        : null
      onConfigChange({
        ...config,
        extendsSupertag: newParent,
      })
    },
    [config, onConfigChange, supertags],
  )

  const handleChangeColor = useCallback(
    async (color: string | null) => {
      const { updateSupertagConfigServerFn } = await import('@/services/supertag.server')
      await updateSupertagConfigServerFn({
        data: { supertagId: config.id, color },
      })
      onConfigChange({
        ...config,
        color,
      })
    },
    [config, onConfigChange],
  )

  const handleChangeTemplate = useCallback(
    async (template: string | null) => {
      const { updateSupertagConfigServerFn } = await import('@/services/supertag.server')
      await updateSupertagConfigServerFn({
        data: { supertagId: config.id, contentTemplate: template },
      })
      onConfigChange({
        ...config,
        contentTemplate: template,
      })
    },
    [config, onConfigChange],
  )

  // Filter out self from supertag options
  const otherSupertags = supertags.filter((s) => s.id !== config.id)

  return (
    <div className="px-2 py-2 space-y-3">
      {/* Color */}
      <SettingRow icon={<Palette size={13} weight="bold" />} label="Color">
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-all',
                config.color === c
                  ? 'border-foreground/40 scale-110'
                  : 'border-transparent hover:border-foreground/20',
              )}
              style={{ backgroundColor: c }}
              onClick={() => handleChangeColor(config.color === c ? null : c)}
            />
          ))}
        </div>
      </SettingRow>

      {/* Extends */}
      <SettingRow icon={<TreeStructure size={13} weight="bold" />} label="Extends">
        <SupertagPicker
          value={config.extendsSupertag}
          options={otherSupertags}
          loaded={supertagsLoaded}
          placeholder="None"
          onChange={handleChangeExtends}
        />
      </SettingRow>

      {/* Default child supertag */}
      <SettingRow icon={<GearSix size={13} weight="bold" />} label="Default child tag">
        <SupertagPicker
          value={config.defaultChildSupertag}
          options={otherSupertags}
          loaded={supertagsLoaded}
          placeholder="None"
          onChange={handleChangeDefaultChild}
        />
      </SettingRow>

      {/* Content template */}
      <SettingRow icon={<GearSix size={13} weight="bold" />} label="Template">
        <TemplateEditor
          value={config.contentTemplate}
          onChange={handleChangeTemplate}
        />
      </SettingRow>
    </div>
  )
}

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1 text-[10px] font-medium text-foreground/30 uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="pl-4">{children}</div>
    </div>
  )
}

function SupertagPicker({
  value,
  options,
  loaded,
  placeholder,
  onChange,
}: {
  value: SupertagBadge | null
  options: SupertagBadge[]
  loaded: boolean
  placeholder: string
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(
    (s) => !query || s.name.toLowerCase().includes(query.toLowerCase()),
  )

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 w-full px-2 py-1 rounded-md text-[12px] text-left',
          'border border-foreground/[0.06] hover:border-foreground/10 transition-colors',
          value ? 'text-foreground/60' : 'text-foreground/25 italic',
        )}
        onClick={() => setOpen(!open)}
      >
        {value ? (
          <>
            <Hash
              size={10}
              weight="bold"
              style={value.color ? { color: value.color } : undefined}
            />
            <span className="flex-1 truncate">{value.name}</span>
            <button
              type="button"
              className="p-0.5 text-foreground/20 hover:text-foreground/50"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
                setOpen(false)
              }}
            >
              <X size={10} weight="bold" />
            </button>
          </>
        ) : (
          <span className="flex-1">{placeholder}</span>
        )}
        <CaretDown size={10} weight="bold" className="text-foreground/20" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-foreground/10 bg-popover shadow-lg overflow-hidden">
          {loaded && options.length > 5 && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-2 py-1 text-[11px] bg-transparent border-b border-foreground/[0.06] text-foreground/60 outline-none"
              placeholder="Search…"
              autoFocus
            />
          )}
          <div className="max-h-[160px] overflow-y-auto p-0.5">
            {!loaded ? (
              <div className="px-2 py-2 text-[11px] text-foreground/25">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-foreground/25">
                {query ? 'No matches' : 'No supertags available'}
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-[12px] text-left',
                    'hover:bg-accent hover:text-accent-foreground transition-colors',
                    value?.id === s.id && 'bg-accent/50',
                  )}
                  onClick={() => {
                    onChange(s.id)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <Hash
                    size={10}
                    weight="bold"
                    style={s.color ? { color: s.color } : undefined}
                    className={!s.color ? 'text-foreground/30' : ''}
                  />
                  <span className="truncate">{s.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TemplateEditor({
  value,
  onChange,
}: {
  value: string | null
  onChange: (template: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Parse existing template to show child items
  const children = useMemo(() => {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      if (parsed && Array.isArray(parsed.children)) {
        return parsed.children
          .filter((c: { content?: string }) => c && typeof c.content === 'string')
          .map((c: { content: string }) => c.content)
      }
    } catch {
      /* invalid JSON */
    }
    return []
  }, [value])

  const handleSave = useCallback(() => {
    const lines = draft
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      onChange(null)
    } else {
      onChange(JSON.stringify({ children: lines.map((l) => ({ content: l })) }))
    }
    setEditing(false)
  }, [draft, onChange])

  if (editing) {
    return (
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full px-2 py-1 rounded-md border border-foreground/10 bg-transparent text-[12px] text-foreground/60 outline-none resize-none"
          rows={3}
          placeholder="One child per line…"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
        />
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            className="px-2 py-0.5 text-[10px] rounded-md bg-foreground/10 text-foreground/60 hover:bg-foreground/15"
            onClick={handleSave}
          >
            Save
          </button>
          <button
            type="button"
            className="px-2 py-0.5 text-[10px] rounded-md text-foreground/30 hover:text-foreground/50"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {children.length > 0 ? (
        <div className="space-y-0.5 mb-1">
          {children.map((child: string, i: number) => (
            <div key={i} className="text-[11px] text-foreground/40 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-foreground/20 shrink-0" />
              {child}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-foreground/25 italic mb-1">No template</div>
      )}
      <button
        type="button"
        className="text-[10px] text-foreground/30 hover:text-foreground/50"
        onClick={() => {
          setDraft(children.join('\n'))
          setEditing(true)
        }}
      >
        {children.length > 0 ? 'Edit' : 'Add template'}
      </button>
    </div>
  )
}
