import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import { Card, CardHeader, CardTitle, CardDescription } from '@nxus/ui'
import { miniApps } from '@/config/mini-apps'
import type { MiniApp } from '@/config/mini-apps'
import { Glass3DCards } from '@/components/visuals/glass-3d-cards'
import { TerminalCards } from '@/components/visuals/terminal-cards'
import { OrbitalCards } from '@/components/visuals/orbital-cards'
import { MinimalZenCards } from '@/components/visuals/minimal-zen-cards'
import { BlueprintCards } from '@/components/visuals/blueprint-cards'
import { BentoGridCards } from '@/components/visuals/bento-grid-cards'
import { SpatialCards } from '@/components/visuals/spatial-cards'
import { DashboardCards } from '@/components/visuals/dashboard-cards'
import {
  VisualSwitcher,
  getStoredVisual,
  setStoredVisual,
} from '@/components/visual-switcher'
import type { VisualStyle } from '@/components/visual-switcher'

export const Route = createFileRoute('/')({
  component: GatewayPage,
})

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function MiniAppCard({ app }: { app: MiniApp }) {
  const Icon = iconMap[app.icon]

  return (
    <a
      href={app.path}
      className="group block no-underline"
    >
      <Card className="h-full transition-all duration-200 hover:ring-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={22} weight="duotone" />
            </div>
            <ArrowRight
              size={16}
              weight="bold"
              className="text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5"
            />
          </div>
          <CardTitle className="mt-3 text-base">{app.name}</CardTitle>
          <CardDescription>{app.description}</CardDescription>
        </CardHeader>
      </Card>
    </a>
  )
}

function DefaultVisual({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">n</span>Xus
          </h1>
          <p className="text-sm text-muted-foreground">
            Select an application to get started.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <MiniAppCard key={app.id} app={app} />
          ))}
        </div>
      </div>
    </div>
  )
}

const visualComponents: Record<VisualStyle, React.ComponentType<{ apps: MiniApp[] }>> = {
  default: DefaultVisual,
  'glass-3d': Glass3DCards,
  terminal: TerminalCards,
  orbital: OrbitalCards,
  zen: MinimalZenCards,
  blueprint: BlueprintCards,
  bento: BentoGridCards,
  spatial: SpatialCards,
  dashboard: DashboardCards,
}

function GatewayPage() {
  const [visual, setVisual] = useState<VisualStyle>(getStoredVisual)

  const handleVisualChange = (v: VisualStyle) => {
    setVisual(v)
    setStoredVisual(v)
  }

  const VisualComponent = visualComponents[visual]

  return (
    <>
      <VisualComponent apps={miniApps} />
      <VisualSwitcher current={visual} onChange={handleVisualChange} />
    </>
  )
}
