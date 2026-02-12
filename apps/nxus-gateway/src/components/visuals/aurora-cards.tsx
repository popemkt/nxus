import { useState, useCallback, useRef } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

/*
 * Each card gets a unique aurora color set.
 * Colors are fully opaque — opacity is controlled via the gradient stops.
 *
 * The reference shows: deep purple center blob, bright blue fringe,
 * hot white/pink point near bottom-right.
 */
const palettes = [
  // Purple → blue → white (matches reference closest)
  {
    deep: 'oklch(0.35 0.25 285)',     // deep violet
    mid: 'oklch(0.50 0.28 270)',      // rich blue-purple
    bright: 'oklch(0.70 0.22 290)',   // bright lavender
    hot: 'oklch(0.92 0.08 300)',      // near-white pink
  },
  // Teal → cyan → white
  {
    deep: 'oklch(0.35 0.15 195)',
    mid: 'oklch(0.50 0.18 185)',
    bright: 'oklch(0.70 0.16 180)',
    hot: 'oklch(0.92 0.06 190)',
  },
  // Magenta → rose → white
  {
    deep: 'oklch(0.35 0.22 340)',
    mid: 'oklch(0.50 0.24 330)',
    bright: 'oklch(0.70 0.18 345)',
    hot: 'oklch(0.92 0.06 350)',
  },
]

function AuroraCard({ app, index }: { app: MiniApp; index: number }) {
  const Icon = iconMap[app.icon]
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const p = palettes[index % palettes.length]

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMouse({
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      })
    },
    []
  )

  // Aurora blob centers — shift with mouse, anchored in the bottom half
  const bx = 35 + mouse.x * 30
  const by = 65 + mouse.y * 15

  return (
    <a href={app.path} className="group block no-underline">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative overflow-hidden rounded-[20px] transition-all duration-500"
        style={{
          background: 'oklch(0.13 0.02 280)',
          border: '1px solid oklch(0.24 0.02 280 / 0.5)',
          boxShadow: isHovered
            ? `0 30px 80px -20px oklch(0.3 0.2 280 / 0.4), 0 0 0 1px oklch(0.3 0.04 280 / 0.3)`
            : `0 4px 32px -8px oklch(0 0 0 / 0.6)`,
        }}
      >
        {/*
         * Aurora glow — layered blobs filling the bottom ~50% of the card.
         * Wider, more saturated, more coverage than before.
         */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            transition: 'opacity 0.7s ease',
            opacity: isHovered ? 1 : 0.8,
          }}
        >
          {/* Base: wide wash across the entire bottom */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 120% 70% at ${bx}% ${by + 10}%, ${p.deep}, transparent 70%)`,
              filter: 'blur(24px)',
            }}
          />
          {/* Mid layer: brighter, tighter */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 85% 55% at ${bx + 12}% ${by + 8}%, ${p.mid}, transparent 65%)`,
              filter: 'blur(20px)',
            }}
          />
          {/* Bright fringe — more saturated */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 60% 45% at ${bx + 20}% ${by + 12}%, ${p.bright}, transparent 55%)`,
              filter: 'blur(16px)',
            }}
          />
          {/* Hot core — near-white, bottom-right region */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 40% 25% at ${bx + 25}% 95%, ${p.hot}, transparent 50%)`,
              filter: 'blur(10px)',
            }}
          />
          {/* Extra: horizontal bright band at the very bottom edge */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${p.bright}, transparent 40%)`,
              opacity: 0.25,
            }}
          />
        </div>

        {/* Glass top-edge highlight */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 5%, oklch(1 0 0 / 0.1) 30%, oklch(1 0 0 / 0.15) 50%, oklch(1 0 0 / 0.1) 70%, transparent 95%)',
          }}
        />

        {/* Glass inner sheen from top */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{
            background:
              'linear-gradient(180deg, oklch(1 0 0 / 0.04) 0%, transparent 30%)',
          }}
        />

        {/* Card content */}
        <div className="relative z-10 p-6">
          <div className="flex items-start justify-between">
            {/* Icon in frosted glass circle */}
            <div
              className="flex size-11 items-center justify-center rounded-full transition-all duration-300"
              style={{
                background: 'oklch(0.2 0.03 280 / 0.5)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid oklch(0.35 0.03 280 / 0.4)',
                color: isHovered
                  ? 'oklch(0.88 0.06 280)'
                  : 'oklch(0.6 0.04 280)',
                boxShadow: isHovered
                  ? `0 0 20px oklch(0.4 0.2 280 / 0.3), inset 0 0 8px oklch(0.5 0.15 280 / 0.1)`
                  : 'inset 0 1px 0 oklch(1 0 0 / 0.05)',
              }}
            >
              <Icon size={22} weight="duotone" />
            </div>

            {/* Arrow — like other views */}
            <ArrowRight
              size={16}
              weight="bold"
              className="transition-all duration-300"
              style={{
                color: 'oklch(0.8 0 0)',
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
              }}
            />
          </div>

          <div className="mt-4">
            <h3
              className="text-base font-semibold tracking-tight"
              style={{ color: 'oklch(0.95 0 0)' }}
            >
              {app.name}
            </h3>
            <p
              className="mt-1.5 text-xs/relaxed"
              style={{ color: 'oklch(0.6 0 0)' }}
            >
              {app.description}
            </p>
          </div>
        </div>
      </div>
    </a>
  )
}

export function AuroraCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{
        background: 'oklch(0.08 0.01 280)',
      }}
    >
      {/* Ambient background glow — subtle purple radial */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.15 0.08 280 / 0.6), transparent 70%),
            radial-gradient(ellipse 40% 35% at 25% 65%, oklch(0.12 0.06 300 / 0.3), transparent),
            radial-gradient(ellipse 35% 30% at 75% 35%, oklch(0.12 0.05 250 / 0.2), transparent)
          `,
        }}
      />

      <div className="relative w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'oklch(0.95 0 0)' }}
          >
            <span style={{ color: 'oklch(0.7 0.18 280)' }}>n</span>Xus
          </h1>
          <p className="text-sm" style={{ color: 'oklch(0.5 0 0)' }}>
            Select an application to get started.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {apps.map((app, index) => (
            <AuroraCard key={app.id} app={app} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
