import * as React from 'react'
import { FolderOpenIcon, PlayIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle, Button , Checkbox , Input , Label ,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@nxus/ui'
import type { ScriptParam } from '@/services/shell/script-param-adapters/types'
import { openFolderPickerServerFn } from '@/services/shell/folder-picker.server'

interface ScriptParamsModalProps {
  scriptName: string
  params: Array<ScriptParam>
  open: boolean
  onOpenChange: (open: boolean) => void
  onRun: (values: Record<string, string | number | boolean>) => void
}

/**
 * Modal for collecting script parameters before execution
 */
export function ScriptParamsModal({
  scriptName,
  params,
  open,
  onOpenChange,
  onRun,
}: ScriptParamsModalProps) {
  const [values, setValues] = React.useState<
    Record<string, string | number | boolean>
  >({})

  // Initialize with default values
  React.useEffect(() => {
    const defaults: Record<string, string | number | boolean> = {}
    params.forEach((p) => {
      if (p.defaultValue !== undefined) {
        defaults[p.name] = p.defaultValue
      } else if (p.type === 'boolean') {
        defaults[p.name] = false
      } else if (p.type === 'number') {
        defaults[p.name] = 0
      } else {
        defaults[p.name] = ''
      }
    })
    setValues(defaults)
  }, [params])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onRun(values)
    onOpenChange(false)
  }

  const updateValue = (name: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const isValid = params
    .filter((p) => p.required)
    .every((p) => {
      const val = values[p.name]
      if (typeof val === 'boolean') return true
      return val !== undefined && val !== ''
    })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm">
              {scriptName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Enter parameters for this script
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {params.map((param) => (
              <div key={param.name} className="space-y-2">
                <Label htmlFor={param.name} className="flex items-center gap-1">
                  {param.name}
                  {param.required && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>

                {param.type === 'string' && (
                  <Input
                    id={param.name}
                    value={(values[param.name] as string) ?? ''}
                    onChange={(e) => updateValue(param.name, e.target.value)}
                    placeholder={param.description}
                  />
                )}

                {param.type === 'number' && (
                  <Input
                    id={param.name}
                    type="number"
                    value={(values[param.name] as number) ?? 0}
                    onChange={(e) =>
                      updateValue(param.name, Number(e.target.value))
                    }
                    placeholder={param.description}
                  />
                )}

                {param.type === 'boolean' && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={param.name}
                      checked={(values[param.name] as boolean) ?? false}
                      onCheckedChange={(checked) =>
                        updateValue(param.name, !!checked)
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

                {param.type === 'path' && (
                  <div className="flex gap-2">
                    <Input
                      id={param.name}
                      value={(values[param.name] as string) ?? ''}
                      onChange={(e) => updateValue(param.name, e.target.value)}
                      placeholder={param.description || 'Enter path...'}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        const currentPath = (values[param.name] as string) || ''
                        const result = await openFolderPickerServerFn({
                          data: {
                            startPath: currentPath,
                            title: `Select folder for ${param.name}`,
                          },
                        })
                        if (result.success && result.path) {
                          updateValue(param.name, result.path)
                        }
                      }}
                    >
                      <FolderOpenIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {param.type === 'select' && param.options && (
                  <Select
                    value={String(values[param.name] ?? '')}
                    onValueChange={(val) => updateValue(param.name, val)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={param.description || 'Select...'}
                      />
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

                {param.description && param.type !== 'boolean' && (
                  <p className="text-xs text-muted-foreground">
                    {param.description}
                  </p>
                )}
              </div>
            ))}
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
