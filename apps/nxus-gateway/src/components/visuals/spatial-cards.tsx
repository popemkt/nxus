import { useState } from 'react'
import { Cube, Graph, CalendarBlank } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

export function SpatialCards({ apps }: { apps: MiniApp[] }) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mb-12 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">n</span>Xus
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a card to explore.
        </p>
      </div>

      {/* 3D carousel */}
      <div
        className="relative w-full max-w-4xl flex items-center justify-center"
        style={{ height: 380, perspective: '1200px' }}
      >
        {apps.map((app, index) => {
          const Icon = iconMap[app.icon]
          let offset = index - activeIndex
          if (offset < -(apps.length / 2)) offset += apps.length
          if (offset > apps.length / 2) offset -= apps.length

          const isActive = offset === 0
          const absOffset = Math.abs(offset)
          const translateX = offset * 260
          const translateZ = absOffset * -200
          const rotateY = offset * -25
          const scale = isActive ? 1 : 0.88
          const opacity = absOffset > 2 ? 0 : 1 - absOffset * 0.35
          const zIndex = 50 - absOffset * 10

          return (
            <div
              key={app.id}
              onClick={() => setActiveIndex(index)}
              className="absolute cursor-pointer"
              style={{
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                zIndex,
                opacity,
                pointerEvents: absOffset > 1 ? 'none' : 'auto',
                transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            >
              <div
                className="w-72 rounded-2xl border p-8 text-center transition-all duration-500"
                style={{
                  minHeight: 320,
                  borderColor: isActive
                    ? 'color-mix(in oklch, var(--primary) 50%, transparent)'
                    : undefined,
                  background: isActive
                    ? 'var(--card)'
                    : 'color-mix(in oklch, var(--card) 60%, transparent)',
                  boxShadow: isActive
                    ? '0 20px 60px -12px color-mix(in oklch, var(--primary) 20%, transparent), 0 0 0 1px color-mix(in oklch, var(--primary) 10%, transparent)'
                    : '0 4px 20px -4px color-mix(in oklch, var(--foreground) 5%, transparent)',
                }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className="mb-6 flex size-16 items-center justify-center rounded-xl border transition-all duration-300"
                    style={{
                      borderColor: isActive
                        ? 'color-mix(in oklch, var(--primary) 30%, transparent)'
                        : undefined,
                      background: isActive
                        ? 'color-mix(in oklch, var(--primary) 10%, transparent)'
                        : 'var(--muted)',
                      color: isActive
                        ? 'var(--primary)'
                        : 'var(--muted-foreground)',
                    }}
                  >
                    <Icon
                      size={36}
                      weight={isActive ? 'duotone' : 'regular'}
                    />
                  </div>

                  <h3
                    className={`text-xl font-medium transition-colors duration-300 ${
                      isActive
                        ? 'text-card-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {app.name}
                  </h3>

                  <p
                    className={`mt-3 text-sm/relaxed transition-colors duration-300 ${
                      isActive
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50'
                    }`}
                  >
                    {app.description}
                  </p>

                  {isActive && (
                    <a
                      href={app.path}
                      className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      Launch
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dot indicators */}
      <div className="mt-8 flex items-center gap-1.5">
        {apps.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeIndex
                ? 'w-6 bg-primary'
                : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
