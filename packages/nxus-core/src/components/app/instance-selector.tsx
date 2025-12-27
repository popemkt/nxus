import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  PlusIcon,
  DownloadIcon,
} from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  useAppInstallations,
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

  // Empty state
  if (instances.length === 0 && !canAddInstance) {
    return null
  }

  return (
    <AnimatePresence mode="wait">
      {instances.length === 0 ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
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
                <Button
                  onClick={onAddInstanceClick}
                  disabled={isAddingInstance}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Add First Instance
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : !isExpanded ? (
        <motion.div
          key="compact"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="space-y-1"
        >
          <p className="text-xs font-medium text-muted-foreground px-1">
            Instance
          </p>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 ring-1 ring-border hover:ring-primary/50 hover:bg-muted/50 transition-all text-left group"
          >
            <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {selectedInstance?.installPath}
              </p>
            </div>
            {instances.length > 1 && (
              <span className="text-xs text-muted-foreground shrink-0">
                1/{instances.length}
              </span>
            )}
            <CaretDownIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="expanded"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
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
                  onClick={() => setIsExpanded(false)}
                  className="h-8 w-8"
                >
                  <CaretUpIcon className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {instances.map((instance, index) => {
                const isSelected = instance.id === selectedId
                return (
                  <motion.button
                    key={instance.id}
                    type="button"
                    onClick={() => handleSelect(instance)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.05,
                      ease: 'easeOut',
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg ring-1 transition-all text-left ${
                      isSelected
                        ? 'bg-primary/10 ring-primary'
                        : 'bg-muted/50 ring-border hover:ring-primary/50 hover:bg-muted'
                    }`}
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
                      <p className="text-sm font-mono truncate">
                        {instance.installPath}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Installed {formatDate(instance.installedAt)}
                      </p>
                    </div>
                  </motion.button>
                )
              })}

              {canAddInstance && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: instances.length * 0.05 }}
                >
                  <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground"
                    onClick={onAddInstanceClick}
                    disabled={isAddingInstance}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Add Another Instance
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
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
