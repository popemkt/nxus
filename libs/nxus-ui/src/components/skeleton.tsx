import * as React from 'react'
import { cn } from '../lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show the skeleton pulse animation */
  animate?: boolean
}

/**
 * A skeleton placeholder for loading content
 *
 * @example
 * // Basic usage
 * <Skeleton className="h-4 w-32" />
 *
 * // Card skeleton
 * <div className="space-y-2">
 *   <Skeleton className="h-4 w-3/4" />
 *   <Skeleton className="h-4 w-1/2" />
 * </div>
 */
export function Skeleton({
  animate = true,
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-muted',
        animate && 'animate-pulse',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Skeleton variants for common use cases
 */
export function SkeletonText({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} {...props} />
}

export function SkeletonBadge({ className, ...props }: SkeletonProps) {
  return (
    <Skeleton className={cn('h-5 w-16 rounded-full', className)} {...props} />
  )
}

export function SkeletonIcon({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('h-5 w-5 rounded', className)} {...props} />
}

export function SkeletonButton({ className, ...props }: SkeletonProps) {
  return (
    <Skeleton className={cn('h-9 w-24 rounded-md', className)} {...props} />
  )
}
