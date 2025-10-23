import React from 'react'

interface QuickActionButtonProps {
  icon?: React.ReactNode
  label: string
  description?: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  className?: string
}

/**
 * QuickActionButton Component
 * 
 * A prominent action button with icon, label, and optional description.
 * Features gradient background, hover effects, and ripple animation.
 * Perfect for empty state quick actions.
 * 
 * @param icon - Icon component to display
 * @param label - Main button text
 * @param description - Optional subtitle/description
 * @param onClick - Click handler function
 * @param variant - Style variant: 'primary' (gradient) or 'secondary' (outlined)
 * @param disabled - Whether button is disabled
 * @param className - Additional CSS classes
 */
export default function QuickActionButton({ 
  icon,
  label,
  description,
  onClick,
  variant = 'primary',
  disabled = false,
  className = '' 
}: QuickActionButtonProps) {
  const isPrimary = variant === 'primary'
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        quick-action-btn
        w-full
        px-6 py-4
        rounded-xl
        text-left
        transition-all duration-300
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isPrimary 
          ? 'bg-gradient-to-r from-blue-600 to-purple-600 dark:from-cyan-600 dark:to-blue-600 text-white shadow-soft hover:shadow-medium' 
          : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-blue-500 dark:hover:border-cyan-500'
        }
        ${className}
      `}
    >
      <div className="flex items-start gap-4 relative z-10">
        {/* Icon */}
        {icon && (
          <div className={`
            flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
            ${isPrimary 
              ? 'bg-white/20 text-white' 
              : 'bg-blue-50 dark:bg-cyan-900/30 text-blue-600 dark:text-cyan-400'
            }
          `}>
            {icon}
          </div>
        )}
        
        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <div className={`
            font-semibold text-base mb-1
            ${isPrimary ? 'text-white' : 'text-gray-900 dark:text-gray-100'}
          `}>
            {label}
          </div>
          
          {description && (
            <div className={`
              text-sm leading-relaxed
              ${isPrimary 
                ? 'text-white/90' 
                : 'text-gray-600 dark:text-gray-400'
              }
            `}>
              {description}
            </div>
          )}
        </div>
        
        {/* Arrow Icon */}
        <div className={`
          flex-shrink-0
          ${isPrimary ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}
        `}>
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    </button>
  )
}