/**
 * InboxEditModal Component
 *
 * Modal for editing inbox item details: title, notes, and status.
 * Also includes delete functionality.
 */

import * as React from 'react'
import { PencilSimple } from '@phosphor-icons/react'
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
import { Textarea } from '@nxus/ui'
import { Field, FieldLabel } from '@nxus/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import {
  updateInboxItemServerFn,
  deleteInboxItemServerFn,
  type InboxItem,
} from '@/services/inbox/inbox.server'
import { useMutation } from '@tanstack/react-query'

export interface InboxEditModalProps {
  item: InboxItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (updated: InboxItem) => void
  onDelete?: () => void
}

export function InboxEditModal({
  item,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: InboxEditModalProps) {
  const [title, setTitle] = React.useState(item.title)
  const [notes, setNotes] = React.useState(item.notes ?? '')
  const [status, setStatus] = React.useState<'pending' | 'processing' | 'done'>(
    item.status,
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  // Reset form when item changes
  React.useEffect(() => {
    if (open) {
      setTitle(item.title)
      setNotes(item.notes ?? '')
      setStatus(item.status)
      setShowDeleteConfirm(false)
    }
  }, [open, item])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: () =>
      updateInboxItemServerFn({
        data: {
          id: item.id,
          title: title.trim(),
          notes: notes.trim() || undefined,
          status,
        },
      }),
    onSuccess: (result) => {
      if (result.success && result.data) {
        onSave?.(result.data)
        onOpenChange(false)
      }
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteInboxItemServerFn({ data: { id: item.id } }),
    onSuccess: (result) => {
      if (result.success) {
        onDelete?.()
        onOpenChange(false)
      }
    },
  })

  const handleSave = () => {
    if (!title.trim()) return
    updateMutation.mutate()
  }

  const handleDelete = () => {
    deleteMutation.mutate()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && title.trim()) {
      handleSave()
    }
  }

  const isLoading = updateMutation.isPending || deleteMutation.isPending

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <PencilSimple className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Edit Inbox Item</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Update the title, notes, or status of this item.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Field>
            <FieldLabel htmlFor="edit-title">
              Title <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add Cursor IDE"
              autoFocus
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-notes">Notes</FieldLabel>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context, URLs, or details..."
              rows={3}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-status">Status</FieldLabel>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as typeof status)}
            >
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Delete section */}
          <div className="pt-2 border-t">
            {showDeleteConfirm ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  Are you sure?
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isLoading}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                Delete this item
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: Press ⌘+Enter to save
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <Button onClick={handleSave} disabled={!title.trim() || isLoading}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
