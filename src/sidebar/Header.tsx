import React from 'react'
import { SettingsIcon } from '../components/Icons'

interface HeaderProps {
  title?: string
  onOpenSettings: () => void
  onMenuClick?: () => void
  onInfoClick?: () => void
  onNewChatClick?: () => void
  className?: string
}

/**
 * Enhanced Header Component - Reference Design Style
 * 
 * Matches the professional Claude-style header with:
 * - Clean title with status indicator dot
 * - Action buttons in a row (menu, info, add, settings)
 * - Dark background with subtle borders
 * - Smooth hover states
 */
export default function Header({ 
  title = 'Assistant',
  onOpenSettings,
  onMenuClick,
  onInfoClick,
  onNewChatClick,
  className = ''
}: HeaderProps) {
  return (
    <header className={`
      flex items-center justify-between
      px-4 py-3
      bg-gray-900
      border-b border-gray-800
      ${className}
    `}>
      {/* Left: Title with Status Indicator */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse" />
        <h1 className="text-base font-medium text-white">
          {title}
        </h1>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-1">
        {/* Menu Button */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
            title="Menu"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {/* Info Button */}
        {onInfoClick && (
          <button
            onClick={onInfoClick}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
            title="Info"
            aria-label="Show information"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        )}

        {/* New Chat / Add Button */}
        {onNewChatClick && (
          <button
            onClick={onNewChatClick}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
            title="New Chat"
            aria-label="Start new chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        )}

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
          title="Settings"
          aria-label="Open settings"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}