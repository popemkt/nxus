import { useState, useCallback, useRef } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

interface CardTilt {
  rotateX: number
  rotateY: number
  mouseX: number
  mouseY: number
}

const defaultTilt: CardTilt = { rotateX: 0, rotateY: 0, mouseX: 0.5, mouseY: 0.5 }

function Glass3DCard({ app }: { app: MiniApp }) {
  const Icon = iconMap[app.icon]
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState<CardTilt>(defaultTilt)
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    const rotateX = (0.5 - y) * 15
    const rotateY = (x - 0.5) * 15

    setTilt({ rotateX, rotateY, mouseX: x, mouseY: y })
  }, [])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTilt(defaultTilt)
  }, [])

  return (
    <a
      href={app.path}
      className="group block no-underline"
      style={{ perspective: '800px' }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative h-full rounded-2xl transition-transform duration-300 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          willChange: isHovered ? 'transform' : 'auto',
        }}
      >
        {/* Glow shadow beneath card */}
        <div
          className="absolute -inset-1 rounded-2xl opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-60"
          style={{
            background: 'var(--primary)',
            transform: 'translateZ(-30px)',
            zIndex: -1,
          }}
        />

        {/* Background glow layer - deepest */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            transform: 'translateZ(-20px)',
            background: `radial-gradient(circle at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, color-mix(in oklch, var(--primary) 15%, transparent), transparent 60%)`,
          }}
        />

        {/* Main glass card surface */}
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 p-6"
          style={{
            transform: 'translateZ(0px)',
            background: 'color-mix(in oklch, var(--card) 60%, transparent)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Light reflection gradient */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: `linear-gradient(${135 + (tilt.mouseX - 0.5) * 60}deg, color-mix(in oklch, white 8%, transparent) 0%, transparent 50%)`,
            }}
          />

          {/* Content layer */}
          <div style={{ transform: 'translateZ(10px)' }}>
            <div className="flex items-start justify-between">
              {/* Icon layer - floats above */}
              <div
                className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-primary transition-transform duration-300"
                style={{
                  transform: isHovered ? 'translateZ(30px)' : 'translateZ(0px)',
                  background: 'color-mix(in oklch, var(--primary) 12%, transparent)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Icon size={24} weight="duotone" />
              </div>
              <ArrowRight
                size={16}
                weight="bold"
                className="text-muted-foreground opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0.5"
                style={{
                  transform: isHovered ? 'translateZ(20px)' : 'translateZ(0px)',
                }}
              />
            </div>

            <div className="mt-4">
              <h3
                className="text-base font-medium text-card-foreground"
                style={{
                  transform: isHovered ? 'translateZ(15px)' : 'translateZ(0px)',
                  transition: 'transform 0.3s ease-out',
                }}
              >
                {app.name}
              </h3>
              <p
                className="mt-1.5 text-xs/relaxed text-muted-foreground"
                style={{
                  transform: isHovered ? 'translateZ(8px)' : 'translateZ(0px)',
                  transition: 'transform 0.3s ease-out',
                }}
              >
                {app.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </a>
  )
}

export function Glass3DCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">n</span>Xus
          </h1>
          <p className="text-sm text-muted-foreground">
            Select an application to get started.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {apps.map((app) => (
            <Glass3DCard key={app.id} app={app} />
          ))}
        </div>
      </div>
    </div>
  )
}
