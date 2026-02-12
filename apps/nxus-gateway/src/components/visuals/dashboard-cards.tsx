import { useState, useCallback, useRef } from 'react'
import {
  Cube,
  Graph,
  CalendarBlank,
  GearSix,
  Terminal,
  Clock,
  HardHat,
} from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

/* Reusable spotlight panel */
function Panel({
  children,
  className,
  href,
}: {
  children: React.ReactNode
  className?: string
  href?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    []
  )

  const Wrapper = href ? 'a' : 'div'

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={`group relative block overflow-hidden rounded-xl border bg-card/80 no-underline transition-colors duration-300 hover:border-primary/40 ${className ?? ''}`}
    >
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setOpacity(1)}
        onMouseLeave={() => setOpacity(0)}
        className="relative h-full"
      >
        <div
          className="pointer-events-none absolute -inset-px rounded-xl transition-opacity duration-300"
          style={{
            opacity,
            background: `radial-gradient(500px circle at ${pos.x}px ${pos.y}px, color-mix(in oklch, var(--primary) 8%, transparent), transparent 40%)`,
          }}
        />
        <div className="relative h-full">{children}</div>
      </div>
    </Wrapper>
  )
}

/* Status dot with ping animation */
function StatusDot() {
  return (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
    </span>
  )
}

export function DashboardCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-5xl space-y-6">
        {/* Under construction banner */}
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <HardHat
            size={20}
            weight="duotone"
            className="shrink-0 text-yellow-500"
          />
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <span className="font-medium">Under construction</span> — This
            dashboard view is a preview. Data shown is illustrative only.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-primary">n</span>Xus{' '}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / overview
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>SYS.STATUS:</span>
            <StatusDot />
            <span className="text-green-500">OPTIMAL</span>
          </div>
        </div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[180px]">
          {/* Core Services — wide panel with stats */}
          <Panel className="md:col-span-2 p-6" href={apps[0]?.path}>
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <Cube size={18} weight="duotone" />
                  <span className="font-medium text-sm">Core Services</span>
                </div>
                <StatusDot />
              </div>

              <div className="mt-auto grid grid-cols-3 gap-2">
                {[
                  { label: 'CPU', value: '12%' },
                  { label: 'MEM', value: '2.4GB' },
                  { label: 'NET', value: '98ms' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border bg-background/50 p-2.5"
                  >
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-base font-medium text-card-foreground mt-0.5">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Workbench — recent workflows */}
          <Panel className="md:col-span-2 p-6" href={apps[1]?.path}>
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 text-primary mb-3">
                <Graph size={18} weight="duotone" />
                <span className="font-medium text-sm">Recent Workflows</span>
              </div>

              <div className="flex-1 space-y-1 overflow-hidden">
                {[
                  { name: 'Data_Ingest_Pipeline.nx', time: '1h ago' },
                  { name: 'Auth_Flow_V2.nx', time: '2h ago' },
                  { name: 'Nightly_Backup.nx', time: '5h ago' },
                ].map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="font-mono text-xs text-card-foreground truncate">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                      {file.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Calendar — next event */}
          <Panel className="md:col-span-1 p-6" href={apps[2]?.path}>
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 text-primary mb-3">
                <CalendarBlank size={18} weight="duotone" />
                <span className="font-medium text-sm">Up Next</span>
              </div>

              <div className="flex flex-col justify-center flex-1">
                <p className="text-sm font-medium text-card-foreground">
                  Sync with Data Team
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  14:00 – 15:00 (in 30m)
                </p>
                <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                  <span>3 more today</span>
                  <Clock size={12} />
                </div>
              </div>
            </div>
          </Panel>

          {/* CLI Terminal preview */}
          <Panel className="md:col-span-2 p-6">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <Terminal size={18} />
                <span className="font-medium text-sm">CLI Terminal</span>
              </div>

              <div className="flex-1 flex flex-col justify-end font-mono text-xs text-muted-foreground/80 space-y-1">
                <p className="text-primary/40">
                  Last login: Thu Feb 12 10:22:15 on ttys001
                </p>
                <p>
                  <span className="text-green-500">root@nxus</span>:
                  <span className="text-blue-400">~</span>$ ./deploy_staging.sh
                </p>
                <p className="text-muted-foreground/50">
                  Deploying to staging environment...
                </p>
                <p className="flex items-center">
                  <span className="text-green-500">root@nxus</span>:
                  <span className="text-blue-400">~</span>$&nbsp;
                  <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse" />
                </p>
              </div>
            </div>
          </Panel>

          {/* Settings shortcut */}
          <Panel className="md:col-span-1 p-6 flex flex-col items-center justify-center text-center">
            <div className="flex size-12 items-center justify-center rounded-full border bg-muted text-muted-foreground transition-colors group-hover:text-primary group-hover:border-primary/30">
              <GearSix size={22} />
            </div>
            <p className="mt-3 text-sm font-medium text-card-foreground group-hover:text-primary transition-colors">
              Global Config
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Manage environment
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
