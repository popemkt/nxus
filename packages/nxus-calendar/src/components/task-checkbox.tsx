/**
 * task-checkbox.tsx - Inline checkbox component for tasks in the calendar
 *
 * A compact checkbox that can be clicked without triggering the parent event.
 * Shows loading state during updates and handles click propagation properly.
 */

import { useCallback, useState } from 'react'
import { cn } from '@nxus/ui'

// ============================================================================
// Types
// ============================================================================

export interface TaskCheckboxProps {
  /** Whether the task is completed */
  checked: boolean

  /** Called when the checkbox is clicked */
  onToggle: (completed: boolean) => Promise<void> | void

  /** Whether the checkbox is disabled */
  disabled?: boolean

  /** Additional CSS classes */
  className?: string

  /** Size variant */
  size?: 'sm' | 'default'
}

// ============================================================================
// Component
// ============================================================================

/**
 * Compact checkbox for marking tasks complete in the calendar.
 *
 * Features:
 * - Stops click propagation to prevent opening event modal
 * - Shows loading state during async toggle
 * - Keyboard accessible
 *
 * @example
 * ```tsx
 * <TaskCheckbox
 *   checked={event.isCompleted}
 *   onToggle={(completed) => completeTask({ nodeId: event.id, completed })}
 * />
 * ```
 */
export function TaskCheckbox({
  checked,
  onToggle,
  disabled = false,
  className,
  size = 'default',
}: TaskCheckboxProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      // Prevent the click from bubbling to the event block
      e.stopPropagation()
      e.preventDefault()

      if (disabled || isLoading) return

      setIsLoading(true)
      try {
        await onToggle(!checked)
      } finally {
        setIsLoading(false)
      }
    },
    [checked, onToggle, disabled, isLoading]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation()
        e.preventDefault()

        if (!disabled && !isLoading) {
          setIsLoading(true)
          Promise.resolve(onToggle(!checked)).finally(() => setIsLoading(false))
        }
      }
    },
    [checked, onToggle, disabled, isLoading]
  )

  const sizeClasses = size === 'sm' ? 'size-3' : 'size-3.5'

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || isLoading}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || isLoading}
      className={cn(
        // Base styles
        'task-checkbox inline-flex shrink-0 items-center justify-center',
        'rounded-sm border-[1.5px] border-current',
        'transition-all duration-100',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50',
        // Size
        sizeClasses,
        // States
        !disabled && !isLoading && 'cursor-pointer hover:bg-white/20',
        (disabled || isLoading) && 'cursor-not-allowed opacity-50',
        // Loading animation
        isLoading && 'animate-pulse',
        className
      )}
      data-checked={checked}
      data-loading={isLoading}
    >
      {checked && !isLoading && (
        <svg
          className={cn(size === 'sm' ? 'size-2' : 'size-2.5')}
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 3L4.5 8.5L2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {isLoading && (
        <svg
          className={cn('animate-spin', size === 'sm' ? 'size-2' : 'size-2.5')}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
    </button>
  )
}
