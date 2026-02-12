import { useState, useCallback, useRef } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

/* Each card gets a unique aurora color palette */
const auroraPalettes = [
  // Purple-blue-white — like the reference image
  {
    a: 'oklch(0.45 0.2 280)',
    b: 'oklch(0.55 0.22 260)',
    c: 'oklch(0.85 0.12 290)',
    d: 'oklch(0.95 0.04 280)',
  },
  // Teal-cyan-white
  {
    a: 'oklch(0.45 0.14 190)',
    b: 'oklch(0.55 0.16 175)',
    c: 'oklch(0.8 0.1 185)',
    d: 'oklch(0.95 0.04 190)',
  },
  // Rose-magenta-white
  {
    a: 'oklch(0.45 0.18 350)',
    b: 'oklch(0.55 0.2 330)',
    c: 'oklch(0.8 0.12 340)',
    d: 'oklch(0.95 0.04 350)',
  },
]

function AuroraCard({ app, index }: { app: MiniApp; index: number }) {
  const Icon = iconMap[app.icon]
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const palette = auroraPalettes[index % auroraPalettes.length]

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    })
  }, [])

  return (
    <a href={app.path} className="group block no-underline">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative overflow-hidden rounded-2xl transition-all duration-500"
        style={{
          background: 'oklch(0.16 0.01 280)',
          border: '1px solid oklch(0.28 0.02 280 / 0.6)',
          boxShadow: isHovered
            ? `0 24px 80px -16px ${palette.a}40, 0 0 0 1px oklch(0.3 0.02 280 / 0.4)`
            : `0 4px 24px -8px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(0.25 0.02 280 / 0.3)`,
        }}
      >
        {/* Aurora glow — organic blob at bottom of card */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: isHovered ? 1 : 0.6,
            background: `
              radial-gradient(
                ellipse 80% 50% at ${30 + mousePos.x * 40}% ${70 + mousePos.y * 15}%,
                ${palette.a}60,
                transparent
              ),
              radial-gradient(
                ellipse 60% 40% at ${50 + mousePos.x * 20}% ${80 + mousePos.y * 10}%,
                ${palette.b}50,
                transparent
              ),
              radial-gradient(
                ellipse 40% 30% at ${60 + mousePos.x * 15}% ${85 + mousePos.y * 8}%,
                ${palette.c}50,
                transparent
              ),
              radial-gradient(
                ellipse 25% 15% at ${55 + mousePos.x * 10}% ${90}%,
                ${palette.d}70,
                transparent
              )
            `,
            filter: 'blur(20px)',
          }}
        />

        {/* Subtle top-edge light reflection */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 10%, oklch(1 0 0 / 0.08) 50%, transparent 90%)',
          }}
        />

        {/* Card content */}
        <div className="relative z-10 p-7">
          {/* Icon in frosted circle */}
          <div
            className="mb-6 flex size-11 items-center justify-center rounded-full transition-all duration-300"
            style={{
              background: 'oklch(0.25 0.02 280 / 0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid oklch(0.4 0.02 280 / 0.3)',
              color: isHovered
                ? 'oklch(0.9 0.04 280)'
                : 'oklch(0.65 0.04 280)',
              boxShadow: isHovered
                ? `0 0 16px ${palette.a}30`
                : 'none',
            }}
          >
            <Icon size={20} weight="duotone" />
          </div>

          {/* Title */}
          <h3
            className="text-xl font-semibold tracking-tight transition-colors duration-300"
            style={{
              color: isHovered
                ? 'oklch(0.97 0 0)'
                : 'oklch(0.9 0 0)',
            }}
          >
            {app.name}
          </h3>

          {/* Description */}
          <p
            className="mt-2 text-sm/relaxed transition-colors duration-300"
            style={{
              color: isHovered
                ? 'oklch(0.75 0 0)'
                : 'oklch(0.58 0 0)',
            }}
          >
            {app.description}
          </p>

          {/* CTA link */}
          <div
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium transition-all duration-300"
            style={{
              color: isHovered
                ? 'oklch(0.9 0 0)'
                : 'oklch(0.65 0 0)',
            }}
          >
            <span
              className="transition-all duration-300"
              style={{
                borderBottom: isHovered
                  ? '1px solid oklch(0.7 0 0 / 0.5)'
                  : '1px solid transparent',
              }}
            >
              Learn more
            </span>
            <ArrowRight
              size={14}
              weight="bold"
              className="transition-transform duration-300"
              style={{
                transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
              }}
            />
          </div>
        </div>

        {/* Bottom aurora brighten on hover */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 transition-opacity duration-700"
          style={{
            background: `linear-gradient(to top, ${palette.b}18, transparent)`,
            opacity: isHovered ? 1 : 0,
          }}
        />
      </div>
    </a>
  )
}

export function AuroraCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 50%, oklch(0.18 0.04 280), oklch(0.1 0.01 280) 60%, oklch(0.06 0 0))',
      }}
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 30% 70%, oklch(0.25 0.12 280 / 0.15), transparent), radial-gradient(ellipse 40% 30% at 70% 30%, oklch(0.25 0.1 200 / 0.1), transparent)',
        }}
      />

      <div className="relative w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'oklch(0.95 0 0)' }}
          >
            <span style={{ color: 'oklch(0.75 0.15 280)' }}>n</span>Xus
          </h1>
          <p
            className="text-sm"
            style={{ color: 'oklch(0.55 0 0)' }}
          >
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
