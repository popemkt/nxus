import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Cube, Graph, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import type { MiniApp } from '@/config/mini-apps'

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const
const ARCANA = ['The Architect', 'The Weaver', 'The Keeper'] as const
const SYMBOLS_TOP = ['\u2727', '\u2726', '\u2735'] as const // ✧ ✦ ✵
const SYMBOLS_BOT = ['\u2733', '\u2734', '\u2731'] as const // ✳ ✴ ✱

const GOLD = 'oklch(0.82 0.14 85)'
const GOLD_DIM = 'oklch(0.62 0.10 80)'
const GOLD_BRIGHT = 'oklch(0.92 0.12 88)'
const VOID = 'oklch(0.06 0.04 280)'
const DEEP_INDIGO = 'oklch(0.12 0.08 275)'
const CARD_BG = 'oklch(0.09 0.05 278)'

/** Generates a random starfield as a single box-shadow string */
function generateStars(count: number, maxSize: number, spread: number): string {
  const stars: string[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.round(Math.random() * 2400 - 400)
    const y = Math.round(Math.random() * 2400 - 400)
    const size = Math.random() * maxSize
    const opacity = 0.3 + Math.random() * 0.7
    stars.push(
      `${x}px ${y}px ${spread}px ${size}px oklch(0.97 0.02 250 / ${opacity.toFixed(2)})`
    )
  }
  return stars.join(',')
}

function useFonts() {
  useEffect(() => {
    const id = 'cosmic-tarot-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap'
    document.head.appendChild(link)
  }, [])
}

