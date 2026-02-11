import { useState } from 'react'
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
        className="relative overflow-hidden rounded-lg border transition-all duration-300"
        style={{
          background: 'color-mix(in oklch, var(--background) 95%, black)',
          borderColor: isHovered
            ? 'color-mix(in oklch, var(--primary) 60%, transparent)'
            : 'color-mix(in oklch, var(--primary) 20%, transparent)',
          boxShadow: isHovered
            ? '0 0 20px color-mix(in oklch, var(--primary) 15%, transparent), inset 0 0 30px color-mix(in oklch, var(--primary) 3%, transparent)'
            : 'none',
        }}
      >
        {/* CRT scanline overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, color-mix(in oklch, var(--foreground) 3%, transparent) 2px, color-mix(in oklch, var(--foreground) 3%, transparent) 4px)',
          }}
        />

        {/* Terminal top bar */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{
            borderColor: 'color-mix(in oklch, var(--primary) 15%, transparent)',
            background: 'color-mix(in oklch, var(--primary) 5%, transparent)',
          }}
        >
          <div className="flex gap-1.5">
            <div
              className="size-2.5 rounded-full"
              style={{ background: 'oklch(0.63 0.21 25)' }}
            />
            <div
              className="size-2.5 rounded-full"
              style={{ background: 'oklch(0.8 0.17 85)' }}
            />
            <div
              className="size-2.5 rounded-full"
              style={{ background: 'oklch(0.72 0.19 145)' }}
            />
          </div>
          <span
            className="ml-2 text-xs font-mono"
            style={{ color: 'color-mix(in oklch, var(--primary) 50%, var(--muted-foreground))' }}
          >
            nxus@gateway:~/{app.id}
          </span>
        </div>

        {/* Terminal body */}
        <div className="p-4 font-mono">
          {/* Prompt line with app name */}
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: 'var(--primary)' }}
            >
              &gt;
            </span>
            <div
              className="flex size-6 items-center justify-center"
              style={{ color: 'var(--primary)' }}
            >
              <Icon size={16} weight="duotone" />
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              {app.name}
            </span>
          </div>

          {/* Description with typing animation */}
          <div className="mt-2 ml-4 overflow-hidden">
            <div
              className="text-xs leading-relaxed whitespace-nowrap overflow-hidden"
              style={{
                color: 'color-mix(in oklch, var(--primary) 60%, var(--muted-foreground))',
                width: isHovered ? '100%' : '0%',
                transition: 'width 0.6s steps(30, end)',
              }}
            >
              {app.description}
            </div>
          </div>

          {/* Blinking cursor line */}
          <div className="mt-2 flex items-center gap-1">
            <span
              className="text-sm font-bold"
              style={{ color: 'var(--primary)' }}
            >
              &gt;
            </span>
            <span
              className="terminal-cursor inline-block text-sm"
              style={{ color: 'var(--primary)' }}
            >
              _
            </span>
          </div>

          {/* Status bar at bottom */}
          <div
            className="mt-3 flex items-center justify-between border-t pt-2 text-xs"
            style={{
              borderColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
              color: 'color-mix(in oklch, var(--primary) 40%, var(--muted-foreground))',
            }}
          >
            <span>PID {1024 + index}</span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{
                  background: 'oklch(0.72 0.19 145)',
                  boxShadow: '0 0 4px oklch(0.72 0.19 145)',
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

export function TerminalCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight font-mono"
          >
            <span style={{ color: 'var(--primary)' }}>n</span>Xus
          </h1>
          <p
            className="text-sm font-mono"
            style={{ color: 'color-mix(in oklch, var(--primary) 50%, var(--muted-foreground))' }}
          >
            $ select --application
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {apps.map((app, index) => (
            <TerminalCard key={app.id} app={app} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
