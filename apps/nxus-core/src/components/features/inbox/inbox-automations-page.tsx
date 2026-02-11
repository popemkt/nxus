import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  LightningIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
} from '@nxus/ui'
import type { InboxMetrics } from '@/services/inbox/inbox-reactive.server'
import {
  getInboxMetricsServerFn,
  getInboxAutomationsServerFn,
  toggleInboxAutomationServerFn,
  deleteInboxAutomationServerFn,
} from '@/services/inbox/inbox-reactive.server'
import { useInboxAutomationsStore } from '@/stores/inbox-automations.store'
import { CreateAutomationModal } from '@/components/features/inbox/create-automation-modal'

interface AutomationItem {
  id: string
  name: string
  enabled: boolean
  trigger: Record<string, unknown>
  action: Record<string, unknown>
  lastTriggered: string | null
}

export function InboxAutomationsPage({
  initialAutomations,
  initialMetrics,
}: {
  initialAutomations: AutomationItem[]
  initialMetrics: InboxMetrics | null
}) {
  const queryClient = useQueryClient()
  const { isModalOpen, openModal, closeModal } = useInboxAutomationsStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Automations query
  const { data: automationsData } = useQuery({
    queryKey: ['inbox-automations'],
    queryFn: () => getInboxAutomationsServerFn(),
    initialData: { success: true as const, automations: initialAutomations },
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  // Metrics query (reuses same cache as metrics bar)
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['inbox-metrics'],
    queryFn: () => getInboxMetricsServerFn(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  const automations = automationsData?.success
    ? automationsData.automations
    : initialAutomations

  const metrics = metricsData?.success
    ? metricsData.metrics
    : initialMetrics

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: ({
      automationId,
      enabled,
    }: {
      automationId: string
      enabled: boolean
    }) => toggleInboxAutomationServerFn({ data: { automationId, enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-automations'] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (automationId: string) =>
      deleteInboxAutomationServerFn({ data: { automationId } }),
    onSuccess: () => {
      setDeletingId(null)
      queryClient.invalidateQueries({ queryKey: ['inbox-automations'] })
    },
  })

  const handleToggle = (id: string, currentEnabled: boolean) => {
    toggleMutation.mutate({ automationId: id, enabled: !currentEnabled })
  }

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      deleteMutation.mutate(id)
    } else {
      setDeletingId(id)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back Button */}
      <Link to="/inbox">
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Inbox
        </Button>
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <LightningIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Inbox Automations</h1>
            <p className="text-muted-foreground">
              Manage reactive automations for your inbox
            </p>
          </div>
        </div>
        <Button onClick={openModal}>
          <PlusIcon data-icon="inline-start" />
          Add Automation
        </Button>
      </div>

      {/* Metrics Summary */}
      <Card className="mb-6">
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <MetricStat
              label="Total"
              value={metrics?.totalItems}
              isLoading={metricsLoading}
            />
            <MetricStat
              label="Pending"
              value={metrics?.pendingCount}
              isLoading={metricsLoading}
              variant="default"
            />
            <MetricStat
              label="Processing"
              value={metrics?.processingCount}
              isLoading={metricsLoading}
              variant="secondary"
            />
            <MetricStat
              label="Done"
              value={metrics?.doneCount}
              isLoading={metricsLoading}
              variant="outline"
            />
          </div>
        </CardContent>
      </Card>

      {/* Automations List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Badge variant="default">{automations.length}</Badge>
          Automations
        </h2>

        {automations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No automations yet. Create one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {automations.map((auto) => (
              <Card key={auto.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Checkbox
                        checked={auto.enabled}
                        onCheckedChange={() =>
                          handleToggle(auto.id, auto.enabled)
                        }
                        disabled={toggleMutation.isPending}
                        aria-label={
                          auto.enabled
                            ? `Disable ${auto.name}`
                            : `Enable ${auto.name}`
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {auto.name}
                          </span>
                          <Badge
                            variant={auto.enabled ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {auto.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        {auto.lastTriggered && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last triggered{' '}
                            {new Date(auto.lastTriggered).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {deletingId === auto.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Sure?
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                          >
                            No
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(auto.id)}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? 'Deleting...' : 'Yes'}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(auto.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateAutomationModal
        open={isModalOpen}
        onOpenChange={(open) => !open && closeModal()}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['inbox-automations'] })
        }}
      />
    </div>
  )
}

function MetricStat({
  label,
  value,
  isLoading,
  variant,
}: {
  label: string
  value: number | undefined
  isLoading: boolean
  variant?: 'default' | 'secondary' | 'outline'
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {isLoading ? (
        <span className="inline-block h-5 w-6 animate-pulse rounded bg-muted" />
      ) : variant ? (
        <Badge variant={variant}>{value ?? 0}</Badge>
      ) : (
        <span className="font-semibold">{value ?? 0}</span>
      )}
    </div>
  )
}
