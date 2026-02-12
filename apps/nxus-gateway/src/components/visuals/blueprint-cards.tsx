import { useState, useCallback } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const GRID_SIZE = 32

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function BlueprintCard({ app, index }: { app: MiniApp; index: number }) {
  const Icon = iconMap[app.icon]
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href={app.path}
      className="group block no-underline"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="relative overflow-hidden rounded-none border border-dashed transition-all duration-300"
        style={{
          borderColor: isHovered
            ? 'color-mix(in oklch, var(--primary) 70%, transparent)'
            : 'color-mix(in oklch, var(--primary) 25%, transparent)',
          background: 'color-mix(in oklch, var(--primary) 2%, var(--background))',
        }}
      >
        {/* Internal grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            backgroundImage: `
              linear-gradient(color-mix(in oklch, var(--primary) 6%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklch, var(--primary) 6%, transparent) 1px, transparent 1px)
            `,
            backgroundSize: '16px 16px',
            opacity: isHovered ? 0.8 : 0.4,
          }}
        />

        {/* Dimension markers — top */}
        <div className="relative flex items-center px-4 pt-3 pb-0">
          <div
            className="flex-1 h-px"
            style={{ background: 'color-mix(in oklch, var(--primary) 20%, transparent)' }}
          />
          <span
            className="px-2 text-[9px] font-mono uppercase tracking-wider"
            style={{ color: 'color-mix(in oklch, var(--primary) 40%, var(--muted-foreground))' }}
          >
            Module {String(index + 1).padStart(2, '0')}
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: 'color-mix(in oklch, var(--primary) 20%, transparent)' }}
          />
        </div>

        <div className="relative p-5 pt-3">
          {/* Cross-hair markers in corners */}
          <div className="pointer-events-none absolute top-2 left-2 transition-opacity duration-300" style={{ opacity: isHovered ? 0.8 : 0.3 }}>
            <div className="absolute top-1/2 left-0 w-2 h-px -translate-y-1/2" style={{ background: 'var(--primary)' }} />
            <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2" style={{ background: 'var(--primary)' }} />
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2 transition-opacity duration-300" style={{ opacity: isHovered ? 0.8 : 0.3 }}>
            <div className="absolute top-1/2 right-0 w-2 h-px -translate-y-1/2" style={{ background: 'var(--primary)' }} />
            <div className="absolute right-1/2 bottom-0 h-2 w-px -translate-x-1/2" style={{ background: 'var(--primary)' }} />
          </div>

          {/* Icon with circle outline — like a technical callout */}
          <div className="flex items-start gap-4">
            <div className="relative">
              <div
                className="flex size-12 items-center justify-center rounded-full border border-dashed transition-all duration-300"
                style={{
                  borderColor: isHovered
                    ? 'color-mix(in oklch, var(--primary) 60%, transparent)'
                    : 'color-mix(in oklch, var(--primary) 25%, transparent)',
                  color: isHovered ? 'var(--primary)' : 'color-mix(in oklch, var(--primary) 60%, var(--muted-foreground))',
                }}
              >
                <Icon size={22} weight="duotone" />
              </div>
              {/* Annotation line from icon to label */}
              <div
                className="absolute -right-3 top-1/2 w-3 h-px transition-opacity duration-300"
                style={{
                  background: 'color-mix(in oklch, var(--primary) 30%, transparent)',
                  opacity: isHovered ? 1 : 0.5,
                }}
              />
            </div>

            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <h3
                  className="text-sm font-mono font-medium tracking-wide transition-colors duration-300"
                  style={{
                    color: isHovered ? 'var(--primary)' : 'var(--foreground)',
                  }}
                >
                  {app.name}
                </h3>
                <ArrowRight
                  size={12}
                  weight="bold"
                  className="shrink-0 transition-all duration-300"
                  style={{
                    color: 'var(--primary)',
                    opacity: isHovered ? 1 : 0,
                    transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
                  }}
                />
              </div>

              <p
                className="mt-1.5 text-xs font-mono leading-relaxed transition-colors duration-300"
                style={{
                  color: isHovered
                    ? 'color-mix(in oklch, var(--foreground) 60%, transparent)'
                    : 'color-mix(in oklch, var(--foreground) 35%, transparent)',
                }}
              >
                {app.description}
              </p>
            </div>
          </div>

          {/* Bottom annotation — specs row */}
          <div
            className="mt-4 pt-2 flex items-center gap-4 border-t border-dashed"
            style={{
              borderColor: 'color-mix(in oklch, var(--primary) 15%, transparent)',
            }}
          >
            <span
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color: 'color-mix(in oklch, var(--primary) 40%, var(--muted-foreground))' }}
            >
              Path: {app.path}
            </span>
            <div className="flex-1" />
            <span
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color: 'color-mix(in oklch, var(--primary) 40%, var(--muted-foreground))' }}
            >
              Rev A
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

