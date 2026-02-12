import { useCallback, useRef, useState } from 'react'
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

    const rotateX = (0.5 - y) * 30
    const rotateY = (x - 0.5) * 30

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
      style={{ perspective: '600px' }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative h-full rounded-2xl transition-transform duration-200 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          willChange: isHovered ? 'transform' : 'auto',
        }}
      >
        {/* Layer 1 (deepest): Soft diffused glow shadow */}
        <div
          className="absolute -inset-4 rounded-3xl transition-opacity duration-500"
          style={{
            transform: 'translateZ(-120px)',
            background: `radial-gradient(ellipse at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, var(--primary), transparent 70%)`,
            opacity: isHovered ? 0.45 : 0.15,
            filter: 'blur(30px)',
          }}
        />

        {/* Layer 2: Backdrop shadow card */}
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            transform: 'translateZ(-120px) scale(1.05)',
            background: 'color-mix(in oklch, var(--primary) 6%, var(--card))',
            opacity: 0.6,
            boxShadow: '0 25px 50px -12px color-mix(in oklch, var(--foreground) 15%, transparent)',
          }}
        />

        {/* Layer 3: Colored accent strip along bottom edge */}
        <div
          className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
          style={{
            transform: 'translateZ(-36px)',
            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
            opacity: 0.5,
            filter: 'blur(1px)',
          }}
        />

        {/* Layer 4: Main glass card surface (overflow-hidden for light effects only) */}
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

          {/* Theme-colored radial glow that follows cursor */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{
              background: `radial-gradient(ellipse at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 65%)`,
              opacity: isHovered ? 1 : 0,
            }}
          />

          {/* Shine/gleam — paints card base color over the theme glow to cancel it */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{
              backgroundImage: `radial-gradient(
                farthest-corner circle at ${(1 - tilt.mouseX) * 100}% ${(1 - tilt.mouseY) * 100}%,
                var(--card) 10%,
                transparent 55%
              )`,
              opacity: isHovered ? 0.75 : 0,
            }}
          />

          {/* Invisible spacer to maintain card height for the content */}
          <div className="invisible">
            <div className="flex items-start justify-between">
              <div className="size-12" />
            </div>
            <div className="mt-4">
              <h3 className="text-base font-semibold">{app.name}</h3>
              <p className="mt-1.5 text-xs/relaxed">{app.description}</p>
            </div>
          </div>
        </div>

        {/* Content layers — outside overflow-hidden, as siblings in the preserve-3d container */}
        <div
          className="pointer-events-none absolute inset-0 p-6"
          style={{ transform: 'translateZ(0px)', transformStyle: 'preserve-3d' }}
        >
          <div className="flex items-start justify-between" style={{ transformStyle: 'preserve-3d' }}>
            {/* Icon — highest layer, elevates on hover */}
            <div
              className="pointer-events-auto relative flex size-12 items-center justify-center rounded-xl border text-primary"
              style={{
                transform: isHovered ? 'translateZ(60px)' : 'translateZ(0px)',
                transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
                background: 'color-mix(in oklch, var(--primary) 12%, color-mix(in oklch, var(--card) 80%, transparent))',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderColor: 'color-mix(in oklch, var(--primary) 20%, color-mix(in oklch, white 10%, transparent))',
                boxShadow: '0 6px 20px color-mix(in oklch, var(--primary) 15%, transparent)',
              }}
            >
              <Icon size={24} weight="duotone" />
            </div>

            {/* Arrow — elevates on hover */}
            <ArrowRight
              size={16}
              weight="bold"
              className="text-muted-foreground"
              style={{
                transform: isHovered ? 'translateZ(45px)' : 'translateZ(0px)',
                transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) 0.03s',
                opacity: 0.6,
              }}
            />
          </div>

          {/* Text content — same elevation, lifts on hover */}
          <div className="mt-4" style={{ transformStyle: 'preserve-3d' }}>
            <h3
              className="text-base font-semibold text-card-foreground"
              style={{
                transform: isHovered ? 'translateZ(25px)' : 'translateZ(0px)',
                transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) 0.05s',
              }}
            >
              {app.name}
            </h3>
            <p
              className="mt-1.5 text-xs/relaxed text-muted-foreground"
              style={{
                transform: isHovered ? 'translateZ(25px)' : 'translateZ(0px)',
                transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) 0.07s',
              }}
            >
              {app.description}
            </p>
          </div>
        </div>

        {/* Rim light on top of card — animated border shimmer */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            transform: 'translateZ(6px)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklch, white 6%, transparent)',
            opacity: isHovered ? 1 : 0.3,
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
            <span
              className="text-primary"
              style={{ textShadow: '0 0 20px color-mix(in oklch, var(--primary) 40%, transparent)' }}
            >n</span>
            <span className="tracking-wide">Xus</span>
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
