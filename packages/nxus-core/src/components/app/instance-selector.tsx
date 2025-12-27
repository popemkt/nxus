import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  PlusIcon,
  DownloadIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAppInstallations,
  appStateService,
  type InstalledAppRecord,
} from '@/services/state/app-state'

interface InstanceSelectorProps {
  appId: string
  canAddInstance: boolean
  onAddInstanceClick: () => void
  isAddingInstance?: boolean
  /** Called when an instance is selected */
  onInstanceSelect?: (instance: InstalledAppRecord | null) => void
  /** Currently selected instance ID (controlled mode) */
  selectedInstanceId?: string | null
}

/**
 * Instance Selector Component
 *
 * - Compact mode: Shows only the selected instance with expand toggle
 * - Expanded mode: Shows all instances to choose from
 * - Collapses back to compact after selection
 */
// Animation Variants
const variants = {
  empty: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 },
  },
  compact: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  expanded: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.3, ease: 'easeInOut' },
  },
  item: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
  },
}

export function InstanceSelector({
  appId,
  canAddInstance,
  onAddInstanceClick,
  isAddingInstance,
  onInstanceSelect,
  selectedInstanceId: controlledSelectedId,
}: InstanceSelectorProps) {
  const instances = useAppInstallations(appId)
  const [isExpanded, setIsExpanded] = React.useState(false)

  // Internal state for uncontrolled mode
  const [internalSelectedId, setInternalSelectedId] = React.useState<
    string | null
  >(instances[0]?.id ?? null)

  // Use controlled or uncontrolled mode
  const selectedId = controlledSelectedId ?? internalSelectedId
  const selectedInstance =
    instances.find((i) => i.id === selectedId) ?? instances[0] ?? null

  // Update internal state when instances change
  React.useEffect(() => {
    if (!controlledSelectedId && instances.length > 0 && !selectedInstance) {
      setInternalSelectedId(instances[0].id)
    }
  }, [instances, controlledSelectedId, selectedInstance])

  // Notify parent of selection changes
  React.useEffect(() => {
    onInstanceSelect?.(selectedInstance)
  }, [selectedInstance, onInstanceSelect])

  const handleSelect = (instance: InstalledAppRecord) => {
    if (!controlledSelectedId) {
      setInternalSelectedId(instance.id)
    }
    onInstanceSelect?.(instance)
    setIsExpanded(false) // Collapse after selection
  }

  // Pre-calculate common props
  const isEmpty = instances.length === 0

  if (isEmpty && !canAddInstance) {
    return null
  }

  return (
    <AnimatePresence mode="wait">
      {isEmpty ? (
        <EmptyView
          key="empty"
          onAdd={onAddInstanceClick}
          disabled={isAddingInstance}
        />
      ) : !isExpanded ? (
        <CompactView
          key="compact"
          selectedInstance={selectedInstance}
          instanceCount={instances.length}
          onExpand={() => setIsExpanded(true)}
        />
      ) : (
        <ExpandedView
          key="expanded"
          instances={instances}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCollapse={() => setIsExpanded(false)}
          canAdd={canAddInstance}
          onAdd={onAddInstanceClick}
          isAdding={isAddingInstance}
        />
      )}
    </AnimatePresence>
  )
}

// Sub-components

function EmptyView({
  onAdd,
  disabled,
}: {
  onAdd: () => void
  disabled?: boolean
}) {
  return (
    <motion.div key="empty" {...variants.empty}>
      <Card>
        <CardHeader>
          <CardTitle>Instances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <FolderIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No instances yet
            </p>
            <Button onClick={onAdd} disabled={disabled}>
              <DownloadIcon data-icon="inline-start" />
              Add First Instance
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function CompactView({
  selectedInstance,
  instanceCount,
  onExpand,
}: {
  selectedInstance: InstalledAppRecord | null
  instanceCount: number
  onExpand: () => void
}) {
  return (
    <motion.div key="compact" {...variants.compact} className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground px-1">Instance</p>
      <button
        type="button"
        onClick={onExpand}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 ring-1 ring-border hover:ring-primary/50 hover:bg-muted/50 transition-all text-left group"
      >
        <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono truncate text-muted-foreground group-hover:text-foreground transition-colors">
            {selectedInstance?.name || selectedInstance?.installPath}
          </p>
        </div>
        {instanceCount > 1 && (
          <span className="text-xs text-muted-foreground shrink-0">
            1/{instanceCount}
          </span>
        )}
        <CaretDownIcon className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
    </motion.div>
  )
}

function ExpandedView({
  instances,
  selectedId,
  onSelect,
  onCollapse,
  canAdd,
  onAdd,
  isAdding,
}: {
  instances: InstalledAppRecord[]
  selectedId: string | null
  onSelect: (instance: InstalledAppRecord) => void
  onCollapse: () => void
  canAdd: boolean
  onAdd: () => void
  isAdding?: boolean
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState('')

  const handleStartEdit = (
    e: React.MouseEvent,
    instance: InstalledAppRecord,
  ) => {
    e.stopPropagation() // Prevent selection
    setEditingId(instance.id)
    setEditValue(instance.name || '')
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      const instance = instances.find((i) => i.id === editingId)
      if (instance) {
        appStateService.updateInstallationName(
          instance.appId,
          instance.id,
          editValue.trim(),
        )
      }
      setEditingId(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  return (
    <motion.div
      key="expanded"
      {...variants.expanded}
      className="overflow-hidden"
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Instances
              <span className="text-muted-foreground font-normal text-sm">
                ({instances.length})
              </span>
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              className="h-8 w-8"
            >
              <CaretUpIcon className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {instances.map((instance, index) => {
            const isSelected = instance.id === selectedId
            const isEditing = editingId === instance.id

            return (
              <motion.div
                key={instance.id}
                initial="initial"
                animate="animate"
                variants={variants.item}
                transition={{
                  duration: 0.2,
                  delay: index * 0.05,
                  ease: 'easeOut',
                }}
                className={`w-full relative group rounded-lg ring-1 transition-all text-left ${
                  isSelected
                    ? 'bg-primary/10 ring-primary'
                    : 'bg-muted/50 ring-border hover:ring-primary/50 hover:bg-muted'
                }`}
              >
                {isEditing ? (
                  <form
                    onSubmit={handleSaveEdit}
                    className="flex items-center gap-2 p-2"
                  >
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Instance Name"
                      className="h-8 text-sm"
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Escape') handleCancelEdit()
                        e.stopPropagation()
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button type="submit" size="sm" variant="ghost">
                      Save
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(instance)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    {isSelected ? (
                      <CheckIcon
                        className="h-5 w-5 text-primary shrink-0"
                        weight="bold"
                      />
                    ) : (
                      <FolderIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${instance.name ? '' : 'italic text-muted-foreground'}`}
                        >
                          {instance.name || 'Unnamed Instance'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 font-mono truncate">
                        {instance.installPath}
                      </p>
                    </div>
                  </button>
                )}

                {!isEditing && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={(e) => handleStartEdit(e, instance)}
                      title="Rename Instance"
                    >
                      <PencilSimpleIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </motion.div>
            )
          })}

          {canAdd && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: instances.length * 0.05 }}
            >
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
                onClick={onAdd}
                disabled={isAdding}
              >
                <PlusIcon data-icon="inline-start" />
                Add Another Instance
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
