import { useState, useEffect, useRef } from 'react'

/**
 * Hook to delay showing a loading indicator
 *
 * This prevents flicker for fast operations by only showing
 * the loading state after a threshold has passed.
 *
 * @param isLoading - The actual loading state
 * @param delay - Delay in ms before showing loading (default: 150ms)
 * @returns Whether to show the loading indicator
 *
 * @example
 * const { isLoading } = useQuery(...)
 * const showLoading = useDelayedLoading(isLoading, 200)
 *
 * return (
 *   <>
 *     {showLoading && <LoadingSpinner />}
 *     {!isLoading && <Content />}
 *   </>
 * )
 */
export function useDelayedLoading(isLoading: boolean, delay = 150): boolean {
  const [showLoading, setShowLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isLoading) {
      // Start timer to show loading
      timeoutRef.current = setTimeout(() => {
        setShowLoading(true)
      }, delay)
    } else {
      // Clear timer and hide loading immediately when done
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setShowLoading(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isLoading, delay])

  return showLoading
}

/**
 * Hook to delay showing loading and ensure minimum display time
 *
 * This prevents loading indicators from appearing/disappearing too quickly,
 * which can feel jarring. Once shown, the indicator stays for at least
 * the minimum duration.
 *
 * @param isLoading - The actual loading state
 * @param options - Configuration options
 * @returns Whether to show the loading indicator
 *
 * @example
 * const showLoading = useSmartLoading(isLoading, {
 *   delay: 150,      // Wait 150ms before showing
 *   minDuration: 300 // Show for at least 300ms once visible
 * })
 */
export function useSmartLoading(
  isLoading: boolean,
  options: { delay?: number; minDuration?: number } = {},
): boolean {
  const { delay = 150, minDuration = 300 } = options
  const [showLoading, setShowLoading] = useState(false)
  const showTimeRef = useRef<number | null>(null)
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    if (isLoading) {
      // Start delay timer
      delayTimeoutRef.current = setTimeout(() => {
        setShowLoading(true)
        showTimeRef.current = Date.now()
      }, delay)
    } else {
      // Clear delay timer
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current)
        delayTimeoutRef.current = null
      }

      // If loading indicator is visible, ensure minimum duration
      if (showLoading && showTimeRef.current) {
        const elapsed = Date.now() - showTimeRef.current
        const remaining = minDuration - elapsed

        if (remaining > 0) {
          minDurationTimeoutRef.current = setTimeout(() => {
            setShowLoading(false)
            showTimeRef.current = null
          }, remaining)
        } else {
          setShowLoading(false)
          showTimeRef.current = null
        }
      }
    }

    return () => {
      if (delayTimeoutRef.current) clearTimeout(delayTimeoutRef.current)
      if (minDurationTimeoutRef.current)
        clearTimeout(minDurationTimeoutRef.current)
    }
  }, [isLoading, delay, minDuration, showLoading])

  return showLoading
}
