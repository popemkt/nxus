import { useState } from 'react'
import {
  Cube,
  Graph,
  CalendarBlank,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

export function SpatialCards({ apps }: { apps: MiniApp[] }) {
  const [activeIndex, setActiveIndex] = useState(0)

  const handlePrev = () =>
    setActiveIndex((prev) => (prev - 1 + apps.length) % apps.length)
  const handleNext = () =>
    setActiveIndex((prev) => (prev + 1) % apps.length)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mb-12 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">n</span>Xus
        </h1>
        <p className="text-sm text-muted-foreground">
          Navigate to select an application.
        </p>
      </div>

      {/* 3D carousel */}
      <div
        className="relative w-full max-w-4xl flex items-center justify-center"
        style={{ height: 360, perspective: '1000px' }}
      >
        {apps.map((app, index) => {
          const Icon = iconMap[app.icon]
          let offset = index - activeIndex
          if (offset < -(apps.length / 2)) offset += apps.length
          if (offset > apps.length / 2) offset -= apps.length

          const isActive = offset === 0
          const absOffset = Math.abs(offset)
          const translateX = offset * 240
          const translateZ = absOffset * -180
          const rotateY = offset * -20
          const opacity = absOffset > 2 ? 0 : 1 - absOffset * 0.3
          const zIndex = 50 - absOffset * 10

          return (
            <div
              key={app.id}
              onClick={() => setActiveIndex(index)}
              className="absolute cursor-pointer"
              style={{
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg)`,
                zIndex,
                opacity,
                pointerEvents: absOffset > 1 ? 'none' : 'auto',
                transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            >
              <div
                className={`w-72 rounded-2xl border p-8 text-center transition-all duration-500 ${
                  isActive
                    ? 'border-primary bg-card shadow-lg shadow-primary/10'
                    : 'border-border bg-card/60'
                }`}
                style={{ minHeight: 300 }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`mb-6 flex size-16 items-center justify-center rounded-xl border transition-colors duration-300 ${
                      isActive
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
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

      {/* Navigation arrows */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={handlePrev}
          className="flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex items-center gap-1.5">
          {apps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
        <button
          onClick={handleNext}
          className="flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
