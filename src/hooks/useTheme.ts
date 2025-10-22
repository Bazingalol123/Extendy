import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // Load theme from storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['theme'], (result) => {
        if (result.theme) {
          setTheme(result.theme)
          document.documentElement.setAttribute('data-theme', result.theme)
        }
      })
    }
  }, [])

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ theme: newTheme })
    }
  }

  return { theme, toggleTheme }
}