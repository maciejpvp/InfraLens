import { useLayoutEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const storageKey = 'laytrace-theme'

function readTheme(): Theme | undefined {
  try {
    return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark'
  } catch {
    // Browsers can block storage for offline reports.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readTheme() ?? 'dark')

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useLayoutEffect(() => {
    function restoreTheme(event: PageTransitionEvent) {
      if (!event.persisted) return
      const saved = readTheme()
      if (saved) setTheme(saved)
    }

    window.addEventListener('pageshow', restoreTheme)
    return () => window.removeEventListener('pageshow', restoreTheme)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // The theme still applies while this report is open.
    }
  }

  return { theme, toggleTheme }
}
