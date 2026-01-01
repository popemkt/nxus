import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Button } from './ui/button'

// Apply theme immediately to prevent flash
function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (storedTheme) return storedTheme

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

// Apply theme to DOM immediately
if (typeof window !== 'undefined') {
  const initialTheme = getInitialTheme()
  const root = window.document.documentElement
  if (initialTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)

  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-full"
    >
      {theme === 'light' ? (
        <MoonIcon className="h-5 w-5" />
      ) : (
        <SunIcon className="h-5 w-5" />
      )}
    </Button>
  )
}
