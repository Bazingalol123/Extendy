import React from 'react'

interface AnimatedBackgroundProps {
  variant?: 'vortex' | 'subtle' | 'none'
  className?: string
}

/**
 * AnimatedBackground Component
 * 
 * Renders an animated gradient background effect for empty states.
 * In dark mode, creates a mesmerizing vortex effect with rotating gradients.
 * In light mode, displays a subtle static gradient.
 * 
 * @param variant - Type of animation: 'vortex' (animated), 'subtle' (static), 'none' (transparent)
 * @param className - Additional CSS classes
 */
export default function AnimatedBackground({ 
  variant = 'vortex',
  className = '' 
}: AnimatedBackgroundProps) {
  if (variant === 'none') {
    return null
  }

  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {variant === 'vortex' && (
        <div className="animated-vortex" />
      )}
      
      {variant === 'subtle' && (
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.05) 0%, transparent 70%)'
          }}
        />
      )}
    </div>
  )
}