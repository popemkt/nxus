import { useState, useCallback, useRef, useEffect } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

// Bento layout: Core (index 0) takes the large 2×2 hero slot,
// remaining cards fill the right column as 1×1 each
const spanMap: Record<number, string> = {
  0: 'md:col-span-2 md:row-span-2',
}

// Reorder so Core (id: nxus-core) is always first for bento prominence
function reorderForBento(apps: MiniApp[]): MiniApp[] {
  const coreIndex = apps.findIndex((a) => a.id === 'nxus-core')
  if (coreIndex <= 0) return apps
  const copy = [...apps]
  const [core] = copy.splice(coreIndex, 1)
  return [core, ...copy]
}

function SpotlightCard({
  app,
  className,
  isHero,
  index,
}: {
  app: MiniApp
  className?: string
  isHero?: boolean
  index: number
}) {
  const Icon = iconMap[app.icon]
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80 * index)
    return () => clearTimeout(timer)
  }, [index])

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
    <a href={app.path} className={`group block no-underline ${className ?? ''}`}>
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setOpacity(1)}
        onMouseLeave={() => setOpacity(0)}
        className={`relative h-full overflow-hidden rounded-xl border bg-card/80 hover:border-primary/40 ${isHero ? 'p-8' : 'p-6'}`}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
          transition: 'opacity 0.5s ease-out, transform 0.5s ease-out, border-color 0.3s',
        }}
      >
        {/* Spotlight radial glow */}
        <div
          className="pointer-events-none absolute -inset-px rounded-xl transition-opacity duration-300"
          style={{
            opacity,
            background: `radial-gradient(${isHero ? '600px' : '500px'} circle at ${pos.x}px ${pos.y}px, color-mix(in oklch, var(--primary) ${isHero ? '12' : '10'}%, transparent), transparent 40%)`,
          }}
        />

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div
              className={`flex items-center justify-center rounded-lg border bg-card text-primary transition-colors duration-200 group-hover:border-primary/30 group-hover:bg-primary/10 ${isHero ? 'size-14' : 'size-10'}`}
            >
              <Icon size={isHero ? 30 : 22} weight="duotone" />
            </div>
            <ArrowRight
              size={isHero ? 22 : 18}
              className="text-muted-foreground opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary"
            />
          </div>

          <div className={isHero ? 'mt-6' : 'mt-4'}>
            <h3
              className={`font-medium text-card-foreground ${isHero ? 'text-2xl' : 'text-lg'}`}
            >
              {app.name}
            </h3>
            <p
              className={`mt-1.5 text-muted-foreground ${isHero ? 'text-base/relaxed line-clamp-3' : 'text-sm/relaxed line-clamp-2'}`}
            >
              {app.description}
            </p>
            {isHero && (
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                Open application
                <ArrowRight size={14} weight="bold" />
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

export function BentoGridCards({ apps }: { apps: MiniApp[] }) {
  const ordered = reorderForBento(apps)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl space-y-8">
        <div className="relative text-center space-y-2">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-32 rounded-full"
            style={{
              background: 'radial-gradient(circle, color-mix(in oklch, var(--primary) 8%, transparent), transparent 70%)',
            }}
          />
          <h1 className="relative text-3xl font-bold tracking-tight">
            <span
              className="text-primary"
              style={{ textShadow: '0 0 20px color-mix(in oklch, var(--primary) 35%, transparent)' }}
            >n</span>Xus
          </h1>
          <p className="relative text-sm text-muted-foreground">
            Select an application to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[180px]">
          {ordered.map((app, i) => (
            <SpotlightCard
              key={app.id}
              app={app}
              index={i}
              isHero={i === 0}
              className={spanMap[i] ?? 'col-span-1 row-span-1'}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
