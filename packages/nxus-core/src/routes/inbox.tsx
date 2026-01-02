import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TrayIcon,
  PlusIcon,
  ClipboardIcon,
  CheckIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  getInboxItemsServerFn,
  addInboxItemServerFn,
  updateInboxItemServerFn,
  deleteInboxItemServerFn,
  type InboxItem,
} from '@/services/inbox/inbox.server'

export const Route = createFileRoute('/inbox')({
  component: InboxPage,
  loader: async () => {
    const result = await getInboxItemsServerFn()
    return result.success ? result.data : []
  },
})

function InboxPage() {
  const items = Route.useLoaderData()
  const [localItems, setLocalItems] = useState<InboxItem[]>(items)
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const pendingItems = localItems.filter((i) => i.status === 'pending')
  const processingItems = localItems.filter((i) => i.status === 'processing')
  const doneItems = localItems.filter((i) => i.status === 'done')

  const handleAdd = async () => {
    if (!newTitle.trim()) return

    const result = await addInboxItemServerFn({
      data: { title: newTitle, notes: newNotes || undefined },
    })

    if (result.success) {
      setLocalItems([result.data, ...localItems])
      setNewTitle('')
      setNewNotes('')
      setIsAdding(false)
    }
  }

  const handleCopyAndProcess = async (item: InboxItem) => {
    // Copy item details to clipboard for manual workflow
    const text = `Add this item to Nxus registry:\n\nTitle: ${item.title}\n${item.notes ? `Notes: ${item.notes}` : ''}`
    await navigator.clipboard.writeText(text)

    // Mark as processing
    const result = await updateInboxItemServerFn({
      data: { id: item.id, status: 'processing' },
    })

    if (result.success && result.data) {
      setLocalItems(
        localItems.map((i) => (i.id === item.id ? result.data! : i)),
      )
    }
  }

  const handleMarkDone = async (item: InboxItem) => {
    const result = await updateInboxItemServerFn({
      data: { id: item.id, status: 'done' },
    })

    if (result.success && result.data) {
      setLocalItems(
        localItems.map((i) => (i.id === item.id ? result.data! : i)),
      )
    }
  }

  const handleDelete = async (id: number) => {
    const result = await deleteInboxItemServerFn({ data: { id } })
    if (result.success) {
      setLocalItems(localItems.filter((i) => i.id !== id))
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <TrayIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Inbox</h1>
            <p className="text-muted-foreground">
              Backlog of tools to add via add-item workflow
            </p>
          </div>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <PlusIcon data-icon="inline-start" />
          Add Item
        </Button>
      </div>

      {/* Quick Add Form */}
      {isAdding && (
        <Card className="mb-6 border-primary">
          <CardHeader>
            <CardTitle>Add to Inbox</CardTitle>
            <CardDescription>Quick note for later processing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Add Cursor IDE"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
              <Textarea
                id="notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any context, URLs, or details..."
                rows={3}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={!newTitle.trim()}>
                Add to Inbox
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Items */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Badge variant="default">{pendingItems.length}</Badge>
          Pending
        </h2>
        {pendingItems.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            No pending items. Add something to your backlog!
          </p>
        ) : (
          <div className="space-y-3">
            {pendingItems.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                onCopyAndProcess={() => handleCopyAndProcess(item)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Processing Items */}
      {processingItems.length > 0 && (
        <div className="space-y-4 mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Badge variant="secondary">{processingItems.length}</Badge>
            Processing
          </h2>
          <div className="space-y-3">
            {processingItems.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                onMarkDone={() => handleMarkDone(item)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Done Items */}
      {doneItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
            <Badge variant="outline">{doneItems.length}</Badge>
            Done
          </h2>
          <div className="space-y-3 opacity-60">
            {doneItems.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InboxItemCard({
  item,
  onCopyAndProcess,
  onMarkDone,
  onDelete,
}: {
  item: InboxItem
  onCopyAndProcess?: () => void
  onMarkDone?: () => void
  onDelete: () => void
}) {
  const statusVariants = {
    pending: 'default',
    processing: 'secondary',
    done: 'outline',
  } as const

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium">{item.title}</h3>
              <Badge variant={statusVariants[item.status]} className="text-xs">
                {item.status}
              </Badge>
            </div>
            {item.notes && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {item.notes}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Added {new Date(item.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {item.status === 'pending' && onCopyAndProcess && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCopyAndProcess}
                title="Copy to clipboard & mark as processing"
              >
                <ClipboardIcon className="h-4 w-4 mr-1" />
                Process
              </Button>
            )}
            {item.status === 'processing' && onMarkDone && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkDone}
                title="Mark as done"
              >
                <CheckIcon className="h-4 w-4 mr-1" />
                Done
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
