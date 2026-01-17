import { XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { useConfigureModalStore } from '@/stores/configure-modal.store'
import { useToolConfigStore } from '@/services/state/tool-config-state'
import { appRegistryService } from '@/services/apps/registry.service'
import type { ToolItem } from '@/types/item'

const EMPTY_CONFIG = {}

export function ConfigureModal() {
  const { isOpen, appId, close } = useConfigureModalStore()
  const config =
    useToolConfigStore((s) => (appId ? s.configs[appId] : null)) || EMPTY_CONFIG

  if (!isOpen || !appId) return null

  // Get app info
  const appResult = appRegistryService.getAppById(appId)
  if (!appResult.success) return null

  const app = appResult.data
  if (app.type !== 'tool' || !(app as ToolItem).configSchema) {
    return null
  }

  const toolApp = app as ToolItem
  const { configSchema } = toolApp

  const handleChange = (key: string, value: string) => {
    useToolConfigStore.getState().actions.setConfig(appId, key, value)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-background border border-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Configure {app.name}</h2>
            <p className="text-sm text-muted-foreground">{app.description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={close}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {configSchema?.fields.map((field) => (
            <Field key={field.key}>
              <FieldLabel>
                {field.label}
                {field.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </FieldLabel>
              <Input
                type={field.type === 'password' ? 'password' : 'text'}
                value={
                  (config as Record<string, string>)[field.key] ??
                  field.defaultValue ??
                  ''
                }
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            </Field>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={close}>Save</Button>
        </div>
      </div>
    </div>
  )
}
