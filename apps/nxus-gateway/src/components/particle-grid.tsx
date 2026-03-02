import { useEffect, useRef, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  vx: number
  vy: number
  radius: number
  opacity: number
  pulseOffset: number
}

/** How far grid dots shift in response to the cursor (px). */
const PARALLAX_STRENGTH = 12
/** Spacing between grid dots (px). */
const GRID_SPACING = 48
/** Base radius of each grid dot. */
const DOT_RADIUS = 1.2
/** Number of free-floating particles layered on top of the grid. */
const FLOATING_PARTICLE_COUNT = 35
/** Maximum drift speed for floating particles. */
const FLOAT_SPEED = 0.15

function parseOklch(raw: string): { l: number; c: number; h: number; a: number } | null {
  // Handles both "oklch(0.67 0.16 58)" and "oklch(0.67 0.16 58 / 50%)"
  const m = raw.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?)?\s*\)/,
  )
  if (!m) return null
  return {
    l: parseFloat(m[1]!),
    c: parseFloat(m[2]!),
    h: parseFloat(m[3]!),
    a: m[4] != null ? parseFloat(m[4]) / 100 : 1,
  }
}

function oklchToCss(l: number, c: number, h: number, a: number): string {
  return `oklch(${l} ${c} ${h} / ${a})`
}

/**
 * Full-viewport animated canvas background.
 *
 * Renders a subtle dot grid with floating particles that drift and pulse.
 * All colours are derived from the current theme's CSS custom properties
 * (`--primary`, `--background`) so it adapts automatically across all
 * 19 palettes and light/dark modes.
 *
 * Respects `prefers-reduced-motion` — shows a static grid with no animation.
 */
export function ParticleGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const particlesRef = useRef<Particle[]>([])
  const reducedMotionRef = useRef(false)

  const resolveThemeColors = useCallback(() => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    const rawPrimary = style.getPropertyValue('--primary').trim()
    const rawBg = style.getPropertyValue('--background').trim()

    const primary = parseOklch(rawPrimary)
    const bg = parseOklch(rawBg)

    // Fallbacks in case parsing fails (shouldn't happen with oklch themes)
    const dotColor = primary
      ? oklchToCss(primary.l, primary.c, primary.h, 0.12)
      : 'rgba(120,120,255,0.12)'
    const particleColor = primary
      ? oklchToCss(primary.l, primary.c, primary.h, 0.25)
      : 'rgba(120,120,255,0.25)'
    const bgFill = bg
      ? oklchToCss(bg.l, bg.c, bg.h, 1)
      : '#0a0a0a'

    return { dotColor, particleColor, bgFill, primary }
  }, [])

  const initFloatingParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = []
    for (let i = 0; i < FLOATING_PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        baseX: 0,
        baseY: 0,
        vx: (Math.random() - 0.5) * FLOAT_SPEED * 2,
        vy: (Math.random() - 0.5) * FLOAT_SPEED * 2,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
        pulseOffset: Math.random() * Math.PI * 2,
      })
    }
    particlesRef.current = particles
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }
    motionQuery.addEventListener('change', onMotionChange)

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initFloatingParticles(window.innerWidth, window.innerHeight)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)

    let lastTime = 0

    const draw = (time: number) => {
      const dt = Math.min(time - lastTime, 32) // cap delta to avoid jumps
      lastTime = time

      const w = window.innerWidth
      const h = window.innerHeight
      const { dotColor, particleColor, bgFill, primary } = resolveThemeColors()

      // Clear
      ctx.fillStyle = bgFill
      ctx.fillRect(0, 0, w, h)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // --- Dot grid ---
      const cols = Math.ceil(w / GRID_SPACING) + 1
      const rows = Math.ceil(h / GRID_SPACING) + 1

      ctx.fillStyle = dotColor
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const bx = col * GRID_SPACING
          const by = row * GRID_SPACING

          // Parallax offset based on mouse position
          const offsetX = reducedMotionRef.current
            ? 0
            : (mx - 0.5) * PARALLAX_STRENGTH * ((col / cols - 0.5) * 0.6)
          const offsetY = reducedMotionRef.current
            ? 0
            : (my - 0.5) * PARALLAX_STRENGTH * ((row / rows - 0.5) * 0.6)

          const x = bx + offsetX
          const y = by + offsetY

          ctx.beginPath()
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (!reducedMotionRef.current) {
        // --- Floating particles ---
        const particles = particlesRef.current
        const elapsed = time * 0.001 // seconds

        for (const p of particles) {
          // Drift
          p.x += p.vx * (dt * 0.06)
          p.y += p.vy * (dt * 0.06)

          // Wrap around edges
          if (p.x < -10) p.x = w + 10
          if (p.x > w + 10) p.x = -10
          if (p.y < -10) p.y = h + 10
          if (p.y > h + 10) p.y = -10

          // Pulse opacity
          const pulse = Math.sin(elapsed * 1.2 + p.pulseOffset) * 0.5 + 0.5
          const alpha = p.opacity * (0.5 + pulse * 0.5)

          const color = primary
            ? oklchToCss(primary.l, primary.c, primary.h, alpha)
            : particleColor

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    // If reduced motion, draw once and stop
    if (reducedMotionRef.current) {
      draw(0)
    } else {
      animationRef.current = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      motionQuery.removeEventListener('change', onMotionChange)
    }
  }, [resolveThemeColors, initFloatingParticles])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  )
}
