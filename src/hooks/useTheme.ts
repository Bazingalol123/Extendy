import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // Load theme from storage on mount
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['theme'], (result) => {
        const savedTheme = (result.theme || 'light') as Theme
        console.log('🎨 [useTheme] Loading theme from storage:', savedTheme)
        setTheme(savedTheme)
        applyTheme(savedTheme)
      })

      // Listen for storage changes from other pages (sidebar/options sync)
      const handleStorageChange = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
      ) => {
        if (areaName === 'local' && changes.theme) {
          const newTheme = changes.theme.newValue as Theme
          console.log('🎨 [useTheme] Theme changed in storage:', newTheme)
          setTheme(newTheme)
          applyTheme(newTheme)
        }
      }

      chrome.storage.onChanged.addListener(handleStorageChange)

      // Cleanup listener on unmount
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange)
      }
    } else {
      // Dev mode - check localStorage
      const savedTheme = (localStorage.getItem('theme') || 'light') as Theme
      console.log('🎨 [useTheme] Dev mode - Loading theme:', savedTheme)
      setTheme(savedTheme)
      applyTheme(savedTheme)
    }
  }, [])

  const applyTheme = (newTheme: Theme) => {
    console.log('🎨 [useTheme] Applying theme:', newTheme)
    
    // Set data-theme attribute (for CSS variables)
    document.documentElement.setAttribute('data-theme', newTheme)
    console.log('  ✓ Set data-theme attribute to:', newTheme)
    
    // Add/remove 'dark' class for Tailwind (CRITICAL!)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
      document.body.classList.add('dark')
      console.log('  ✓ Added dark class to html and body')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.classList.remove('dark')
      console.log('  ✓ Removed dark class from html and body')
    }

    // Debug: Log current classes
    console.log('  📋 HTML classes:', document.documentElement.className)
    console.log('  📋 Body classes:', document.body.className)
  }

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light'
    console.log('🎨 [useTheme] Toggling theme from', theme, 'to', newTheme)
    
    setTheme(newTheme)
    applyTheme(newTheme)
    
    // Save to storage (this will trigger the listener in other pages)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ theme: newTheme }, () => {
        console.log('  ✓ Theme saved to chrome.storage:', newTheme)
      })
    } else {
      // Dev mode fallback
      localStorage.setItem('theme', newTheme)
      console.log('  ✓ Theme saved to localStorage:', newTheme)
    }
  }

  return { theme, toggleTheme }
}