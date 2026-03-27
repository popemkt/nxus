import { useEffect } from 'react'

/**
 * Manages scrollbar visibility by adding/removing data-scrolling attribute.
 * Works with the auto-hiding scrollbar CSS in design-system.css.
 */
export function ScrollbarManager() {
  useEffect(() => {
    let timeout: NodeJS.Timeout

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (!target || !target.setAttribute) return

      const element = target === document ? document.documentElement : target

      element.setAttribute('data-scrolling', 'true')

      clearTimeout(timeout)
      timeout = setTimeout(() => {
        element.removeAttribute('data-scrolling')
      }, 1000) // Hide after 1 second of inactivity
    }

    // Use capture to catch scroll events from all elements
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      clearTimeout(timeout)
    }
  }, [])

  return null
}
