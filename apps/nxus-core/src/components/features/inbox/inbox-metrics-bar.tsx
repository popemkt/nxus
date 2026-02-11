import { useQuery } from '@tanstack/react-query'
import { GearIcon } from '@phosphor-icons/react'
import { Badge, Card, CardContent, Button } from '@nxus/ui'
import { getInboxMetricsServerFn } from '@/services/inbox/inbox-reactive.server'

/**
 * Compact metrics bar showing inbox item counts by status.
 * Placed at the top of the inbox page above item lists.
 */
export function InboxMetricsBar() {
  const { data, isLoading } = useQuery({
    queryKey: ['inbox-metrics'],
    queryFn: () => getInboxMetricsServerFn(),
    staleTime: 10_000, // 10 seconds
    refetchInterval: 30_000, // 30 seconds
  })

  const metrics = data?.success ? data.metrics : null

  return (
    <Card className="mb-6">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MetricStat
              label="Total"
              value={metrics?.totalItems}
              isLoading={isLoading}
            />
            <MetricStat
              label="Pending"
              value={metrics?.pendingCount}
              isLoading={isLoading}
              variant="default"
            />
            <MetricStat
              label="Processing"
              value={metrics?.processingCount}
              isLoading={isLoading}
              variant="secondary"
            />
            <MetricStat
              label="Done"
              value={metrics?.doneCount}
              isLoading={isLoading}
              variant="outline"
            />
          </div>
          <a href="/inbox/automations">
            <Button variant="ghost" size="sm">
              <GearIcon data-icon="inline-start" />
              Automations
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
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