function TarotCard({
  app,
  index,
  total,
}: {
  app: MiniApp
  index: number
  total: number
}) {
  const Icon = iconMap[app.icon]
  const cardRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 300 + index * 200)
    return () => clearTimeout(timer)
  }, [index])

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

  const rotateX = (mouse.y - 0.5) * -12
  const rotateY = (mouse.x - 0.5) * 12

  // Fan layout: slight rotation for each card
  const fanAngle = total > 1 ? (index - (total - 1) / 2) * 6 : 0
  const fanY = Math.abs(index - (total - 1) / 2) * 15

  const arcana = ARCANA[index % ARCANA.length]
  const roman = ROMAN[index % ROMAN.length]
  const symTop = SYMBOLS_TOP[index % SYMBOLS_TOP.length]
  const symBot = SYMBOLS_BOT[index % SYMBOLS_BOT.length]

  return (
    <a
      href={app.path}
      className="block no-underline"
      style={{
        perspective: '1200px',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false)
          setMouse({ x: 0.5, y: 0.5 })
        }}
        style={{
          position: 'relative',
          borderRadius: 16,
          padding: 3,
          background: hovered
            ? `linear-gradient(135deg, ${GOLD}, ${GOLD_DIM} 40%, ${GOLD_BRIGHT} 60%, ${GOLD_DIM})`
            : `linear-gradient(135deg, ${GOLD_DIM} 0%, oklch(0.35 0.06 80) 50%, ${GOLD_DIM} 100%)`,
          transform: hovered
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-16px) rotate(0deg) scale(1.04)`
            : `translateY(${fanY}px) rotate(${fanAngle}deg) scale(1)`,
          transition: hovered
            ? 'transform 0.1s ease-out, background 0.3s, box-shadow 0.3s'
            : 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), background 0.5s, box-shadow 0.5s',
          boxShadow: hovered
            ? `0 30px 60px -10px oklch(0 0 0 / 0.7),
               0 0 40px oklch(0.7 0.14 85 / 0.3),
               0 0 80px oklch(0.6 0.16 85 / 0.15),
               inset 0 0 1px oklch(0.9 0.1 85 / 0.3)`
            : `0 15px 40px -10px oklch(0 0 0 / 0.6),
               0 0 20px oklch(0.5 0.1 85 / 0.08)`,
          opacity: entered ? 1 : 0,
          cursor: 'pointer',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {/* Inner card surface */}
        <div
          style={{
            position: 'relative',
            borderRadius: 13,
            background: `
              radial-gradient(ellipse 80% 60% at ${50 + (mouse.x - 0.5) * 20}% ${50 + (mouse.y - 0.5) * 20}%, ${DEEP_INDIGO}, ${CARD_BG} 70%),
              ${CARD_BG}
            `,
            overflow: 'hidden',
            padding: '28px 24px 24px',
          }}
        >
          {/* Inner ornate border */}
          <div
            style={{
              position: 'absolute',
              inset: 10,
              borderRadius: 6,
              border: `1px solid oklch(0.6 0.10 80 / ${hovered ? 0.5 : 0.2})`,
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }}
          />
          {/* Second inner border (double frame) */}
          <div
            style={{
              position: 'absolute',
              inset: 14,
              borderRadius: 4,
              border: `1px solid oklch(0.5 0.08 80 / ${hovered ? 0.3 : 0.1})`,
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }}
          />

          {/* Corner ornaments */}
          {[
            { top: 16, left: 16 },
            { top: 16, right: 16 },
            { bottom: 16, left: 16 },
            { bottom: 16, right: 16 },
          ].map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                ...pos,
                fontSize: 10,
                color: `oklch(0.65 0.10 80 / ${hovered ? 0.7 : 0.3})`,
                transition: 'color 0.4s',
                fontFamily: 'serif',
                lineHeight: 1,
              }}
            >
              {i < 2 ? symTop : symBot}
            </div>
          ))}

          {/* Roman numeral header */}
          <div
            style={{
              textAlign: 'center',
              fontFamily: '"Cinzel Decorative", "Times New Roman", serif',
              fontSize: 11,
              letterSpacing: '0.35em',
              color: hovered ? GOLD : GOLD_DIM,
              transition: 'color 0.4s',
              marginBottom: 20,
              textTransform: 'uppercase',
            }}
          >
            {roman}
          </div>

          {/* Central mystical circle with icon */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <div style={{ position: 'relative' }}>
              {/* Outer glow ring */}
              <div
                style={{
                  position: 'absolute',
                  inset: -12,
                  borderRadius: '50%',
                  border: `1px solid oklch(0.6 0.12 85 / ${hovered ? 0.5 : 0.15})`,
                  transition: 'border-color 0.5s, box-shadow 0.5s',
                  boxShadow: hovered
                    ? `0 0 30px oklch(0.6 0.14 85 / 0.3), inset 0 0 20px oklch(0.6 0.14 85 / 0.1)`
                    : 'none',
                  animation: 'tarot-ring-spin 20s linear infinite',
                }}
              />
              {/* Middle decorative ring */}
              <div
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: '50%',
                  border: `1px dashed oklch(0.5 0.08 80 / ${hovered ? 0.4 : 0.12})`,
                  transition: 'border-color 0.5s',
                  animation: 'tarot-ring-spin 15s linear infinite reverse',
                }}
              />
              {/* Icon circle */}
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `radial-gradient(circle at 40% 35%, oklch(0.18 0.08 278), oklch(0.08 0.04 280) 70%)`,
                  border: `1.5px solid oklch(0.65 0.12 85 / ${hovered ? 0.6 : 0.25})`,
                  transition: 'border-color 0.4s, box-shadow 0.4s',
                  boxShadow: hovered
                    ? `0 0 20px oklch(0.6 0.14 85 / 0.25), inset 0 0 12px oklch(0.4 0.1 280 / 0.3)`
                    : `inset 0 0 8px oklch(0 0 0 / 0.3)`,
                  color: hovered ? GOLD_BRIGHT : GOLD_DIM,
                }}
              >
                <Icon size={28} weight="duotone" />
              </div>
            </div>
          </div>

          {/* Arcana title */}
          <div
            style={{
              textAlign: 'center',
              fontFamily: '"Cinzel Decorative", "Times New Roman", serif',
              fontSize: 9,
              letterSpacing: '0.25em',
              color: `oklch(0.55 0.08 80 / ${hovered ? 0.9 : 0.5})`,
              transition: 'color 0.4s',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            {arcana}
          </div>

          {/* Divider line */}
          <div
            style={{
              height: 1,
              margin: '8px 24px 12px',
              background: `linear-gradient(90deg, transparent, oklch(0.6 0.10 85 / ${hovered ? 0.4 : 0.15}), transparent)`,
              transition: 'background 0.4s',
            }}
          />

          {/* App name */}
          <h3
            style={{
              textAlign: 'center',
              fontFamily: '"Cinzel Decorative", "Times New Roman", serif',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: hovered ? GOLD_BRIGHT : 'oklch(0.88 0.04 85)',
              transition: 'color 0.4s, text-shadow 0.4s',
              margin: '0 0 8px',
              textShadow: hovered
                ? `0 0 20px oklch(0.7 0.14 85 / 0.5)`
                : 'none',
            }}
          >
            {app.name}
          </h3>

          {/* Description */}
          <p
            style={{
              textAlign: 'center',
              fontFamily: '"Cormorant Garamond", "Georgia", serif',
              fontStyle: 'italic',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'oklch(0.55 0.02 270)',
              margin: '0 0 16px',
              letterSpacing: '0.01em',
            }}
          >
            {app.description}
          </p>

          {/* Bottom ornament + arrow */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: 'serif',
                fontSize: 12,
                color: `oklch(0.5 0.08 80 / ${hovered ? 0.7 : 0.3})`,
                transition: 'color 0.4s',
              }}
            >
              &#x2014; &#x2726; &#x2014;
            </span>
            <ArrowRight
              size={14}
              weight="bold"
              style={{
                color: GOLD,
                opacity: hovered ? 1 : 0,
                transform: hovered ? 'translateX(0)' : 'translateX(-6px)',
                transition: 'opacity 0.3s, transform 0.3s',
              }}
            />
          </div>

          {/* Hover shimmer overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 13,
              background: `radial-gradient(circle at ${mouse.x * 100}% ${mouse.y * 100}%, oklch(0.9 0.1 85 / ${hovered ? 0.06 : 0}), transparent 50%)`,
              pointerEvents: 'none',
              transition: 'background 0.2s',
            }}
          />

          {/* Noise texture overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 13,
              opacity: 0.03,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </a>
  )
}

function FloatingParticle({
  delay,
  x,
  duration,
  size,
}: {
  delay: number
  x: number
  duration: number
  size: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        bottom: '-5%',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${GOLD_BRIGHT}, transparent 70%)`,
        opacity: 0,
        animation: `tarot-float ${duration}s ${delay}s ease-in-out infinite`,
        pointerEvents: 'none',
      }}
    />
  )
}

