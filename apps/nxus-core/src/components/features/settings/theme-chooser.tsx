import { cn } from '@nxus/ui'
import { Moon, Sun } from '@phosphor-icons/react'
import { useThemeStore } from '@/stores/theme.store'
import { themeOptions } from '@/config/theme-options'

/**
 * Theme chooser component - displays a grid of available theme palettes
 * and a toggle for dark/light color mode.
 */
export function ThemeChooser() {
  const palette = useThemeStore((s) => s.palette)
  const setPalette = useThemeStore((s) => s.setPalette)
  const colorMode = useThemeStore((s) => s.colorMode)
  const setColorMode = useThemeStore((s) => s.setColorMode)

  return (
    <div className="space-y-6">
      {/* Color Mode Toggle */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Color Mode
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setColorMode('light')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 radius-card transition-all',
              'bg-card/80 backdrop-blur-md border',
              colorMode === 'light'
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-foreground/10 hover:border-foreground/20',
            )}
          >
            <Sun className="size-4" weight="fill" />
            <span className="text-sm font-medium">Light</span>
          </button>
          <button
            onClick={() => setColorMode('dark')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 radius-card transition-all',
              'bg-card/80 backdrop-blur-md border',
              colorMode === 'dark'
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-foreground/10 hover:border-foreground/20',
            )}
          >
            <Moon className="size-4" weight="fill" />
            <span className="text-sm font-medium">Dark</span>
          </button>
        </div>
      </div>

      {/* Theme Palettes */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Color Palette
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {themeOptions.map((option) => {
            const Icon = option.Icon
            const isActive = palette === option.value

            return (
              <button
                key={option.value}
                onClick={() => setPalette(option.value)}
                className={cn(
                  'flex items-center gap-3 p-3 radius-card',
                  'bg-card/80 backdrop-blur-md border transition-all',
                  isActive
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-foreground/10 hover:border-foreground/20',
                )}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${option.color}20` }}
                >
                  <Icon className="size-4" style={{ color: option.color }} />
                </div>
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
