import { useState } from 'react'
import { Cube, Graph, CalendarBlank } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function OrbitalCard({
  app,
  index,
  total,
  hoveredIndex,
  onHover,
  onLeave,
}: {
  app: MiniApp
  index: number
  total: number
  hoveredIndex: number | null
  onHover: (i: number) => void
  onLeave: () => void
}) {
  const Icon = iconMap[app.icon]
  const isHovered = hoveredIndex === index
  const hasSiblingHovered = hoveredIndex !== null && hoveredIndex !== index

  // Calculate radial position: distribute cards evenly around a circle
  // Start from top (-90deg) and go clockwise
  const angleStep = 360 / total
  const angleDeg = -90 + index * angleStep
  const angleRad = (angleDeg * Math.PI) / 180

  return (
    <>
      {/* Connecting line from hub to card */}
      <div
        className="orbital-connection absolute left-1/2 top-1/2 origin-left transition-opacity duration-300 max-sm:hidden"
        style={{
          width: '120px',
          height: '1px',
          background: `linear-gradient(90deg, color-mix(in oklch, var(--primary) ${isHovered ? '40%' : '15%'}, transparent), color-mix(in oklch, var(--primary) ${isHovered ? '25%' : '5%'}, transparent))`,
          transform: `rotate(${angleDeg}deg)`,
          opacity: hasSiblingHovered ? 0.3 : 1,
        }}
      />

      {/* Card positioned radially */}
      <a
        href={app.path}
        className="absolute left-1/2 top-1/2 block no-underline transition-all duration-500 ease-out max-sm:static max-sm:translate-0"
        style={{
          transform: `translate(calc(-50% + ${Math.cos(angleRad) * 180}px), calc(-50% + ${Math.sin(angleRad) * 180}px))`,
          zIndex: isHovered ? 20 : 10,
        }}
        onMouseEnter={() => onHover(index)}
        onMouseLeave={onLeave}
      >
        <div
          className="orbital-card relative overflow-hidden rounded-2xl border transition-all duration-300 ease-out"
          style={{
            background: 'color-mix(in oklch, var(--card) 80%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderColor: isHovered
              ? 'color-mix(in oklch, var(--primary) 50%, transparent)'
              : 'color-mix(in oklch, var(--border) 60%, transparent)',
            boxShadow: isHovered
              ? '0 0 30px color-mix(in oklch, var(--primary) 20%, transparent), 0 8px 32px color-mix(in oklch, var(--primary) 10%, transparent)'
              : '0 2px 8px color-mix(in oklch, var(--foreground) 5%, transparent)',
            transform: isHovered
              ? 'scale(1.15)'
              : hasSiblingHovered
                ? 'scale(0.95)'
                : 'scale(1)',
            opacity: hasSiblingHovered ? 0.7 : 1,
            width: isHovered ? '220px' : '160px',
          }}
        >
          {/* Hover glow overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300"
            style={{
              background:
                'radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)',
              opacity: isHovered ? 1 : 0,
            }}
          />

          <div className="relative p-4">
            {/* Icon and name row */}
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300"
                style={{
                  background: isHovered
                    ? 'color-mix(in oklch, var(--primary) 18%, transparent)'
                    : 'color-mix(in oklch, var(--primary) 10%, transparent)',
                  color: 'var(--primary)',
                  boxShadow: isHovered
                    ? '0 0 12px color-mix(in oklch, var(--primary) 20%, transparent)'
                    : 'none',
                }}
              >
                <Icon size={20} weight="duotone" />
              </div>
              <span className="text-sm font-medium text-card-foreground truncate">
                {app.name}
              </span>
            </div>

            {/* Description - revealed on hover */}
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{
                maxHeight: isHovered ? '60px' : '0px',
                opacity: isHovered ? 1 : 0,
                marginTop: isHovered ? '10px' : '0px',
              }}
            >
              <p className="text-xs/relaxed text-muted-foreground">
                {app.description}
              </p>
            </div>
          </div>
        </div>
      </a>
    </>
  )
}

export function OrbitalCards({ apps }: { apps: MiniApp[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <style>{`
        @keyframes orbital-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes orbital-hub-pulse {
          0%, 100% { box-shadow: 0 0 40px color-mix(in oklch, var(--primary) 12%, transparent), 0 0 80px color-mix(in oklch, var(--primary) 5%, transparent); }
          50% { box-shadow: 0 0 50px color-mix(in oklch, var(--primary) 18%, transparent), 0 0 100px color-mix(in oklch, var(--primary) 8%, transparent); }
        }
      `}</style>
      {/* Orbital layout container */}
      <div className="relative max-sm:static max-sm:flex max-sm:flex-col max-sm:items-center max-sm:gap-4" style={{ width: '480px', height: '480px' }}>
        {/* Central hub */}
        <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 max-sm:static max-sm:translate-0 max-sm:mb-6">
          <div
            className="orbital-hub relative flex size-24 items-center justify-center rounded-full border"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--primary) 12%, var(--card)), var(--card))',
              borderColor:
                'color-mix(in oklch, var(--primary) 30%, transparent)',
              animation: 'orbital-hub-pulse 4s ease-in-out infinite',
            }}
          >
            {/* Pulse ring */}
            <div
              className="orbital-pulse absolute inset-0 rounded-full"
              style={{
                border: '1px solid color-mix(in oklch, var(--primary) 20%, transparent)',
              }}
            />

            {/* Hub text */}
            <h1 className="text-xl font-bold tracking-tight">
              <span
                className="text-primary"
                style={{ textShadow: '0 0 16px color-mix(in oklch, var(--primary) 50%, transparent)' }}
              >n</span>
              <span className="text-card-foreground">Xus</span>
            </h1>
          </div>

          {/* Subtitle below hub */}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Select an app
          </p>
        </div>

        {/* Orbital ring - decorative, slowly rotating */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full max-sm:hidden"
          style={{
            width: '360px',
            height: '360px',
            border:
              '1px dashed color-mix(in oklch, var(--primary) 10%, transparent)',
            animation: 'orbital-spin 60s linear infinite',
          }}
        >
          {/* Dot markers on the ring */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 rounded-full" style={{ background: 'color-mix(in oklch, var(--primary) 30%, transparent)' }} />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1.5 rounded-full" style={{ background: 'color-mix(in oklch, var(--primary) 20%, transparent)' }} />
        </div>
        {/* Second ring — counter-rotating, slightly larger */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full max-sm:hidden"
          style={{
            width: '400px',
            height: '400px',
            border:
              '1px solid color-mix(in oklch, var(--primary) 4%, transparent)',
            animation: 'orbital-spin 90s linear infinite reverse',
          }}
        >
          <div className="absolute top-1/2 -right-1 -translate-y-1/2 size-1.5 rounded-full" style={{ background: 'color-mix(in oklch, var(--primary) 15%, transparent)' }} />
        </div>

        {/* Cards in orbital arrangement */}
        <div className="max-sm:contents">
          {apps.map((app, index) => (
            <OrbitalCard
              key={app.id}
              app={app}
              index={index}
              total={apps.length}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              onLeave={() => setHoveredIndex(null)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
