import React from 'react'
import AnimatedBackground from './AnimatedBackground'
import StatusIndicator from './StatusIndicator'
import QuickActionButton from './QuickActionsButton'
import { SparklesIcon } from './Icons'

interface QuickAction {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  prompt: string
}

interface EmptyStateWithActionsProps {
  onQuickAction: (prompt: string) => void
  providerName?: string
  isConfigured?: boolean
  onOpenSettings?: () => void
  className?: string
}

const defaultQuickActions: QuickAction[] = [
  {
    id: 'summarize',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
    label: 'Summarize This Page',
    description: 'Get a quick summary of the current webpage',
    prompt: 'Please summarize the key points from this page.'
  },
  {
    id: 'explain',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    label: 'Explain This',
    description: 'Get a detailed explanation of complex topics',
    prompt: 'Can you explain this in simple terms?'
  },
  {
    id: 'improve',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    label: 'Improve My Writing',
    description: 'Get suggestions to enhance your text',
    prompt: 'How can I improve this writing?'
  }
]

/**
 * EmptyStateWithActions Component
 * 
 * Beautiful welcome screen shown when chat is empty.
 * Features:
 * - Animated gradient background (dark mode)
 * - Status indicator showing AI readiness
 * - Quick action buttons for common tasks
 * - Responsive layout
 * 
 * @param onQuickAction - Callback when a quick action is clicked (receives prompt text)
 * @param providerName - Name of current AI provider
 * @param isConfigured - Whether the AI is configured and ready
 * @param onOpenSettings - Callback to open settings (when not configured)
 * @param className - Additional CSS classes
 */
export default function EmptyStateWithActions({
  onQuickAction,
  providerName = 'AI Assistant',
  isConfigured = true,
  onOpenSettings,
  className = ''
}: EmptyStateWithActionsProps) {
  return (
    <div className={`relative flex flex-col items-center justify-center h-full px-6 py-8 ${className}`}>
      {/* Animated Background (Dark Mode Only) */}
      <AnimatedBackground variant="vortex" />
      
      {/* Content */}
      <div className="relative z-10 max-w-2xl w-full text-center space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 dark:from-cyan-600 dark:to-blue-600 shadow-strong mb-2">
            <SparklesIcon className="w-10 h-10 text-white" />
          </div>
          
          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">
            {isConfigured ? 'AI Assistant Ready' : 'Welcome to Extendy'}
          </h1>
          
          {/* Status Indicator */}
          {isConfigured && (
            <div className="flex items-center justify-center">
              <StatusIndicator 
                status="ready" 
                label={`${providerName} is ready to help`}
                showLabel={true}
              />
            </div>
          )}
          
          {/* Subtitle */}
          <p className="text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {isConfigured 
              ? 'Start a conversation or choose a quick action below to get started'
              : 'Configure your AI provider to start chatting'
            }
          </p>
        </div>
        
        {/* Quick Actions or Settings Prompt */}
        {isConfigured ? (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-4">
              Quick Actions
            </div>
            {defaultQuickActions.map((action) => (
              <QuickActionButton
                key={action.id}
                icon={action.icon}
                label={action.label}
                description={action.description}
                onClick={() => onQuickAction(action.prompt)}
                variant={action.id === 'summarize' ? 'primary' : 'secondary'}
              />
            ))}
          </div>
        ) : (
          <div className="pt-4">
            <button
              onClick={onOpenSettings}
              className="save-button inline-flex items-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Open Settings
            </button>
          </div>
        )}
        
        {/* Footer Hint */}
        <div className="pt-8 text-xs text-gray-500 dark:text-gray-600">
          💡 Tip: You can also just start typing to begin a conversation
        </div>
      </div>
    </div>
  )
}