export function BlueprintCards({ apps }: { apps: MiniApp[] }) {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  )

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
  }, [])

  // Snap to nearest grid line
  const snappedX = mousePos
    ? Math.round(mousePos.x / GRID_SIZE) * GRID_SIZE
    : 0
  const snappedY = mousePos
    ? Math.round(mousePos.y / GRID_SIZE) * GRID_SIZE
    : 0

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-8"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background — faint grid over entire page */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            linear-gradient(color-mix(in oklch, var(--primary) 3%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in oklch, var(--primary) 3%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 20%, transparent 70%)',
        }}
      />

      {/* Hover crosshair highlight */}
      {mousePos && (
        <>
          <div
            className="pointer-events-none fixed left-0 right-0 z-10"
            style={{
              top: snappedY,
              height: 1,
              background:
                'color-mix(in oklch, var(--primary) 8%, transparent)',
              transition: 'top 0.08s ease-out',
            }}
          />
          <div
            className="pointer-events-none fixed top-0 bottom-0 z-10"
            style={{
              left: snappedX,
              width: 1,
              background:
                'color-mix(in oklch, var(--primary) 8%, transparent)',
              transition: 'left 0.08s ease-out',
            }}
          />
          {/* Coordinate readout */}
          <div
            className="pointer-events-none fixed z-10 font-mono text-[9px] tracking-wider"
            style={{
              left: snappedX + 8,
              top: snappedY - 18,
              color: 'color-mix(in oklch, var(--primary) 35%, var(--muted-foreground))',
              transition: 'left 0.08s ease-out, top 0.08s ease-out',
            }}
          >
            {Math.round(snappedX / GRID_SIZE)},{Math.round(snappedY / GRID_SIZE)}
          </div>
        </>
      )}

      <div className="relative w-full max-w-2xl space-y-8">
        {/* Title block — styled like a title block on a technical drawing */}
        <div className="text-center space-y-3">
          <div
            className="inline-block border border-dashed px-6 py-3"
            style={{
              borderColor: 'color-mix(in oklch, var(--primary) 30%, transparent)',
            }}
          >
            <h1 className="text-2xl font-mono font-bold tracking-[0.15em]">
              <span className="text-primary">n</span>
              <span className="text-foreground">Xus</span>
            </h1>
          </div>
          <p
            className="text-[10px] font-mono uppercase tracking-[0.2em]"
            style={{ color: 'color-mix(in oklch, var(--primary) 45%, var(--muted-foreground))' }}
          >
            System Architecture — Gateway Module
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {apps.map((app, index) => (
            <BlueprintCard key={app.id} app={app} index={index} />
          ))}
        </div>

        {/* Footer annotation */}
        <div className="flex items-center gap-3 pt-4">
          <div
            className="flex-1 h-px"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-wider"
            style={{ color: 'color-mix(in oklch, var(--primary) 30%, var(--muted-foreground))' }}
          >
            Scale 1:1 — Do not modify
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          />
        </div>
      </div>
    </div>
  )
}
