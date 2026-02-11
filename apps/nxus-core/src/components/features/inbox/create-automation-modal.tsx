import * as React from 'react'
import { LightningIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AutomationTemplate } from '@/services/inbox/inbox-reactive.server'
import { createInboxAutomationServerFn } from '@/services/inbox/inbox-reactive.server'

const TEMPLATE_OPTIONS: Array<{
  value: AutomationTemplate
  label: string
  description: string
}> = [
  {
    value: 'auto_archive',
    label: 'Auto-archive done items',
    description:
      'Automatically set archivedAt when an inbox item is marked done.',
  },
  {
    value: 'backlog_overflow',
    label: 'Backlog overflow alert',
    description:
      'Send a webhook when pending items exceed a threshold.',
  },
  {
    value: 'auto_tag',
    label: 'Auto-tag by keyword',
    description:
      'Add a supertag to inbox items that contain a keyword.',
  },
]

export interface CreateAutomationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreateAutomationModal({
  open,
  onOpenChange,
  onCreated,
}: CreateAutomationModalProps) {
  const queryClient = useQueryClient()

  const [template, setTemplate] = React.useState<AutomationTemplate | null>(
    null,
  )
  const [threshold, setThreshold] = React.useState('20')
  const [webhookUrl, setWebhookUrl] = React.useState('')
  const [keyword, setKeyword] = React.useState('')
  const [supertagId, setSupertagId] = React.useState('')

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setTemplate(null)
      setThreshold('20')
      setWebhookUrl('')
      setKeyword('')
      setSupertagId('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: () => {
      if (!template) throw new Error('No template selected')

      const config: Record<string, unknown> = {}
      if (template === 'backlog_overflow') {
        config.threshold = Number(threshold)
        config.webhookUrl = webhookUrl
      } else if (template === 'auto_tag') {
        config.keyword = keyword
        config.supertagId = supertagId
      }

      return createInboxAutomationServerFn({
        data: { template, config },
      })
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['inbox-automations'] })
        onCreated?.()
        onOpenChange(false)
      }
    },
  })

  const handleCreate = () => {
    if (!template) return
    createMutation.mutate()
  }

  const isValid = (() => {
    if (!template) return false
    if (template === 'backlog_overflow') {
      return Number(threshold) > 0 && webhookUrl.trim().length > 0
    }
    if (template === 'auto_tag') {
      return keyword.trim().length > 0 && supertagId.trim().length > 0
    }
    return true // auto_archive needs no config
  })()

  const selectedInfo = TEMPLATE_OPTIONS.find((t) => t.value === template)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <LightningIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Create Automation</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Choose a template and configure the automation.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Field>
            <FieldLabel htmlFor="template-select">Template</FieldLabel>
            <Select
              value={template ?? ''}
              onValueChange={(v) => setTemplate(v as AutomationTemplate)}
            >
              <SelectTrigger id="template-select">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedInfo.description}
              </p>
            )}
          </Field>

          {/* Dynamic config fields per template */}
          {template === 'backlog_overflow' && (
            <>
              <Field>
                <FieldLabel htmlFor="threshold">
                  Threshold <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="20"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="webhook-url">
                  Webhook URL <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.example.com/alert"
                />
              </Field>
            </>
          )}

          {template === 'auto_tag' && (
            <>
              <Field>
                <FieldLabel htmlFor="keyword">
                  Keyword <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g., urgent"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supertag-id">
                  Supertag ID <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="supertag-id"
                  value={supertagId}
                  onChange={(e) => setSupertagId(e.target.value)}
                  placeholder="e.g., supertag:urgent"
                />
              </Field>
            </>
          )}

          {createMutation.isError && (
            <p className="text-sm text-destructive">
              Failed to create automation. Please check your configuration.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={createMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleCreate}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
