import { useState } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function NeonCard({ app }: { app: MiniApp }) {
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
        className="relative overflow-hidden rounded-sm transition-all duration-300"
        style={{
          background: 'color-mix(in oklch, var(--background) 90%, black)',
          border: '1px solid',
          borderColor: isHovered
            ? 'var(--primary)'
            : 'color-mix(in oklch, var(--primary) 20%, transparent)',
          boxShadow: isHovered
            ? `0 0 15px color-mix(in oklch, var(--primary) 30%, transparent), 0 0 40px color-mix(in oklch, var(--primary) 10%, transparent), inset 0 0 20px color-mix(in oklch, var(--primary) 5%, transparent)`
            : 'none',
        }}
      >
        {/* Animated border glow — top edge sweep */}
        <div
          className="neon-sweep pointer-events-none absolute top-0 left-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, var(--primary), transparent)`,
            width: '60%',
            opacity: isHovered ? 1 : 0,
          }}
        />

        {/* Corner accents — small L-shaped marks */}
        <div
          className="pointer-events-none absolute top-0 left-0 transition-opacity duration-300"
          style={{ opacity: isHovered ? 1 : 0.3 }}
        >
          <div
            className="absolute top-0 left-0 w-3 h-px"
            style={{ background: 'var(--primary)' }}
          />
          <div
            className="absolute top-0 left-0 h-3 w-px"
            style={{ background: 'var(--primary)' }}
          />
        </div>
        <div
          className="pointer-events-none absolute bottom-0 right-0 transition-opacity duration-300"
          style={{ opacity: isHovered ? 1 : 0.3 }}
        >
          <div
            className="absolute bottom-0 right-0 w-3 h-px"
            style={{ background: 'var(--primary)' }}
          />
          <div
            className="absolute bottom-0 right-0 h-3 w-px"
            style={{ background: 'var(--primary)' }}
          />
        </div>

        {/* Subtle grid lines inside card */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(color-mix(in oklch, var(--primary) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--primary) 5%, transparent) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            opacity: isHovered ? 1 : 0.4,
            transition: 'opacity 0.3s',
          }}
        />

        <div className="relative p-5">
          {/* Top row: status indicator + data tag */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{
                  background: 'var(--primary)',
                  boxShadow: isHovered
                    ? '0 0 6px var(--primary), 0 0 12px color-mix(in oklch, var(--primary) 50%, transparent)'
                    : '0 0 4px color-mix(in oklch, var(--primary) 40%, transparent)',
                }}
              />
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: 'color-mix(in oklch, var(--primary) 60%, var(--muted-foreground))' }}
              >
                {app.id}
              </span>
            </div>
            <span
              className="text-[10px] font-mono tabular-nums"
              style={{ color: 'color-mix(in oklch, var(--primary) 40%, var(--muted-foreground))' }}
            >
              SYS.OK
            </span>
          </div>

          {/* Icon + name */}
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-sm border transition-all duration-300"
              style={{
                borderColor: isHovered
                  ? 'color-mix(in oklch, var(--primary) 60%, transparent)'
                  : 'color-mix(in oklch, var(--primary) 20%, transparent)',
                background: 'color-mix(in oklch, var(--primary) 5%, transparent)',
                color: 'var(--primary)',
                boxShadow: isHovered
                  ? '0 0 10px color-mix(in oklch, var(--primary) 15%, transparent)'
                  : 'none',
              }}
            >
              <Icon size={20} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-semibold tracking-wide"
                style={{ color: isHovered ? 'var(--primary)' : 'var(--foreground)' }}
              >
                {app.name}
              </h3>
            </div>
            <ArrowRight
              size={14}
              weight="bold"
              className="shrink-0 transition-all duration-300"
              style={{
                color: 'var(--primary)',
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
              }}
            />
          </div>

          {/* Description */}
          <p
            className="mt-3 text-xs leading-relaxed"
            style={{
              color: isHovered
                ? 'color-mix(in oklch, var(--primary) 50%, var(--foreground))'
                : 'var(--muted-foreground)',
            }}
          >
            {app.description}
          </p>

          {/* Bottom data bar */}
          <div
            className="mt-4 pt-3 flex items-center justify-between border-t"
            style={{
              borderColor: 'color-mix(in oklch, var(--primary) 12%, transparent)',
            }}
          >
            <div className="flex items-center gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: isHovered ? `${12 + i * 8}px` : '8px',
                    background: isHovered
                      ? 'var(--primary)'
                      : 'color-mix(in oklch, var(--primary) 25%, transparent)',
                    boxShadow: isHovered
                      ? '0 0 4px color-mix(in oklch, var(--primary) 40%, transparent)'
                      : 'none',
                  }}
                />
              ))}
            </div>
            <span
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color: 'color-mix(in oklch, var(--primary) 35%, var(--muted-foreground))' }}
            >
              Enter
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

export function NeonGridCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      {/* Background grid pattern */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            linear-gradient(color-mix(in oklch, var(--primary) 4%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in oklch, var(--primary) 4%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-mono">
            <span style={{ color: 'var(--primary)', textShadow: '0 0 20px color-mix(in oklch, var(--primary) 40%, transparent)' }}>n</span>
            <span className="text-foreground">Xus</span>
          </h1>
          <p
            className="text-xs font-mono uppercase tracking-[0.2em]"
            style={{ color: 'color-mix(in oklch, var(--primary) 50%, var(--muted-foreground))' }}
          >
            // system gateway
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <NeonCard key={app.id} app={app} />
          ))}
        </div>
      </div>
    </div>
  )
}
