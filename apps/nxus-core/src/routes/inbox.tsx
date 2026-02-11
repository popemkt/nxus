import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
  PencilSimpleIcon,
  PlusIcon,
  RobotIcon,
  TrashIcon,
  TrayIcon,
} from '@phosphor-icons/react'
import { Badge, Button , Card, CardContent  } from '@nxus/ui'
import type {InboxItem} from '@/services/inbox/inbox.server';
import {

  deleteInboxItemServerFn,
  getInboxItemsServerFn,
  updateInboxItemServerFn
} from '@/services/inbox/inbox.server'
import { initInboxReactiveServerFn } from '@/services/inbox/inbox-reactive.server'
import { useInboxModalStore } from '@/stores/inbox-modal.store'
import { InboxEditModal } from '@/components/features/inbox/inbox-edit-modal'
import { ProcessInboxModal } from '@/components/features/inbox/process-inbox-modal'
import { InboxMetricsBar } from '@/components/features/inbox/inbox-metrics-bar'

export const Route = createFileRoute('/inbox')({
  component: InboxPage,
  loader: async () => {
    const [result] = await Promise.all([
      getInboxItemsServerFn(),
      // Initialize inbox reactive system (computed fields, automations) —
      // idempotent, seeds the metrics so the first poll is instant.
      initInboxReactiveServerFn().catch(() => null),
    ])
    return result.success ? result.data : []
  },
})

function InboxPage() {
  const items = Route.useLoaderData()
  const [localItems, setLocalItems] = useState<Array<InboxItem>>(items)
  const { isOpen } = useInboxModalStore()

  // Modal state
  const [editingItem, setEditingItem] = useState<InboxItem | null>(null)
  const [processingItem, setProcessingItem] = useState<InboxItem | null>(null)

  // Refresh items helper
  const refreshItems = async () => {
    const result = await getInboxItemsServerFn()
    if (result.success) {
      setLocalItems(result.data)
    }
  }

  // Refresh items when modal closes (in case new item was added)
  useEffect(() => {
    if (!isOpen) {
      getInboxItemsServerFn().then((result) => {
        if (result.success) {
          setLocalItems(result.data)
        }
      })
    }
  }, [isOpen])

  const pendingItems = localItems.filter((i) => i.status === 'pending')
  const processingItems = localItems.filter((i) => i.status === 'processing')
  const doneItems = localItems.filter((i) => i.status === 'done')

  const handleCopyAndProcess = async (item: InboxItem) => {
    // Open the process modal instead of clipboard
    setProcessingItem(item)
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

  const handleDelete = async (id: string) => {
    const result = await deleteInboxItemServerFn({ data: { id } })
    if (result.success) {
      setLocalItems(localItems.filter((i) => i.id !== id))
    }
  }

  const openModal = () => {
    useInboxModalStore.getState().open()
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back Button */}
      <Link to="/">
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Gallery
        </Button>
      </Link>

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
        <Button onClick={openModal}>
          <PlusIcon data-icon="inline-start" />
          Add Item
        </Button>
      </div>

      {/* Metrics Bar */}
      <InboxMetricsBar />

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
                onEdit={() => setEditingItem(item)}
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
                onEdit={() => setEditingItem(item)}
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
                onEdit={() => setEditingItem(item)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <InboxEditModal
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
          onSave={(updated) => {
            setLocalItems(
              localItems.map((i) => (i.id === updated.id ? updated : i)),
            )
          }}
          onDelete={() => {
            setLocalItems(localItems.filter((i) => i.id !== editingItem.id))
          }}
        />
      )}

      {/* Process Modal */}
      {processingItem && (
        <ProcessInboxModal
          item={processingItem}
          open={!!processingItem}
          onOpenChange={(open) => !open && setProcessingItem(null)}
          onStart={() => refreshItems()}
        />
      )}
    </div>
  )
}

function InboxItemCard({
  item,
  onCopyAndProcess,
  onMarkDone,
  onEdit,
  onDelete,
}: {
  item: InboxItem
  onCopyAndProcess?: () => void
  onMarkDone?: () => void
  onEdit?: () => void
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
                title="Process with AI"
              >
                <RobotIcon className="h-4 w-4 mr-1" />
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
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                title="Edit item"
              >
                <PencilSimpleIcon className="h-4 w-4" />
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
