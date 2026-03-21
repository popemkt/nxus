import { useCallback, useEffect, useState } from 'react'
import {
  GearSix,
  Asterisk,
  PushPin,
  EyeSlash,
  TextAlignLeft,
  ChartBar,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { FieldType, HideWhen, OutlineNode } from '@/types/outline'
import { BacklinksSection } from './backlinks-section'

interface FieldDetailViewProps {
  node: OutlineNode
}

interface FieldConfig {
  fieldType: string
  required?: boolean
  hideWhen?: string
  pinned?: boolean
  description?: string
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

/**
 * Full-page detail view for field definition nodes.
 * Shows field type, constraints, usage stats — like Tana's field config page.
 */
export function FieldDetailView({ node }: FieldDetailViewProps) {
  const [config, setConfig] = useState<FieldConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [usageStats, setUsageStats] = useState<{ nodeCount: number; supertagCount: number } | null>(null)

  // Load field constraints
  useEffect(() => {
    setLoading(true)
    import('@/services/supertag.server').then(({ getFieldUsageStatsServerFn }) => {
      // Load usage stats
      getFieldUsageStatsServerFn({ data: { fieldNodeId: node.id } })
        .then((result) => {
          if (result && typeof result === 'object' && 'success' in result && result.success && 'stats' in result) {
            const stats = (result as { stats: { nodeCount: number; supertagCount: number } }).stats
            setUsageStats(stats)
          }
        })
        .catch(() => {})
    })

    // Extract field config from node's own fields
    const fieldTypeField = node.fields.find((f) => f.fieldSystemId === 'field:field_type')
    const requiredField = node.fields.find((f) => f.fieldSystemId === 'field:required')
    const hideWhenField = node.fields.find((f) => f.fieldSystemId === 'field:hide_when')
    const pinnedField = node.fields.find((f) => f.fieldSystemId === 'field:pinned')
    const descField = node.fields.find((f) => f.fieldSystemId === 'field:description')

    setConfig({
      fieldType: String(fieldTypeField?.values[0]?.value ?? 'text'),
      required: requiredField?.values[0]?.value === true || requiredField?.values[0]?.value === 'true',
      hideWhen: String(hideWhenField?.values[0]?.value ?? 'never'),
      pinned: pinnedField?.values[0]?.value === true || pinnedField?.values[0]?.value === 'true',
      description: descField?.values[0]?.value ? String(descField.values[0].value) : undefined,
    })
    setLoading(false)
  }, [node])

  const handleUpdate = useCallback(
    (updates: Record<string, unknown>) => {
      import('@/services/supertag.server').then(({ updateFieldConstraintsServerFn }) => {
        updateFieldConstraintsServerFn({
          data: { fieldNodeId: node.id, ...updates },
        }).catch(() => {})
      })
      if (config) {
        setConfig({ ...config, ...updates })
      }
    },
    [node.id, config],
  )

  if (loading || !config) {
    return (
      <div className="px-10 py-8 text-[13px] text-foreground/30">
        Loading field configuration...
      </div>
    )
  }

  const fieldTypeLabel = FIELD_TYPES.find((t) => t.value === config.fieldType)?.label ?? config.fieldType

  return (
    <div className="field-detail-view flex-1 overflow-y-auto px-2 pb-40">
      {/* Header */}
      <div className="px-7 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <GearSix size={18} weight="bold" className="text-foreground/30" />
          <h1 className="text-xl font-semibold text-foreground/90">
            {node.content || 'Untitled Field'}
          </h1>
        </div>
        <div className="ml-7 text-[12px] text-foreground/30">
          Field definition &middot; {fieldTypeLabel}
        </div>
      </div>

      {/* Configuration */}
      <div className="px-7 space-y-4">
        {/* Description */}
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-1.5">
            <TextAlignLeft size={12} />
            Description
          </h3>
          <input
            type="text"
            className="w-full text-[12px] bg-foreground/[0.03] rounded-md px-2.5 py-1.5 text-foreground/70 outline-none border border-foreground/[0.06] placeholder:text-foreground/20"
            placeholder="Describe this field..."
            defaultValue={config.description ?? ''}
            onBlur={(e) => {
              const desc = e.target.value.trim() || undefined
              if (desc !== config.description) {
                handleUpdate({ description: desc })
              }
            }}
          />
        </div>

        {/* Field type */}
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-1.5">
            <GearSix size={12} />
            Type
          </h3>
          <select
            className={cn(
              'text-[12px] bg-foreground/[0.03] rounded-md px-2.5 py-1.5',
              'text-foreground/70 outline-none border border-foreground/[0.06]',
              'cursor-pointer',
            )}
            value={config.fieldType}
            onChange={(e) => handleUpdate({ fieldType: e.target.value })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Constraints */}
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-foreground/30 mb-1.5">
            Constraints
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Asterisk size={12} className="text-foreground/25" />
              <input
                type="checkbox"
                checked={config.required ?? false}
                onChange={(e) => handleUpdate({ required: e.target.checked })}
                className="accent-primary"
              />
              <span className="text-[12px] text-foreground/50">Required</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <PushPin size={12} className="text-foreground/25" />
              <input
                type="checkbox"
                checked={config.pinned ?? false}
                onChange={(e) => handleUpdate({ pinned: e.target.checked })}
                className="accent-primary"
              />
              <span className="text-[12px] text-foreground/50">Pinned (show at top)</span>
            </label>

            <div className="flex items-center gap-2">
              <EyeSlash size={12} className="text-foreground/25" />
              <select
                className="text-[12px] bg-transparent text-foreground/50 outline-none cursor-pointer"
                value={config.hideWhen ?? 'never'}
                onChange={(e) => handleUpdate({ hideWhen: e.target.value })}
              >
                {HIDE_WHEN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Usage stats */}
        {usageStats && (
          <div>
            <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-foreground/30 mb-1.5">
              <ChartBar size={12} />
              Usage
            </h3>
            <div className="text-[12px] text-foreground/40">
              Used in {usageStats.nodeCount} node{usageStats.nodeCount !== 1 ? 's' : ''} across {usageStats.supertagCount} supertag{usageStats.supertagCount !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* References */}
      <div className="px-7">
        <BacklinksSection nodeId={node.id} />
      </div>
    </div>
  )
}