export function CosmicTarotCards({ apps }: { apps: MiniApp[] }) {
  useFonts()

  const stars1 = useMemo(() => generateStars(200, 1, 0), [])
  const stars2 = useMemo(() => generateStars(100, 1.5, 1), [])
  const stars3 = useMemo(() => generateStars(40, 2, 1), [])

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        delay: Math.random() * 8,
        x: Math.random() * 100,
        duration: 6 + Math.random() * 8,
        size: 1 + Math.random() * 3,
      })),
    []
  )

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: `
          radial-gradient(ellipse 70% 50% at 50% 45%, ${DEEP_INDIGO}, ${VOID} 70%),
          ${VOID}
        `,
        overflow: 'hidden',
        fontFamily: '"Cormorant Garamond", Georgia, serif',
      }}
    >
      {/* Keyframe animations */}
      <style>{`
        @keyframes tarot-twinkle-1 {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes tarot-twinkle-2 {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        @keyframes tarot-twinkle-3 {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes tarot-ring-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes tarot-float {
          0% { opacity: 0; transform: translateY(0) scale(0.5); }
          15% { opacity: 0.8; }
          85% { opacity: 0.6; }
          100% { opacity: 0; transform: translateY(-100vh) scale(0); }
        }
        @keyframes tarot-title-glow {
          0%, 100% { text-shadow: 0 0 20px oklch(0.7 0.14 85 / 0.4), 0 0 40px oklch(0.5 0.10 80 / 0.2); }
          50% { text-shadow: 0 0 30px oklch(0.8 0.16 85 / 0.6), 0 0 60px oklch(0.6 0.12 80 / 0.3), 0 0 80px oklch(0.5 0.08 85 / 0.15); }
        }
        @keyframes tarot-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tarot-constellation {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Star layers */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            boxShadow: stars1,
            animation: 'tarot-twinkle-1 4s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            boxShadow: stars2,
            animation: 'tarot-twinkle-2 6s ease-in-out infinite 1s',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            boxShadow: stars3,
            animation: 'tarot-twinkle-3 8s ease-in-out infinite 2s',
          }}
        />
      </div>

      {/* Constellation lines - subtle geometric patterns */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          animation: 'tarot-constellation 10s ease-in-out infinite',
        }}
      >
        <defs>
          <linearGradient id="tarot-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GOLD_DIM} stopOpacity="0" />
            <stop offset="50%" stopColor={GOLD_DIM} stopOpacity="0.15" />
            <stop offset="100%" stopColor={GOLD_DIM} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="10%" y1="15%" x2="35%" y2="30%" stroke="url(#tarot-line-grad)" strokeWidth="0.5" />
        <line x1="65%" y1="20%" x2="90%" y2="35%" stroke="url(#tarot-line-grad)" strokeWidth="0.5" />
        <line x1="20%" y1="70%" x2="45%" y2="85%" stroke="url(#tarot-line-grad)" strokeWidth="0.5" />
        <line x1="55%" y1="75%" x2="80%" y2="88%" stroke="url(#tarot-line-grad)" strokeWidth="0.5" />
        <circle cx="10%" cy="15%" r="1.5" fill={GOLD_DIM} opacity="0.3" />
        <circle cx="35%" cy="30%" r="1" fill={GOLD_DIM} opacity="0.25" />
        <circle cx="90%" cy="35%" r="1.5" fill={GOLD_DIM} opacity="0.2" />
        <circle cx="65%" cy="20%" r="1" fill={GOLD_DIM} opacity="0.25" />
      </svg>

      {/* Floating golden particles */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        {particles.map((p, i) => (
          <FloatingParticle key={i} {...p} />
        ))}
      </div>

      {/* Radial vignette overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, transparent 40%, oklch(0 0 0 / 0.5) 100%)',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 780,
          animation: 'tarot-fade-in 1s ease-out',
        }}
      >
        {/* Title block */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {/* Top ornament */}
          <div
            style={{
              fontFamily: 'serif',
              fontSize: 14,
              color: GOLD_DIM,
              letterSpacing: '0.5em',
              marginBottom: 12,
              opacity: 0.5,
            }}
          >
            &#x2726; &#x2727; &#x2726;
          </div>

          <h1
            style={{
              fontFamily: '"Cinzel Decorative", "Times New Roman", serif',
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: GOLD,
              margin: 0,
              animation: 'tarot-title-glow 4s ease-in-out infinite',
            }}
          >
            <span style={{ color: GOLD_BRIGHT, fontSize: '1.1em' }}>n</span>
            Xus
          </h1>

          {/* Subtitle line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginTop: 12,
            }}
          >
            <div
              style={{
                width: 40,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${GOLD_DIM})`,
              }}
            />
            <p
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'oklch(0.55 0.04 270)',
                margin: 0,
                letterSpacing: '0.15em',
              }}
            >
              choose your path
            </p>
            <div
              style={{
                width: 40,
                height: 1,
                background: `linear-gradient(90deg, ${GOLD_DIM}, transparent)`,
              }}
            />
          </div>
        </div>

        {/* Cards in a fanned layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${apps.length}, 1fr)`,
            gap: 24,
            perspective: '1600px',
          }}
        >
          {apps.map((app, index) => (
            <TarotCard
              key={app.id}
              app={app}
              index={index}
              total={apps.length}
            />
          ))}
        </div>

        {/* Bottom ornament */}
        <div
          style={{
            textAlign: 'center',
            marginTop: 48,
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 11,
            letterSpacing: '0.3em',
            color: 'oklch(0.4 0.04 270)',
          }}
        >
          &#x2014;&#x2014; THE READING IS YOURS &#x2014;&#x2014;
        </div>
      </div>
    </div>
  )
}
