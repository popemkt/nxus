import * as React from 'react'
import { GearIcon, CheckIcon } from '@phosphor-icons/react'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { toolConfigService } from '@/services/state/tool-config-state'
import type { ConfigField, ToolApp } from '@/types/app'

interface ConfigModalProps {
  app: ToolApp
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Configuration modal for tools with configSchema
 * Allows setting API keys, URLs, etc.
 */
export function ConfigModal({ app, open, onOpenChange }: ConfigModalProps) {
  const fields = app.configSchema?.fields ?? []

  // Initialize form state with current config values or defaults
  const [formValues, setFormValues] = React.useState<Record<string, string>>(
    () => {
      const currentConfig = toolConfigService.getConfigs(app.id)
      const initialValues: Record<string, string> = {}

      fields.forEach((field) => {
        initialValues[field.key] =
          currentConfig[field.key] ?? field.defaultValue ?? ''
      })

      return initialValues
    },
  )

  // Reset form when modal opens with latest config
  React.useEffect(() => {
    if (open) {
      const currentConfig = toolConfigService.getConfigs(app.id)
      const values: Record<string, string> = {}

      fields.forEach((field) => {
        values[field.key] = currentConfig[field.key] ?? field.defaultValue ?? ''
      })

      setFormValues(values)
    }
  }, [open, app.id, fields])

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    // Save all values to config store
    toolConfigService.setConfigs(app.id, formValues)
    onOpenChange(false)
  }

  const handleClear = () => {
    // Clear all config for this tool
    toolConfigService.clearAllToolConfigs(app.id)
    setFormValues({})
  }

  // Check if all required fields are filled
  const isValid = fields
    .filter((f) => f.required)
    .every((f) => formValues[f.key]?.trim())

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <GearIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Configure {app.name}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Set up configuration values for this tool. These are stored locally
            and persisted across sessions.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {fields.map((field) => (
            <ConfigFieldInput
              key={field.key}
              field={field}
              value={formValues[field.key] ?? ''}
              onChange={(value) => handleChange(field.key, value)}
            />
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={handleClear}>
            Clear All
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            <CheckIcon className="h-4 w-4 mr-1" />
            Save
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Individual config field input
 */
function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={field.key}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </FieldLabel>
      <Input
        id={field.key}
        type={field.type === 'password' ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </Field>
  )
}
