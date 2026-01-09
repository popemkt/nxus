import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme.store'
import { themeOptions, darkThemes, lightThemes } from '@/config/theme-options'

/**
 * Theme chooser component - displays a grid of available themes
 */
export function ThemeChooser() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div className="space-y-6">
      {/* Dark Themes */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Dark Themes
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {darkThemes.map((option) => {
            const Icon = option.Icon
            const isActive = theme === option.value

            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
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

      {/* Light Themes */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Light Themes
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {lightThemes.map((option) => {
            const Icon = option.Icon
            const isActive = theme === option.value

            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
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
