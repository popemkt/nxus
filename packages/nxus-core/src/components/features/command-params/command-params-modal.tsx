import * as React from 'react'
import { PlayIcon, FolderOpenIcon, Warning } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { openFolderPickerServerFn } from '@/services/shell/folder-picker.server'
import { getAppsByConfiguredTagServerFn } from '@/services/tag-config.server'
import { getAllAppsServerFn } from '@/services/apps/apps.server'
import { checkToolHealth } from '@/services/tool-health/tool-health.server'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CommandRequirement, CommandParam } from '@/types/command-params'
import {
  isParamRequired,
  getParamLabel,
  getParamDefaultValue,
} from '@/types/command-params'
import type { Item } from '@/types/item'

interface RequirementOption {
  appId: string
  appName: string
  value: Record<string, unknown>
  isInstalled: boolean
  checkCommand?: string
}

export interface CommandParamsModalProps {
  title: string
  description?: string
  requirements?: CommandRequirement[]
  params?: CommandParam[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onRun: (result: {
    requirements: Record<string, RequirementOption>
    params: Record<string, string | number | boolean>
  }) => void
}

/**
 * Combined modal for collecting command requirements (tagged item selectors)
 * and user input parameters before command execution
 */
export function CommandParamsModal({
  title,
  description,
  requirements = [],
  params = [],
  open,
  onOpenChange,
  onRun,
}: CommandParamsModalProps) {
  // Selected requirements (appId -> option)
  const [selectedRequirements, setSelectedRequirements] = React.useState<
    Record<string, RequirementOption | null>
  >({})

  // Param values
  const [paramValues, setParamValues] = React.useState<
    Record<string, string | number | boolean>
  >({})

  // Fetch options for each requirement
  const { data: requirementOptions, isLoading } = useQuery({
    queryKey: ['command-requirement-options', requirements.map((r) => r.tagId)],
    queryFn: async () => {
      const optionsByName: Record<string, RequirementOption[]> = {}

      for (const req of requirements) {
        const [tagValuesResult, appsResult] = await Promise.all([
          getAppsByConfiguredTagServerFn({ data: { tagId: req.tagId } }),
          getAllAppsServerFn(),
        ])

        const tagValues = tagValuesResult as {
          success: boolean
          data?: Array<{ appId: string; values: Record<string, unknown> }>
        }

        if (!tagValues.success || !tagValues.data || !appsResult.success) {
          optionsByName[req.name] = []
          continue
        }

        const appsMap = new Map<string, Item>(
          appsResult.apps.map((app) => [app.id, app]),
        )

        // Check health for each option
        const options = await Promise.all(
          tagValues.data.map(async (tv) => {
            const app = appsMap.get(tv.appId)
            if (!app) return null

            const checkCommand =
              app.type === 'tool' && 'checkCommand' in app
                ? (app as any).checkCommand
                : undefined

            let isInstalled = false
            if (checkCommand) {
              try {
                const healthResult = await checkToolHealth({
                  data: { checkCommand },
                })
                isInstalled = healthResult.isInstalled
              } catch {
                isInstalled = app.status === 'installed'
              }
            } else {
              isInstalled = app.status === 'installed'
            }

            return {
              appId: app.id,
              appName: app.name,
              value: tv.values,
              isInstalled,
              checkCommand,
            }
          }),
        )

        optionsByName[req.name] = options.filter(
          (o): o is NonNullable<typeof o> => o !== null,
        ) as RequirementOption[]
      }

      return optionsByName
    },
    enabled: open && requirements.length > 0,
  })

  // Initialize param values with defaults
  React.useEffect(() => {
    if (open) {
      const defaults: Record<string, string | number | boolean> = {}
      params.forEach((p) => {
        defaults[p.name] = getParamDefaultValue(p)
      })
      setParamValues(defaults)
      setSelectedRequirements({})
    }
  }, [open, params])

  // Auto-select first installed option for requirements
  React.useEffect(() => {
    if (requirementOptions && Object.keys(selectedRequirements).length === 0) {
      const initial: Record<string, RequirementOption | null> = {}
      for (const req of requirements) {
        const options = requirementOptions[req.name] || []
        // Prefer first installed option
        const installed = options.find((o) => o.isInstalled)
        initial[req.name] = installed || options[0] || null
      }
      setSelectedRequirements(initial)
    }
  }, [requirementOptions, requirements, selectedRequirements])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validRequirements: Record<string, RequirementOption> = {}
    for (const [name, opt] of Object.entries(selectedRequirements)) {
      if (opt) validRequirements[name] = opt
    }
    onRun({ requirements: validRequirements, params: paramValues })
    onOpenChange(false)
  }

  const updateParam = (name: string, value: string | number | boolean) => {
    setParamValues((prev) => ({ ...prev, [name]: value }))
  }

