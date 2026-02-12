import { useState, useCallback, useRef } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

/*
 * Two-blob aurora palettes.
 * `left` = the smaller blob on the left (theme-colored).
 * `right*` = the main large blob on the right (deep → bright → white).
 */
const palettes = [
  {
    left: 'oklch(0.40 0.22 280)',
    rightDeep: 'oklch(0.30 0.25 285)',
    rightMid: 'oklch(0.48 0.30 270)',
    rightBright: 'oklch(0.65 0.28 295)',
    rightHot: 'oklch(0.80 0.15 310)',
  },
  {
    left: 'oklch(0.40 0.16 195)',
    rightDeep: 'oklch(0.30 0.18 200)',
    rightMid: 'oklch(0.48 0.22 185)',
    rightBright: 'oklch(0.65 0.20 180)',
    rightHot: 'oklch(0.80 0.10 190)',
  },
  {
    left: 'oklch(0.40 0.20 340)',
    rightDeep: 'oklch(0.30 0.24 345)',
    rightMid: 'oklch(0.48 0.26 330)',
    rightBright: 'oklch(0.65 0.22 340)',
    rightHot: 'oklch(0.80 0.12 350)',
  },
]

function AuroraCard({ app, index }: { app: MiniApp; index: number }) {
  const Icon = iconMap[app.icon]
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const p = palettes[index % palettes.length]

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMouse({
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      })
    },
    []
  )

  // Right blob shifts with mouse
  const rx = 60 + mouse.x * 15
  const ry = 70 + mouse.y * 10

  return (
    <a href={app.path} className="group block no-underline">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative overflow-hidden rounded-[20px] transition-all duration-500"
        style={{
          background: 'oklch(0.13 0.02 280)',
          border: '1px solid oklch(0.22 0.02 280 / 0.6)',
          boxShadow: isHovered
            ? '0 30px 80px -20px oklch(0.3 0.2 280 / 0.4), 0 0 0 1px oklch(0.28 0.04 280 / 0.3)'
            : '0 4px 32px -8px oklch(0 0 0 / 0.6)',
        }}
      >
        {/*
         * BLOB 1 (left): Smaller, theme-colored, positioned center-left.
         * Visible in the reference as a separate blue-purple glow.
         */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            transition: 'opacity 0.7s ease',
            opacity: isHovered ? 0.9 : 0.65,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 55% 50% at 25% 65%, ${p.left}, transparent 70%)`,
              filter: 'blur(28px)',
            }}
          />
        </div>

        {/*
         * BLOB 2 (right): Main aurora — large, intense, goes to white.
         * Deep purple base → blue → bright magenta → blazing white core.
         */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            transition: 'opacity 0.7s ease',
            opacity: isHovered ? 1 : 0.75,
          }}
        >
          {/* Deep base — wide spread */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 100% 70% at ${rx}% ${ry}%, ${p.rightDeep}, transparent 65%)`,
              filter: 'blur(24px)',
            }}
          />
          {/* Mid — richer, tighter */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 70% 55% at ${rx + 5}% ${ry + 5}%, ${p.rightMid}, transparent 60%)`,
              filter: 'blur(18px)',
            }}
          />
          {/* Bright fringe */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 50% 40% at ${rx + 8}% ${ry + 10}%, ${p.rightBright}, transparent 55%)`,
              filter: 'blur(14px)',
            }}
          />
          {/* Hot core — nearly white, concentrated */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 35% 22% at ${rx + 10}% 93%, ${p.rightHot}, transparent 50%)`,
              filter: 'blur(8px)',
            }}
          />
          {/* White-hot center — pure white point */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 18% 12% at ${rx + 8}% 96%, oklch(0.97 0 0), transparent 50%)`,
              filter: 'blur(5px)',
            }}
          />
          {/* Bottom band fill — ensures the very bottom edge is lit */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${p.rightBright}, transparent 35%)`,
              opacity: 0.3,
            }}
          />
        </div>

        {/* Glass top-edge highlight */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 5%, oklch(1 0 0 / 0.1) 30%, oklch(1 0 0 / 0.15) 50%, oklch(1 0 0 / 0.1) 70%, transparent 95%)',
          }}
        />

        {/* Glass inner sheen from top */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{
            background:
              'linear-gradient(180deg, oklch(1 0 0 / 0.04) 0%, transparent 30%)',
          }}
        />

        {/* Card content */}
        <div className="relative z-10 p-6">
          <div className="flex items-start justify-between">
            {/*
             * 3D Go-piece icon — dome shape extruding from card.
             * Multiple layers: shadow underneath, dark body, glossy rim at top.
             */}
            <div className="relative">
              {/* Shadow underneath the dome */}
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: 40,
                  height: 8,
                  background: 'oklch(0 0 0 / 0.4)',
                  filter: 'blur(6px)',
                }}
              />
              {/* Icon dome body */}
              <div
                className="relative flex size-12 items-center justify-center rounded-full transition-all duration-300"
                style={{
                  background:
                    'radial-gradient(ellipse 100% 80% at 50% 60%, oklch(0.22 0.04 280), oklch(0.14 0.02 280) 80%)',
                  border: '1px solid oklch(0.30 0.04 280 / 0.5)',
                  boxShadow: `
                    inset 0 -3px 6px oklch(0 0 0 / 0.4),
                    0 4px 12px oklch(0 0 0 / 0.5)
                  `,
                  color: isHovered
                    ? 'oklch(0.85 0.06 280)'
                    : 'oklch(0.55 0.04 280)',
                }}
              >
                {/* Glossy rim highlight at the top of the dome */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    background:
                      'radial-gradient(ellipse 70% 30% at 50% 15%, oklch(1 0 0 / 0.2), transparent 60%)',
                  }}
                />
                {/* Subtle ring/rim */}
                <div
                  className="pointer-events-none absolute inset-[1px] rounded-full"
                  style={{
                    border: '1px solid oklch(1 0 0 / 0.08)',
                    borderBottom: 'none',
                  }}
                />
                <Icon size={22} weight="duotone" className="relative z-10" />
              </div>
            </div>

            {/* Arrow — like other views */}
            <ArrowRight
              size={16}
              weight="bold"
              className="transition-all duration-300"
              style={{
                color: 'oklch(0.8 0 0)',
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
              }}
            />
          </div>

          <div className="mt-4">
            <h3
              className="text-base font-semibold tracking-tight"
              style={{ color: 'oklch(0.95 0 0)' }}
            >
              {app.name}
            </h3>
            <p
              className="mt-1.5 text-xs/relaxed"
              style={{ color: 'oklch(0.6 0 0)' }}
            >
              {app.description}
            </p>
          </div>
        </div>
      </div>
    </a>
  )
}

export function AuroraCards({ apps }: { apps: MiniApp[] }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{
        background: 'oklch(0.08 0.01 280)',
      }}
    >
      {/* Ambient background glow — subtle purple radial */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.15 0.08 280 / 0.6), transparent 70%),
            radial-gradient(ellipse 40% 35% at 25% 65%, oklch(0.12 0.06 300 / 0.3), transparent),
            radial-gradient(ellipse 35% 30% at 75% 35%, oklch(0.12 0.05 250 / 0.2), transparent)
          `,
        }}
      />

      <div className="relative w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'oklch(0.95 0 0)' }}
          >
            <span style={{
              color: 'oklch(0.7 0.18 280)',
              textShadow: '0 0 24px oklch(0.5 0.25 280 / 0.6), 0 0 48px oklch(0.4 0.2 300 / 0.3)',
            }}>n</span>Xus
          </h1>
          <p className="text-sm" style={{ color: 'oklch(0.5 0 0)' }}>
            Select an application to get started.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {apps.map((app, index) => (
            <AuroraCard key={app.id} app={app} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
