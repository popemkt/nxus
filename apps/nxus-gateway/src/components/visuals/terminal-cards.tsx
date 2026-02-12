import { useState, useEffect } from 'react'
import { Cube, Graph, CalendarBlank } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function TerminalCard({ app, index }: { app: MiniApp; index: number }) {
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
        className="relative overflow-hidden rounded-xl border transition-all duration-300"
        style={{
          background: 'var(--card)',
          borderColor: isHovered
            ? 'color-mix(in oklch, var(--primary) 50%, transparent)'
            : 'color-mix(in oklch, var(--border) 80%, transparent)',
          boxShadow: isHovered
            ? '0 8px 30px -8px color-mix(in oklch, var(--primary) 12%, transparent)'
            : '0 2px 8px -2px color-mix(in oklch, var(--foreground) 4%, transparent)',
        }}
      >
        {/* Subtle scanline overlay — much lighter than before */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, color-mix(in oklch, var(--foreground) 1.5%, transparent) 3px, color-mix(in oklch, var(--foreground) 1.5%, transparent) 6px)',
          }}
        />

        {/* Terminal top bar */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{
            borderColor: 'color-mix(in oklch, var(--border) 60%, transparent)',
            background: 'color-mix(in oklch, var(--muted) 50%, transparent)',
          }}
        >
          <div className="flex gap-1.5">
            <div
              className="size-2 rounded-full"
              style={{ background: 'color-mix(in oklch, var(--destructive) 70%, var(--muted-foreground))' }}
            />
            <div
              className="size-2 rounded-full"
              style={{ background: 'color-mix(in oklch, oklch(0.8 0.17 85) 70%, var(--muted-foreground))' }}
            />
            <div
              className="size-2 rounded-full"
              style={{ background: 'color-mix(in oklch, oklch(0.72 0.19 145) 70%, var(--muted-foreground))' }}
            />
          </div>
          <span
            className="ml-2 text-xs font-mono text-muted-foreground"
          >
            nxus@gateway:~/{app.id}
          </span>
        </div>

        {/* Terminal body */}
        <div className="p-4 font-mono">
          {/* Prompt line with app name */}
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium text-primary"
            >
              $
            </span>
            <div
              className="flex size-6 items-center justify-center text-primary"
            >
              <Icon size={16} weight="duotone" />
            </div>
            <span
              className="text-sm font-semibold text-card-foreground"
            >
              {app.name}
            </span>
          </div>

          {/* Description with typing animation */}
          <div className="mt-2 ml-4 overflow-hidden">
            <div
              className="text-xs leading-relaxed whitespace-nowrap overflow-hidden text-muted-foreground"
              style={{
                width: isHovered ? '100%' : '0%',
                transition: 'width 0.6s steps(30, end)',
              }}
            >
              {app.description}
            </div>
          </div>

          {/* Blinking cursor line */}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-sm font-medium text-primary">
              $
            </span>
            <span
              className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse rounded-[1px]"
            />
          </div>

          {/* Status bar at bottom */}
          <div
            className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground"
            style={{
              borderColor: 'color-mix(in oklch, var(--border) 50%, transparent)',
            }}
          >
            <span>PID {1024 + index}</span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block size-1.5 rounded-full bg-green-500"
                style={{
                  boxShadow: '0 0 4px color-mix(in oklch, oklch(0.72 0.19 145) 60%, transparent)',
                }}
              />
              active
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

const BOOT_LINES = [
  { text: 'nxus-gateway v2.4.1', delay: 0 },
  { text: 'Initializing modules...', delay: 150 },
  { text: 'Loading applications   [OK]', delay: 400 },
]

export function TerminalCards({ apps }: { apps: MiniApp[] }) {
  const [bootDone, setBootDone] = useState(false)
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => setVisibleLines(i + 1), line.delay)
    )
    const doneTimer = setTimeout(() => setBootDone(true), 700)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(doneTimer)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-mono">
            <span className="text-primary">n</span>
            <span className="text-foreground">Xus</span>
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            $ select --application
          </p>
        </div>

        {/* Boot sequence */}
        {!bootDone && (
          <div className="font-mono text-xs text-muted-foreground space-y-1 pl-1">
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <p key={i}>{line.text}</p>
            ))}
          </div>
        )}

        <div
          className="grid gap-4 sm:grid-cols-2"
          style={{
            opacity: bootDone ? 1 : 0,
            transform: bootDone ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
          }}
        >
          {apps.map((app, index) => (
            <TerminalCard key={app.id} app={app} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
