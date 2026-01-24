import * as React from 'react'
import { cn } from '../lib/utils'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the spinner */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Whether to show the spinner - can be used with delayed loading */
  show?: boolean
}

const sizeClasses = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-6 w-6 border-2',
}

/**
 * A subtle, animated loading spinner
 *
 * @example
 * // Basic usage
 * <LoadingSpinner size="sm" />
 *
 * // With delayed visibility (use with useDelayedLoading hook)
 * <LoadingSpinner show={showLoading} />
 */
export function LoadingSpinner({
  size = 'sm',
  show = true,
  className,
  ...props
}: LoadingSpinnerProps) {
  if (!show) return null

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-primary/30 border-t-primary',
        sizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Loading"
      {...props}
    />
  )
}

interface LoadingDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the dots */
  size?: 'xs' | 'sm' | 'md'
}

const dotSizeClasses = {
  xs: 'h-1 w-1',
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
}

/**
 * Animated three-dot loading indicator
 * Good for inline loading states
 */
export function LoadingDots({
  size = 'sm',
  className,
  ...props
}: LoadingDotsProps) {
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="status"
      aria-label="Loading"
      {...props}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-full bg-primary/60 animate-loading-dot',
            dotSizeClasses[size],
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
