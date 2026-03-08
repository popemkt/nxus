import { useState, useRef, useEffect, useCallback } from 'react'

export function useSessionTimer(active: boolean) {
  const sessionStartRef = useRef<number | null>(null)
  const cardStartRef = useRef<number>(Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!active) return
    if (!sessionStartRef.current) {
      sessionStartRef.current = Date.now()
    }

    const interval = setInterval(() => {
      setElapsedMs(Date.now() - (sessionStartRef.current ?? Date.now()))
    }, 1000)

    return () => clearInterval(interval)
  }, [active])

  const resetCardTimer = useCallback(() => {
    cardStartRef.current = Date.now()
  }, [])

  const getCardElapsedMs = useCallback(() => {
    return Date.now() - cardStartRef.current
  }, [])

  return { elapsedMs, resetCardTimer, getCardElapsedMs }
}
