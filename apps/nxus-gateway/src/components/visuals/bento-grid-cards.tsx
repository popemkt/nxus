import { useState, useCallback, useRef } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

// First card gets the large span
const spanMap: Record<number, string> = {
  0: 'md:col-span-2 md:row-span-2',
}

function SpotlightCard({
  app,
  className,
}: {
  app: MiniApp
  className?: string
}) {
  const Icon = iconMap[app.icon]
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

  return (
    <a href={app.path} className="group block no-underline">
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setOpacity(1)}
        onMouseLeave={() => setOpacity(0)}
        className={`relative h-full overflow-hidden rounded-xl border bg-card/80 p-6 transition-colors duration-300 hover:border-primary/40 ${className ?? ''}`}
      >
        {/* Spotlight radial glow */}
        <div
          className="pointer-events-none absolute -inset-px rounded-xl transition-opacity duration-300"
          style={{
            opacity,
            background: `radial-gradient(500px circle at ${pos.x}px ${pos.y}px, color-mix(in oklch, var(--primary) 10%, transparent), transparent 40%)`,
          }}
        />

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-card text-primary transition-colors duration-200 group-hover:border-primary/30 group-hover:bg-primary/10">
              <Icon size={22} weight="duotone" />
            </div>
            <ArrowRight
              size={18}
              className="text-muted-foreground opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary"
            />
          </div>

          <div className="mt-4">
            <h3 className="text-lg font-medium text-card-foreground">
              {app.name}
            </h3>
            <p className="mt-1.5 text-sm/relaxed text-muted-foreground line-clamp-2">
              {app.description}
            </p>
          </div>
        </div>
      </div>
    </a>
  )
}

export function BentoGridCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">n</span>Xus
          </h1>
          <p className="text-sm text-muted-foreground">
            Select an application to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[160px]">
          {apps.map((app, i) => (
            <SpotlightCard
              key={app.id}
              app={app}
              className={spanMap[i] ?? 'col-span-1 row-span-1'}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
