import React from 'react'

interface StatusIndicatorProps {
  status?: 'ready' | 'thinking' | 'offline' | 'error'
  label?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const statusConfig = {
  ready: {
    color: 'bg-green-500',
    darkColor: 'dark:bg-emerald-400',
    label: 'Ready',
    animate: true
  },
  thinking: {
    color: 'bg-blue-500',
    darkColor: 'dark:bg-cyan-400',
    label: 'Thinking...',
    animate: true
  },
  offline: {
    color: 'bg-gray-400',
    darkColor: 'dark:bg-gray-500',
    label: 'Offline',
    animate: false
  },
  error: {
    color: 'bg-red-500',
    darkColor: 'dark:bg-red-400',
    label: 'Error',
    animate: false
  }
}

const sizeConfig = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3'
}

/**
 * StatusIndicator Component
 * 
 * Displays a colored dot with optional label showing the current status.
 * Animates with a pulse effect when active.
 * 
 * @param status - Current status: 'ready', 'thinking', 'offline', 'error'
 * @param label - Custom label text (overrides default)
 * @param showLabel - Whether to show the status label text
 * @param size - Size of the indicator dot
 * @param className - Additional CSS classes
 */
export default function StatusIndicator({ 
  status = 'ready',
  label,
  showLabel = true,
  size = 'md',
  className = '' 
}: StatusIndicatorProps) {
  const config = statusConfig[status]
  const displayLabel = label || config.label
  
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Status Dot */}
      <span 
        className={`
          ${sizeConfig[size]}
          ${config.color}
          ${config.darkColor}
          rounded-full
          ${config.animate ? 'status-indicator' : ''}
        `}
        aria-label={`Status: ${displayLabel}`}
      />
      
      {/* Status Label */}
      {showLabel && (
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {displayLabel}
        </span>
      )}
    </div>
  )
}