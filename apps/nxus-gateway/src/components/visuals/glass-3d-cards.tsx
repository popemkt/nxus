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

    const rotateX = (0.5 - y) * 25
    const rotateY = (x - 0.5) * 25

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
      style={{ perspective: '1000px' }}
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
        {/* Layer 1 (deepest): Soft diffused glow shadow — always visible, intensifies on hover */}
        <div
          className="absolute -inset-3 rounded-3xl transition-opacity duration-500"
          style={{
            transform: 'translateZ(-50px)',
            background: `radial-gradient(ellipse at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, var(--primary), transparent 70%)`,
            opacity: isHovered ? 0.4 : 0.12,
            filter: 'blur(30px)',
          }}
        />

        {/* Layer 2: Noise/texture backdrop card — always present for depth */}
        <div
          className="absolute inset-0 rounded-2xl transition-all duration-300"
          style={{
            transform: 'translateZ(-25px) scale(1.04)',
            background: 'color-mix(in oklch, var(--primary) 6%, var(--card))',
            opacity: isHovered ? 1 : 0.5,
            boxShadow: '0 25px 50px -12px color-mix(in oklch, var(--foreground) 15%, transparent)',
          }}
        />

        {/* Layer 3: Colored accent strip along bottom edge */}
        <div
          className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full transition-all duration-300"
          style={{
            transform: 'translateZ(-15px)',
            background: `linear-gradient(90deg, transparent, var(--primary), transparent)`,
            opacity: isHovered ? 0.8 : 0.3,
            filter: 'blur(1px)',
          }}
        />

        {/* Layer 4: Main glass card surface */}
        <div
          className="relative overflow-hidden rounded-2xl border p-6 transition-all duration-300"
          style={{
            transform: 'translateZ(0px)',
            background: 'color-mix(in oklch, var(--card) 65%, transparent)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            borderColor: isHovered
              ? 'color-mix(in oklch, var(--primary) 25%, color-mix(in oklch, white 15%, transparent))'
              : 'color-mix(in oklch, white 8%, transparent)',
            boxShadow: isHovered
              ? '0 8px 32px color-mix(in oklch, var(--foreground) 8%, transparent), inset 0 1px 0 color-mix(in oklch, white 10%, transparent)'
              : 'inset 0 1px 0 color-mix(in oklch, white 6%, transparent)',
          }}
        >
          {/* Subtle noise texture overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
            }}
          />

          {/* Light reflection — sweeping highlight that follows mouse */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background: `linear-gradient(${125 + (tilt.mouseX - 0.5) * 70}deg, color-mix(in oklch, white 12%, transparent) 0%, transparent 40%, transparent 60%, color-mix(in oklch, white 4%, transparent) 100%)`,
              opacity: isHovered ? 1 : 0,
            }}
          />

          {/* Radial glow that tracks cursor position */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, color-mix(in oklch, var(--primary) 10%, transparent) 0%, transparent 50%)`,
              opacity: isHovered ? 1 : 0,
            }}
          />

          {/* Layer 5: Content — sits above the glass surface */}
          <div style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }}>
            <div className="flex items-start justify-between" style={{ transformStyle: 'preserve-3d' }}>
              {/* Layer 6 (highest): Icon badge — always elevated, pops more on hover */}
              <div
                className="relative flex size-12 items-center justify-center rounded-xl border text-primary transition-all duration-300"
                style={{
                  transform: isHovered ? 'translateZ(75px) scale(1.1)' : 'translateZ(50px)',
                  background: isHovered
                    ? 'color-mix(in oklch, var(--primary) 15%, color-mix(in oklch, var(--card) 80%, transparent))'
                    : 'color-mix(in oklch, var(--primary) 10%, transparent)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderColor: isHovered
                    ? 'color-mix(in oklch, var(--primary) 30%, transparent)'
                    : 'color-mix(in oklch, white 10%, transparent)',
                  boxShadow: isHovered
                    ? '0 10px 35px color-mix(in oklch, var(--primary) 30%, transparent), inset 0 1px 0 color-mix(in oklch, white 12%, transparent)'
                    : '0 4px 12px color-mix(in oklch, var(--primary) 10%, transparent)',
                }}
              >
                <Icon size={24} weight="duotone" />
              </div>

              <ArrowRight
                size={16}
                weight="bold"
                className="text-muted-foreground transition-all duration-300"
                style={{
                  transform: isHovered ? 'translateZ(60px) translateX(4px)' : 'translateZ(35px)',
                  opacity: isHovered ? 1 : 0.5,
                }}
              />
            </div>

            {/* Text content always floats at different depths for parallax */}
            <div className="mt-4" style={{ transformStyle: 'preserve-3d' }}>
              <h3
                className="text-base font-semibold text-card-foreground"
                style={{
                  transform: isHovered ? 'translateZ(45px)' : 'translateZ(28px)',
                  transition: 'transform 0.3s ease-out',
                }}
              >
                {app.name}
              </h3>
              <p
                className="mt-1.5 text-xs/relaxed text-muted-foreground"
                style={{
                  transform: isHovered ? 'translateZ(25px)' : 'translateZ(12px)',
                  transition: 'transform 0.3s ease-out',
                }}
              >
                {app.description}
              </p>
            </div>
          </div>
        </div>

        {/* Layer 7: Edge highlight on top of card — thin rim light */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            transform: 'translateZ(2px)',
            boxShadow: isHovered
              ? `inset 0 0 0 1px color-mix(in oklch, white 8%, transparent)`
              : 'none',
            opacity: isHovered ? 1 : 0,
          }}
        />
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
