import { SquaresFour, Cube, Terminal, Planet } from '@phosphor-icons/react'

export type VisualStyle = 'default' | 'glass-3d' | 'terminal' | 'orbital'

const STORAGE_KEY = 'nxus-gateway-visual'

const visuals: { id: VisualStyle; label: string; icon: typeof SquaresFour }[] = [
  { id: 'default', label: 'Default', icon: SquaresFour },
  { id: 'glass-3d', label: 'Glass 3D', icon: Cube },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'orbital', label: 'Orbital', icon: Planet },
]

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
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border bg-card/80 p-1 shadow-lg backdrop-blur-md">
      {visuals.map((v) => {
        const Icon = v.icon
        const isActive = current === v.id
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            title={v.label}
            className={`flex size-8 items-center justify-center rounded-full transition-all duration-200 ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Icon size={16} weight={isActive ? 'fill' : 'regular'} />
          </button>
        )
      })}
    </div>
  )
}
