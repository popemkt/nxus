/**
 * TagSchemaModal Component
 *
 * Read-only modal to view a tag's configuration schema.
 * Shows field definitions, types, and defaults.
 *
 * Now uses integer tag IDs with optional slug display.
 */

import { Gear, Info, Asterisk } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@nxus/ui'
import { Badge } from '@nxus/ui'
import { getTagConfigServerFn } from '@/services/tag-config.server'
import { useQuery } from '@tanstack/react-query'

export interface TagSchemaModalProps {
  /** Integer tag ID */
  tagId: number
  /** Display name/slug for the modal title */
  tagName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SchemaField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'boolean' | 'select'
  required?: boolean
  placeholder?: string
  default?: unknown
  options?: string[]
}

export function TagSchemaModal({
  tagId,
  tagName,
  open,
  onOpenChange,
}: TagSchemaModalProps) {
  // Fetch the tag config
  const { data: configResult, isLoading } = useQuery({
    queryKey: ['tag-config', tagId],
    queryFn: () => getTagConfigServerFn({ data: { tagId } }),
    enabled: open && tagId > 0,
  })

  const config = configResult as
    | {
        success: boolean
        data?: { schema: { fields: SchemaField[] }; description?: string }
      }
    | undefined

  const schema = config?.success && config.data?.schema
  const description = config?.data?.description

  const displayName = tagName || `Tag #${tagId}`

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Gear className="h-5 w-5 text-primary" />
            <AlertDialogTitle>
              Tag Schema: <code className="text-primary">{displayName}</code>
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {description || 'Configuration schema for this tag.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : !schema ? (
            <div className="text-sm text-muted-foreground">
              No schema found for this tag.
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Configuration Fields
              </h4>

              <div className="space-y-3">
                {schema.fields.map((field: SchemaField) => (
                  <div
                    key={field.key}
                    className="p-3 rounded-md border bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {field.label}
                          </span>
                          {field.required && (
                            <Asterisk className="h-3 w-3 text-destructive" />
                          )}
                        </div>
                        <code className="text-xs text-muted-foreground">
                          {field.key}
                        </code>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {field.type}
                      </Badge>
                    </div>

                    {field.placeholder && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Example: {field.placeholder}
                      </p>
                    )}

                    {field.options && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {field.options.map((opt) => (
                          <Badge
                            key={opt}
                            variant="outline"
                            className="text-xs"
                          >
                            {opt}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {field.default !== undefined && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Default: <code>{JSON.stringify(field.default)}</code>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
