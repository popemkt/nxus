import { useState, useEffect } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

function ZenCard({ app, index }: { app: MiniApp; index: number }) {
  const Icon = iconMap[app.icon]
  const [isHovered, setIsHovered] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 120 * index)
    return () => clearTimeout(timer)
  }, [index])

  return (
    <a
      href={app.path}
      className="group block no-underline"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="relative py-8 px-2"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
        }}
      >
        {/* Top hairline divider */}
        <div
          className="absolute top-0 left-0 right-0 h-px transition-all duration-700 ease-out"
          style={{
            background: isHovered
              ? `linear-gradient(90deg, transparent 5%, var(--primary) 50%, transparent 95%)`
              : `linear-gradient(90deg, transparent 20%, color-mix(in oklch, var(--foreground) 10%, transparent) 50%, transparent 80%)`,
          }}
        />

        {/* Subtle background wash on hover */}
        <div
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, color-mix(in oklch, var(--primary) 4%, transparent), transparent 70%)',
            opacity: isHovered ? 1 : 0,
          }}
        />

        <div className="relative flex items-start gap-6">
          {/* Index number — large, faded, typographic */}
          <span
            className="select-none text-5xl font-extralight tabular-nums leading-none transition-colors duration-500"
            style={{
              color: isHovered
                ? 'color-mix(in oklch, var(--primary) 30%, transparent)'
                : 'color-mix(in oklch, var(--foreground) 6%, transparent)',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>

          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-3">
              <div
                className="flex size-8 items-center justify-center transition-colors duration-500"
                style={{
                  color: isHovered ? 'var(--primary)' : 'color-mix(in oklch, var(--foreground) 40%, transparent)',
                }}
              >
                <Icon size={20} weight="duotone" />
              </div>
              <h3 className="text-lg font-light tracking-wide text-foreground transition-colors duration-500">
                {app.name}
              </h3>
              <ArrowRight
                size={14}
                weight="light"
                className="ml-auto shrink-0 transition-all duration-500"
                style={{
                  color: 'var(--primary)',
                  opacity: isHovered ? 1 : 0,
                  transform: isHovered ? 'translateX(0)' : 'translateX(-8px)',
                }}
              />
            </div>

            <p
              className="mt-2 text-sm font-light leading-relaxed transition-all duration-500"
              style={{
                color: isHovered
                  ? 'color-mix(in oklch, var(--foreground) 60%, transparent)'
                  : 'color-mix(in oklch, var(--foreground) 30%, transparent)',
              }}
            >
              {app.description}
            </p>
          </div>
        </div>
      </div>
    </a>
  )
}

export function MinimalZenCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-16">
        {/* Header — extremely minimal */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-extralight tracking-[0.2em] text-foreground">
            <span
              className="text-primary font-light"
              style={{ textShadow: '0 0 24px color-mix(in oklch, var(--primary) 30%, transparent)' }}
            >n</span>Xus
          </h1>
          <div
            className="mx-auto h-px w-12 transition-all duration-1000"
            style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklch, var(--primary) 25%, var(--foreground) 15%), transparent)' }}
          />
          <p
            className="text-xs font-light tracking-[0.15em] uppercase"
            style={{ color: 'color-mix(in oklch, var(--foreground) 35%, transparent)' }}
          >
            Select an application
          </p>
        </div>

        {/* Cards — stacked list with generous whitespace */}
        <div>
          {apps.map((app, index) => (
            <ZenCard key={app.id} app={app} index={index} />
          ))}
          {/* Bottom hairline to close the last card */}
          <div
            className="h-px"
            style={{ background: 'linear-gradient(90deg, transparent 20%, color-mix(in oklch, var(--foreground) 10%, transparent) 50%, transparent 80%)' }}
          />
        </div>
      </div>
    </div>
  )
}
