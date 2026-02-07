import { cn } from '@nxus/ui'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { useState, useRef, useEffect } from 'react'

export interface SidebarIconProps {
  /** Phosphor icon component to render */
  icon: PhosphorIcon
  /** Tooltip text shown on hover */
  tooltip: string
  /** Whether this icon is currently active */
  isActive?: boolean
  /** Click handler */
  onClick?: () => void
  /** Additional class names */
  className?: string
}

/**
 * SidebarIcon - Individual icon button with tooltip for the sidebar
 *
 * Features:
 * - Phosphor icon rendering
 * - Active state styling with indicator bar
 * - Hover tooltip positioned to the right
 * - Smooth transitions
 */
export function SidebarIcon({
  icon: Icon,
  tooltip,
  isActive = false,
  onClick,
  className,
}: SidebarIconProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculate tooltip position when showing
  useEffect(() => {
    if (showTooltip && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setTooltipPosition({
        top: rect.top + rect.height / 2,
      })
    }
  }, [showTooltip])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleMouseEnter = () => {
    // Small delay before showing tooltip
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true)
    }, 200)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setShowTooltip(false)
  }

  return (
    <div className="relative">
      {/* Active indicator bar */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-200',
          isActive
            ? 'bg-primary opacity-100'
            : 'bg-transparent opacity-0'
        )}
      />

      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'relative flex items-center justify-center w-12 h-12 mx-auto rounded-xl transition-all duration-200',
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          className
        )}
        aria-label={tooltip}
      >
        <Icon
          weight={isActive ? 'fill' : 'regular'}
          className="size-6"
        />
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="fixed left-16 z-50 px-3 py-1.5 text-sm font-medium bg-popover text-popover-foreground rounded-lg shadow-lg border border-border whitespace-nowrap animate-in fade-in-0 slide-in-from-left-2 duration-200"
          style={{
            top: tooltipPosition.top,
            transform: 'translateY(-50%)',
          }}
        >
          {tooltip}
          {/* Arrow pointing left */}
          <div className="absolute left-0 top-1/2 -translate-x-1.5 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[6px] border-r-popover" />
        </div>
      )}
    </div>
  )
}
