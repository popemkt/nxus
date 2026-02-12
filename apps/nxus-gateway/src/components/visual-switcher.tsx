import { useState, useRef } from 'react'
import {
  SquaresFour,
  Cube,
  Terminal,
  Planet,
  Leaf,
  Lightning,
  Compass,
  GridFour,
  Stack,
  ChartBar,
} from '@phosphor-icons/react'

export type VisualStyle =
  | 'default'
  | 'glass-3d'
  | 'terminal'
  | 'orbital'
  | 'zen'
  | 'neon'
  | 'blueprint'
  | 'bento'
  | 'spatial'
  | 'dashboard'

const STORAGE_KEY = 'nxus-gateway-visual'

const visuals: { id: VisualStyle; label: string; icon: typeof SquaresFour }[] =
  [
    { id: 'default', label: 'Default', icon: SquaresFour },
    { id: 'glass-3d', label: 'Glass 3D', icon: Cube },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'orbital', label: 'Orbital', icon: Planet },
    { id: 'zen', label: 'Zen', icon: Leaf },
    { id: 'neon', label: 'Neon Grid', icon: Lightning },
    { id: 'blueprint', label: 'Blueprint', icon: Compass },
    { id: 'bento', label: 'Bento Grid', icon: GridFour },
    { id: 'spatial', label: 'Spatial', icon: Stack },
    { id: 'dashboard', label: 'Dashboard', icon: ChartBar },
  ]

const BUTTON_SIZE = 28
const GAP = 4
const PADDING = 4
const COLLAPSED_WIDTH = BUTTON_SIZE + PADDING * 2
const EXPANDED_WIDTH =
  visuals.length * BUTTON_SIZE +
  (visuals.length - 1) * GAP +
  PADDING * 2

export function getStoredVisual(): VisualStyle {
  if (typeof window === 'undefined') return 'default'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && visuals.some((v) => v.id === stored)) {
    return stored as VisualStyle
  }
  return 'default'
}

export function setStoredVisual(visual: VisualStyle) {
  localStorage.setItem(STORAGE_KEY, visual)
}

export function VisualSwitcher({
  current,
  onChange,
}: {
  current: VisualStyle
  onChange: (visual: VisualStyle) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reorder: active first, rest in original order after it
  const sorted = [
    ...visuals.filter((v) => v.id === current),
    ...visuals.filter((v) => v.id !== current),
  ]

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-50"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className="flex items-center rounded-full border border-border/50 bg-card/60 backdrop-blur-lg shadow-sm"
        style={{
          width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
          padding: PADDING,
          gap: GAP,
          opacity: expanded ? 1 : 0.6,
          overflow: 'hidden',
          transition: 'width 0.3s ease-out, opacity 0.3s ease-out',
        }}
      >
        {sorted.map((v) => {
          const Icon = v.icon
          const isActive = current === v.id

          return (
            <button
              key={v.id}
              onClick={() => onChange(v.id)}
              title={v.label}
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                transition: 'background-color 0.2s, color 0.2s',
                background: isActive ? 'var(--primary)' : undefined,
                color: isActive
                  ? 'var(--primary-foreground)'
                  : 'var(--muted-foreground)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent-foreground)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                }
              }}
            >
              <Icon size={14} weight={isActive ? 'fill' : 'regular'} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
