/**
 * calendar-error-boundary.tsx - Error boundary for the calendar
 *
 * Provides graceful error handling for the calendar component,
 * displaying a user-friendly error message instead of crashing.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@nxus/ui'
import { cn } from '@nxus/ui'

// ============================================================================
// Types
// ============================================================================

export interface CalendarErrorBoundaryProps {
  /** Children to render */
  children: ReactNode

  /** Custom fallback component */
  fallback?: ReactNode

  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void

  /** Callback when retry is clicked */
  onRetry?: () => void

  /** Custom class name */
  className?: string
}

interface CalendarErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

// ============================================================================
// Icons
// ============================================================================

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Error boundary component for the calendar.
 *
 * Catches JavaScript errors anywhere in the calendar component tree,
 * logs them, and displays a fallback UI instead of crashing.
 *
 * @example
 * ```tsx
 * <CalendarErrorBoundary onRetry={() => refetch()}>
 *   <CalendarContainer {...props} />
 * </CalendarErrorBoundary>
 * ```
 */
export class CalendarErrorBoundary extends Component<
  CalendarErrorBoundaryProps,
  CalendarErrorBoundaryState
> {
  constructor(props: CalendarErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<CalendarErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error
    console.error('Calendar Error:', error, errorInfo)

    // Update state with error info
    this.setState({ errorInfo })

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })

    // Call the onRetry callback if provided
    this.props.onRetry?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback is provided, render it
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div
          className={cn(
            'flex min-h-[400px] items-center justify-center rounded-lg border border-border bg-card p-8',
            this.props.className
          )}
        >
          <div className="flex max-w-md flex-col items-center text-center">
            <AlertTriangleIcon className="mb-4 size-12 text-destructive" />

            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Something went wrong
            </h3>

            <p className="mb-4 text-sm text-muted-foreground">
              An error occurred while displaying the calendar. Please try again.
            </p>

            {/* Error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 w-full text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Show error details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <Button onClick={this.handleRetry} className="gap-2">
              <RefreshIcon className="size-4" />
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================================
// Functional Wrapper (for hooks support)
// ============================================================================

export interface CalendarErrorFallbackProps {
  /** Error that was caught */
  error: Error

  /** Reset the error state */
  resetError: () => void

  /** Custom class name */
  className?: string
}

/**
 * Default error fallback component.
 * Can be used with react-error-boundary or similar libraries.
 */
export function CalendarErrorFallback({
  error,
  resetError,
  className,
}: CalendarErrorFallbackProps) {
  return (
    <div
      className={cn(
        'flex min-h-[400px] items-center justify-center rounded-lg border border-border bg-card p-8',
        className
      )}
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <AlertTriangleIcon className="mb-4 size-12 text-destructive" />

        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Something went wrong
        </h3>

        <p className="mb-4 text-sm text-muted-foreground">
          An error occurred while displaying the calendar. Please try again.
        </p>

        {/* Error details in development */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-4 w-full text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Show error details
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
              {error.message}
              {error.stack && (
                <>
                  {'\n\nStack trace:\n'}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}

        <Button onClick={resetError} className="gap-2">
          <RefreshIcon className="size-4" />
          Try Again
        </Button>
      </div>
    </div>
  )
}
