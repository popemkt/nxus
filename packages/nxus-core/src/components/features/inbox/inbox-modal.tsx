import * as React from 'react'
import { TrayIcon } from '@phosphor-icons/react'
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
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { useInboxModalStore } from '@/stores/inbox-modal.store'
import { addInboxItemServerFn } from '@/services/inbox/inbox.server'

/**
 * Modal for quickly adding items to inbox
 * Accessible from command palette or anywhere in the app
 */
export function InboxModal() {
  const { isOpen, close } = useInboxModalStore()
  const [title, setTitle] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await addInboxItemServerFn({
        data: { title: title.trim(), notes: notes.trim() || undefined },
      })
      setTitle('')
      setNotes('')
      close()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && title.trim()) {
      handleSubmit()
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <TrayIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Add to Inbox</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Quick note for a tool to add later
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Field>
            <FieldLabel htmlFor="inbox-title">Title</FieldLabel>
            <Input
              id="inbox-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add Cursor IDE"
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="inbox-notes">Notes (optional)</FieldLabel>
            <Textarea
              id="inbox-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context, URLs, or details..."
              rows={3}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Tip: Press ⌘+Enter to submit
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add to Inbox'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
