import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Trash,
  Hash,
  GearSix,
  CaretRight,
  TreeStructure,
  Palette,
  PushPin,
  Asterisk,
  EyeSlash,
  TextAlignLeft,
  ChartBar,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { FieldType, HideWhen, SupertagBadge, OutlineNode } from '@/types/outline'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'
import { SupertagPill } from './supertag-pill'
import { BacklinksSection } from './backlinks-section'

interface SupertagDetailViewProps {
  node: OutlineNode
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
  description?: string
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

/**
 * Full-page detail view for supertag definition nodes.
 * Shows name, color, fields config, settings — like Tana's supertag page.
 */
export function SupertagDetailView({ node }: SupertagDetailViewProps) {
  const [config, setConfig] = useState<SupertagConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'fields' | 'settings'>('fields')
  const navigateToNode = useNavigateToNode()

  useEffect(() => {
    setLoading(true)
    import('@/services/supertag.server').then(({ getSupertagConfigServerFn }) => {
      getSupertagConfigServerFn({ data: { supertagId: node.id } })
        .then((result) => {
          if (result && typeof result === 'object' && 'success' in result && result.success && 'config' in result && result.config) {
            setConfig(result.config as SupertagConfig)
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [node.id])

  const color = config?.color ?? getSupertagColor(node.id)

  if (loading) {
    return (
      <div className="px-10 py-8 text-[13px] text-foreground/30">
        Loading supertag configuration...
      </div>
    )
  }

  if (!config) {
    return (
      <div className="px-10 py-8 text-[13px] text-foreground/30">
        Unable to load configuration.
      </div>
    )
  }

  return (
    <div className="supertag-detail-view flex-1 overflow-y-auto px-2 pb-40">
      {/* Header */}
      <div className="px-7 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Hash size={18} weight="bold" style={{ color }} className="opacity-70" />
          <h1 className="text-xl font-semibold text-foreground/90">
            {config.name || 'Untitled Supertag'}
          </h1>
        </div>

        {config.extendsSupertag && (
          <div className="flex items-center gap-1.5 text-[12px] text-foreground/30 ml-7">
            <TreeStructure size={12} />
            <span>Extends</span>
            <SupertagPill
              tag={config.extendsSupertag}
              size="sm"
              onClick={() => navigateToNode(config.extendsSupertag!.id)}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-foreground/[0.06] mx-7 mb-4">
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-[12px] font-medium transition-colors',
            activeTab === 'fields'
              ? 'text-foreground/70 border-b-2 border-foreground/30'
              : 'text-foreground/30 hover:text-foreground/50',
          )}
          onClick={() => setActiveTab('fields')}
        >
          Fields
        </button>
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-[12px] font-medium transition-colors',
            activeTab === 'settings'
              ? 'text-foreground/70 border-b-2 border-foreground/30'
              : 'text-foreground/30 hover:text-foreground/50',
          )}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {/* Tab content */}
      <div className="px-7">
        {activeTab === 'fields' ? (
          <FieldsTab config={config} setConfig={setConfig} />
        ) : (
          <SettingsTab config={config} setConfig={setConfig} color={color} />
        )}
      </div>

      {/* References */}
      <div className="px-7">
        <BacklinksSection nodeId={node.id} />
      </div>
    </div>
  )
}

/* ─── Fields Tab ─── */

function FieldsTab({
  config,
  setConfig,
}: {
  config: SupertagConfig
  setConfig: (c: SupertagConfig) => void
}) {
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return
    import('@/services/supertag.server').then(({ addSupertagFieldServerFn }) => {
      addSupertagFieldServerFn({
        data: {
          supertagId: config.id,
          fieldName: newFieldName.trim(),
          fieldType: 'text',
        },
      })
        .then((result) => {
          if (result && typeof result === 'object' && 'success' in result && result.success && 'field' in result) {
            const newField = result.field as ConfigField
            setConfig({
              ...config,
              ownFields: [...config.ownFields, newField],
            })
          }
          setNewFieldName('')
          setAddingField(false)
        })
        .catch(() => {})
    })
  }, [config, newFieldName, setConfig])

  const handleRemoveField = useCallback(
    (fieldNodeId: string) => {
      import('@/services/supertag.server').then(({ removeSupertagFieldServerFn }) => {
        removeSupertagFieldServerFn({
          data: { supertagId: config.id, fieldNodeId },
        })
          .then((result) => {
            if (result && typeof result === 'object' && 'success' in result && result.success) {
              setConfig({
                ...config,
                ownFields: config.ownFields.filter((f) => f.fieldNodeId !== fieldNodeId),
              })
            }
          })
          .catch(() => {})
      })
    },
    [config, setConfig],
  )

  const handleChangeConstraints = useCallback(
    (fieldNodeId: string, updates: Record<string, unknown>) => {
      import('@/services/supertag.server').then(({ updateFieldConstraintsServerFn }) => {
        updateFieldConstraintsServerFn({
          data: { fieldNodeId, ...updates },
        }).catch(() => {})
      })
      setConfig({
        ...config,
        ownFields: config.ownFields.map((f) =>
          f.fieldNodeId === fieldNodeId ? { ...f, ...updates } : f,
        ),
      })
    },
    [config, setConfig],
  )

  return (
    <div>
      {/* Own fields */}
      <div className="mb-4">
        <h3 className="text-[11px] uppercase tracking-wide text-foreground/30 mb-2">
          Own Fields ({config.ownFields.length})
        </h3>
        {config.ownFields.length === 0 && !addingField && (
          <div className="text-[12px] text-foreground/20 italic py-2">
            No fields defined yet.
          </div>
        )}
        {config.ownFields.map((field) => (
          <FieldConfigRow
            key={field.fieldNodeId}
            field={field}
            onChangeConstraints={(updates) =>
              handleChangeConstraints(field.fieldNodeId, updates)
            }
            onRemove={() => handleRemoveField(field.fieldNodeId)}
          />
        ))}

        {addingField ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              className="flex-1 text-[12px] bg-transparent outline-none border-b border-foreground/10 px-1 py-0.5 text-foreground/70 placeholder:text-foreground/25"
              placeholder="Field name..."
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddField()
                if (e.key === 'Escape') {
                  setAddingField(false)
                  setNewFieldName('')
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="text-[10px] text-foreground/30 hover:text-foreground/50 px-1"
              onClick={handleAddField}
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 mt-2 text-[11px] text-foreground/25 hover:text-foreground/40 transition-colors"
            onClick={() => setAddingField(true)}
          >
            <Plus size={10} weight="bold" />
            Add field
          </button>
        )}
      </div>

      {/* Inherited fields */}
      {config.inheritedFields.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-foreground/30 mb-2">
            Inherited Fields ({config.inheritedFields.length})
          </h3>
          {config.inheritedFields.map((field) => (
            <div
              key={field.fieldNodeId}
              className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-foreground/40 border-b border-foreground/[0.03]"
            >
              <GearSix size={10} className="shrink-0 opacity-40" />
              <span className="flex-1 truncate">{field.fieldName}</span>
              <span className="text-[10px] text-foreground/20 shrink-0">
                from #{field.fromSupertagName}
              </span>
              <span className="text-[10px] text-foreground/20 shrink-0">
                {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label ?? field.fieldType}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Settings Tab ─── */

function SettingsTab({
  config,
  setConfig,
  color,
}: {
  config: SupertagConfig
  setConfig: (c: SupertagConfig) => void
  color: string
}) {
  const handleUpdateConfig = useCallback(
    (updates: Record<string, unknown>) => {
      import('@/services/supertag.server').then(({ updateSupertagConfigServerFn }) => {
        updateSupertagConfigServerFn({
          data: { supertagId: config.id, ...updates },
        }).catch(() => {})
      })
    },
    [config.id],
  )

  return (
    <div className="space-y-5">
      {/* Color picker */}
      <div>
        <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-2">
          <Palette size={12} />
          Color
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-all',
                color === c ? 'border-foreground/40 scale-110' : 'border-transparent hover:border-foreground/20',
              )}
              style={{ backgroundColor: c }}
              onClick={() => {
                handleUpdateConfig({ color: c })
                setConfig({ ...config, color: c })
              }}
            />
          ))}
        </div>
      </div>

      {/* Content template */}
      <div>
        <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-2">
          <TextAlignLeft size={12} />
          Content Template
        </h3>
        <input
          type="text"
          className="w-full text-[12px] bg-foreground/[0.03] rounded-md px-2.5 py-1.5 text-foreground/70 outline-none border border-foreground/[0.06] placeholder:text-foreground/20"
          placeholder="Template for new nodes..."
          defaultValue={config.contentTemplate ?? ''}
          onBlur={(e) => {
            const val = e.target.value.trim() || null
            if (val !== config.contentTemplate) {
              handleUpdateConfig({ contentTemplate: val })
              setConfig({ ...config, contentTemplate: val })
            }
          }}
        />
      </div>

      {/* Default child supertag */}
      <div>
        <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-2">
          <TreeStructure size={12} />
          Default Child Supertag
        </h3>
        {config.defaultChildSupertag ? (
          <div className="flex items-center gap-1.5">
            <SupertagPill tag={config.defaultChildSupertag} size="sm" />
            <button
              type="button"
              className="text-[10px] text-foreground/25 hover:text-foreground/40"
              onClick={() => {
                handleUpdateConfig({ defaultChildSupertag: null })
                setConfig({ ...config, defaultChildSupertag: null })
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <span className="text-[12px] text-foreground/20 italic">None</span>
        )}
      </div>
    </div>
  )
}

/* ─── Field Config Row ─── */

function FieldConfigRow({
  field,
  onChangeConstraints,
  onRemove,
}: {
  field: ConfigField
  onChangeConstraints: (updates: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [usageStats, setUsageStats] = useState<{ nodeCount: number; supertagCount: number } | null>(null)
  const navigateToNode = useNavigateToNode()

  const loadUsageStats = useCallback(() => {
    if (usageStats) return
    import('@/services/supertag.server').then(({ getFieldUsageStatsServerFn }) => {
      getFieldUsageStatsServerFn({ data: { fieldNodeId: field.fieldNodeId } })
        .then((result) => {
          if (result && typeof result === 'object' && 'success' in result && result.success && 'stats' in result) {
            const stats = (result as { stats: { nodeCount: number; supertagCount: number } }).stats
            setUsageStats(stats)
          }
        })
        .catch(() => {})
    })
  }, [field.fieldNodeId, usageStats])

  const handleExpand = useCallback(() => {
    setExpanded((e) => !e)
    if (!expanded) loadUsageStats()
  }, [expanded, loadUsageStats])

  return (
    <div className="border-b border-foreground/[0.03]">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-foreground/[0.02] rounded-sm transition-colors"
        onClick={handleExpand}
      >
        <CaretRight
          size={10}
          weight="bold"
          className={cn(
            'shrink-0 text-foreground/25 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span
          className="flex-1 text-[12px] text-foreground/60 truncate cursor-pointer hover:text-foreground/80"
          onClick={(e) => {
            e.stopPropagation()
            navigateToNode(field.fieldNodeId)
          }}
        >
          {field.fieldName}
        </span>
        <span className="text-[10px] text-foreground/25 shrink-0">
          {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label ?? field.fieldType}
        </span>
        {field.required && <Asterisk size={10} className="text-foreground/25 shrink-0" />}
        {field.pinned && <PushPin size={10} className="text-foreground/25 shrink-0" />}
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="pl-6 pr-2 pb-2 space-y-2">
          {/* Description */}
          <div className="flex items-start gap-1.5">
            <TextAlignLeft size={10} className="shrink-0 text-foreground/20 mt-0.5" />
            <input
              type="text"
              className="flex-1 text-[11px] bg-transparent outline-none text-foreground/50 placeholder:text-foreground/20 border-b border-foreground/[0.05]"
              placeholder="Description..."
              defaultValue={field.description ?? ''}
              onBlur={(e) => {
                const desc = e.target.value.trim() || undefined
                if (desc !== field.description) {
                  onChangeConstraints({ description: desc })
                }
              }}
            />
          </div>

          {/* Field type */}
          <div className="flex items-center gap-1.5">
            <GearSix size={10} className="shrink-0 text-foreground/20" />
            <select
              className="text-[11px] bg-transparent text-foreground/50 outline-none cursor-pointer"
              value={field.fieldType}
              onChange={(e) => onChangeConstraints({ fieldType: e.target.value })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Required toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Asterisk size={10} className="shrink-0 text-foreground/20" />
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onChangeConstraints({ required: e.target.checked })}
              className="accent-primary"
            />
            <span className="text-[11px] text-foreground/40">Required</span>
          </label>

          {/* Pinned toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <PushPin size={10} className="shrink-0 text-foreground/20" />
            <input
              type="checkbox"
              checked={field.pinned ?? false}
              onChange={(e) => onChangeConstraints({ pinned: e.target.checked })}
              className="accent-primary"
            />
            <span className="text-[11px] text-foreground/40">Pinned</span>
          </label>

          {/* Hide when */}
          <div className="flex items-center gap-1.5">
            <EyeSlash size={10} className="shrink-0 text-foreground/20" />
            <select
              className="text-[11px] bg-transparent text-foreground/50 outline-none cursor-pointer"
              value={field.hideWhen ?? 'never'}
              onChange={(e) => onChangeConstraints({ hideWhen: e.target.value })}
            >
              {HIDE_WHEN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Usage stats */}
          {usageStats && (
            <div className="flex items-center gap-1.5 text-[10px] text-foreground/20">
              <ChartBar size={10} />
              <span>Used in {usageStats.nodeCount} nodes, {usageStats.supertagCount} supertags</span>
            </div>
          )}

          {/* Remove button */}
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-red-400/50 hover:text-red-400/80 transition-colors mt-1"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash size={10} />
            Remove field
          </button>
        </div>
      )}
    </div>
  )
}