  // Validation: all required params filled, all requirements selected & installed
  const isValid = React.useMemo(() => {
    // Check requirements
    for (const req of requirements) {
      const selected = selectedRequirements[req.name]
      if (!selected || !selected.isInstalled) return false
    }
    // Check required params
    for (const param of params) {
      if (isParamRequired(param)) {
        const val = paramValues[param.name]
        if (val === undefined || val === '') return false
      }
    }
    return true
  }, [requirements, selectedRequirements, params, paramValues])

  const hasNoConfig = requirements.length === 0 && params.length === 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {hasNoConfig && (
              <p className="text-sm text-muted-foreground">
                No configuration required.
              </p>
            )}

            {/* Requirements Section */}
            {requirements.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Select Required Items
                </p>

                {isLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : (
                  requirements.map((req) => {
                    const options = requirementOptions?.[req.name] || []
                    const selected = selectedRequirements[req.name]

                    if (options.length === 0) {
                      return (
                        <div key={req.name} className="space-y-2">
                          <Label>{req.label || req.name}</Label>
                          <div className="p-3 bg-muted/50 rounded-md">
                            <div className="flex items-center gap-2 text-amber-600">
                              <Warning className="h-4 w-4" />
                              <span className="text-sm">
                                No items with this tag configured
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={req.name} className="space-y-2">
                        <Label>{req.label || req.name}</Label>
                        <div className="space-y-2">
                          {options.map((opt) => (
                            <button
                              key={opt.appId}
                              type="button"
                              onClick={() =>
                                setSelectedRequirements((prev) => ({
                                  ...prev,
                                  [req.name]: opt,
                                }))
                              }
                              className={cn(
                                'w-full p-3 rounded-md border text-left transition-colors',
                                selected?.appId === opt.appId
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:bg-muted/50',
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {opt.appName}
                                </span>
                                {opt.isInstalled ? (
                                  <Badge variant="outline" className="text-xs">
                                    Installed
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Not Installed
                                  </Badge>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        {req.description && (
                          <p className="text-xs text-muted-foreground">
                            {req.description}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Params Section */}
            {params.length > 0 && (
              <div className="space-y-3">
                {requirements.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">
                    Parameters
                  </p>
                )}

                {params.map((param) => (
                  <div key={param.name} className="space-y-2">
                    <Label
                      htmlFor={param.name}
                      className="flex items-center gap-1"
                    >
                      {getParamLabel(param)}
                      {isParamRequired(param) && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>

                    {/* String input */}
                    {param.dataType === 'string' &&
                      param.uiType === 'input' && (
                        <Input
                          id={param.name}
                          value={(paramValues[param.name] as string) ?? ''}
                          onChange={(e) =>
                            updateParam(param.name, e.target.value)
                          }
                          placeholder={param.description}
                        />
                      )}

                    {/* String textarea */}
                    {param.dataType === 'string' &&
                      param.uiType === 'textarea' && (
                        <Textarea
                          id={param.name}
                          value={(paramValues[param.name] as string) ?? ''}
                          onChange={(e) =>
                            updateParam(param.name, e.target.value)
                          }
                          placeholder={param.description}
                          rows={3}
                        />
                      )}

                    {/* Number input */}
                    {param.dataType === 'number' && (
                      <Input
                        id={param.name}
                        type="number"
                        value={(paramValues[param.name] as number) ?? 0}
                        onChange={(e) =>
                          updateParam(param.name, Number(e.target.value))
                        }
                        placeholder={param.description}
                      />
                    )}

                    {/* Boolean checkbox */}
                    {param.dataType === 'boolean' && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={param.name}
                          checked={
                            (paramValues[param.name] as boolean) ?? false
                          }
                          onCheckedChange={(checked) =>
                            updateParam(param.name, !!checked)
                          }
                        />
                        <Label
                          htmlFor={param.name}
                          className="text-sm text-muted-foreground"
                        >
                          {param.description || 'Enable'}
                        </Label>
                      </div>
                    )}

                    {/* Path picker */}
                    {param.dataType === 'path' && (
                      <div className="flex gap-2">
                        <Input
                          id={param.name}
                          value={(paramValues[param.name] as string) ?? ''}
                          onChange={(e) =>
                            updateParam(param.name, e.target.value)
                          }
                          placeholder={param.description || 'Enter path...'}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={async () => {
                            const result = await openFolderPickerServerFn({
                              data: {
                                startPath:
                                  (paramValues[param.name] as string) || '',
                                title: `Select folder for ${getParamLabel(param)}`,
                              },
                            })
                            if (result.success && result.path) {
                              updateParam(param.name, result.path)
                            }
                          }}
                        >
                          <FolderOpenIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {/* Select dropdown */}
                    {param.dataType === 'select' && (
                      <Select
                        value={String(paramValues[param.name] ?? '')}
                        onValueChange={(val) =>
                          updateParam(param.name, val ?? '')
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {param.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {param.description && param.dataType !== 'boolean' && (
                      <p className="text-xs text-muted-foreground">
                        {param.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" disabled={!isValid}>
              <PlayIcon className="h-4 w-4 mr-1" />
              Run
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
