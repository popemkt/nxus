import { createFileRoute } from '@tanstack/react-router'
import {
  getInboxAutomationsServerFn,
  getInboxMetricsServerFn,
  initInboxReactiveServerFn,
} from '@/services/inbox/inbox-reactive.server'
import { InboxAutomationsPage } from '@/components/features/inbox/inbox-automations-page'

export const Route = createFileRoute('/inbox_/automations')({
  component: AutomationsRoute,
  loader: async () => {
    // Initialize reactive system first (idempotent)
    await initInboxReactiveServerFn().catch(() => null)

    const [automationsResult, metricsResult] = await Promise.all([
      getInboxAutomationsServerFn(),
      getInboxMetricsServerFn(),
    ])

    return {
      automations: automationsResult.success
        ? automationsResult.automations
        : [],
      metrics: metricsResult.success ? metricsResult.metrics : null,
    }
  },
})

function AutomationsRoute() {
  const { automations, metrics } = Route.useLoaderData()

  return (
    <InboxAutomationsPage
      initialAutomations={automations}
      initialMetrics={metrics}
    />
  )
}
