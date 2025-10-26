import { useState, useEffect, useCallback } from 'react'
import { SettingsIcon, MoonIcon, SunIcon } from '../components/Icons'
import ChatBoxWithAI from '../components/ChatBoxWithAI'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_PROVIDER } from '../config/providers'
import { fileSystem, on as fsOn, initializeFromStorage } from '../services/fileSystem'

export default function SidebarApp() {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const { theme, toggleTheme } = useTheme()

  // Initialize virtual FS from storage (idempotent)
  useEffect(() => {
    initializeFromStorage()
  }, [])

  // Active project quick-view (kept minimal; switching handled in ProjectToolbar)
  const [activeName, setActiveName] = useState<string | null>(() => {
    const id = fileSystem.getActiveProjectId()
    if (!id) return null
    const p = fileSystem.getProjectList().find(x => x.id === id)
    return p?.name ?? null
  })

  useEffect(() => {
    const sync = () => {
      const id = fileSystem.getActiveProjectId()
      if (!id) { setActiveName(null); return }
      const p = fileSystem.getProjectList().find(x => x.id === id)
      setActiveName(p?.name ?? null)
    }
    // initial sync
    sync()
    // subscribe to active/list changes
    const offActive = fsOn('project:activeChanged', () => sync())
    const offList = fsOn('project:listChanged', () => sync())
    return () => {
      offActive?.()
      offList?.()
    }
  }, [])

  /** Create a starter project via "New Chat" and activate it. Name pattern: "Project N". */
  const handleNewProject = useCallback(() => {
    const base = 'Project'
    let max = 0
    for (const p of fileSystem.getProjectList()) {
      const m = /^Project(?:\s+(\d+))?$/.exec(p.name.trim())
      if (m) {
        const n = m[1] ? parseInt(m[1], 10) : 1
        if (!Number.isNaN(n) && n > max) max = n
      }
    }
    const name = `${base} ${max + 1}`
    const id = fileSystem.createProject(name, true)
    if (id) fileSystem.setActiveProject(id)
  }, [])

  // Load provider from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['provider'], (res) => {
      if (res?.provider) setProvider(res.provider)
    })

    // Listen for provider changes from settings page
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes.provider) {
        setProvider(changes.provider.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    // Cleanup listener on unmount
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const handleProviderChange = (p: string) => {
    setProvider(p)
    chrome.storage.local.set({ provider: p })
  }

  const openSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage()
    } else {
      // Dev mode fallback
      window.open('/options.html', '_blank')
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-white dark:bg-gray-950">
      {/* HEADER */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 dark:from-cyan-600 dark:to-blue-600 flex items-center justify-center text-lg flex-shrink-0">
              🤖
            </div>
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Extendy
            </span>
            {activeName && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                — {activeName}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <MoonIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <SunIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            <button
              onClick={handleNewProject}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="New Chat"
            >
              <span className="w-4 h-4 text-gray-600 dark:text-gray-400">＋</span>
            </button>
            <button
              onClick={openSettings}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Open Settings"
            >
              <SettingsIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
        <ChatBoxWithAI 
          currentProvider={provider}
          onProviderChange={handleProviderChange}
        />
      </main>
    </div>
  )
}