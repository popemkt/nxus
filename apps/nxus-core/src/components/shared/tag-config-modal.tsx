/**
 * TagConfigModal Component
 *
 * Modal for configuring values for a configurable tag.
 * Dynamically generates form fields based on the tag's schema.
 */

import * as React from 'react'
import { GearIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@nxus/ui'
import { Button } from '@nxus/ui'
import { Input } from '@nxus/ui'
import { Field, FieldLabel } from '@nxus/ui'
import { Checkbox } from '@nxus/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import {
  type TagConfigField,
  getTagConfigServerFn,
  getAppTagValuesServerFn,
  setAppTagValuesServerFn,
} from '@/services/tag-config.server'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface TagConfigSchema {
  fields: TagConfigField[]
}

export interface TagConfigModalProps {
  /** Tag ID to configure */
  tagId: number
  /** Tag name for display */
  tagName?: string
  /** App ID to configure values for */
  appId: string
  /** App name for display */
  appName?: string
  /** Whether the modal is open */
  open: boolean
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void
  /** Callback after successful save */
  onSave?: () => void
}

export function TagConfigModal({
  tagId,
  tagName,
  appId,
  appName,
  open,
  onOpenChange,
  onSave,
}: TagConfigModalProps) {
  const queryClient = useQueryClient()
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>(
    {},
  )
  const [error, setError] = React.useState<string | null>(null)

  // Fetch tag schema
  const { data: schemaResult, isLoading: isLoadingSchema } = useQuery({
    queryKey: ['tag-config', tagId],
    queryFn: () => getTagConfigServerFn({ data: { tagId } }),
    enabled: open,
  })

  // Fetch current values
  const { data: valuesResult, isLoading: isLoadingValues } = useQuery({
    queryKey: ['app-tag-values', appId, tagId],
    queryFn: () => getAppTagValuesServerFn({ data: { appId, tagId } }),
    enabled: open,
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const result = await setAppTagValuesServerFn({
        data: { appId, tagId, configValues: values },
      })
      return result
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ['app-tag-values', appId] })
        onOpenChange(false)
        onSave?.()
      } else {
        setError(result?.error ?? 'Failed to save')
      }
    },
    onError: (err: any) => {
      console.error('[TagConfigModal] Save error:', err)
      setError(err?.message ?? 'Failed to save configuration')
    },
  })

  // Initialize form with current values or defaults
  React.useEffect(() => {
    if (!schemaResult?.success || !schemaResult.data) return

    const schema = schemaResult.data.schema
    const currentValues = (
      valuesResult as {
        success: boolean
        data?: { values: Record<string, unknown> }
      }
    )?.success
      ? (valuesResult as { data: { values: Record<string, unknown> } }).data
          .values
      : {}
    const initialValues: Record<string, unknown> = {}

    for (const field of schema.fields) {
      initialValues[field.key] =
        currentValues[field.key] ??
        field.default ??
        getDefaultForType(field.type)
    }

    setFormValues(initialValues)
    setError(null)
  }, [schemaResult, valuesResult, open])

  const handleChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const handleSave = () => {
    saveMutation.mutate(formValues)
  }

  const isLoading = isLoadingSchema || isLoadingValues
  const schema = schemaResult?.success ? schemaResult.data.schema : null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <GearIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Configure: {tagName || tagId}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {appName
              ? `Configure ${tagName || tagId} settings for ${appName}`
              : `Configure ${tagName || tagId} settings for this app`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">
              Loading configuration...
            </div>
          ) : !schema ? (
            <div className="text-center text-destructive py-4">
              Failed to load configuration schema
            </div>
          ) : (
            schema.fields.map((field) => (
              <ConfigFieldInput
                key={field.key}
                field={field}
                value={formValues[field.key]}
                onChange={(value) => handleChange(field.key, value)}
              />
            ))
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleSave}
            disabled={isLoading || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Config'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Render a form field based on its type
 */
function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: TagConfigField
  value: unknown
  onChange: (value: unknown) => void
}) {
  switch (field.type) {
    case 'text':
    case 'password':
      return (
        <Field>
          <FieldLabel htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </FieldLabel>
          <Input
            id={field.key}
            type={field.type === 'password' ? 'password' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </Field>
      )

    case 'boolean':
      return (
        <Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.key}
              checked={(value as boolean) ?? false}
              onCheckedChange={(checked) => onChange(checked)}
            />
            <FieldLabel htmlFor={field.key} className="mb-0">
              {field.label}
            </FieldLabel>
          </div>
        </Field>
      )

    case 'number':
      return (
        <Field>
          <FieldLabel htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </FieldLabel>
          <Input
            id={field.key}
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
          />
        </Field>
      )

    case 'select':
      return (
        <Field>
          <FieldLabel htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </FieldLabel>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val)}
          >
            <SelectTrigger id={field.key}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )

    default:
      return null
  }
}

/**
 * Get default value for a field type
 */
function getDefaultForType(type: TagConfigField['type']): unknown {
  switch (type) {
    case 'text':
    case 'password':
      return ''
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'select':
      return ''
    default:
      return ''
  }
}
