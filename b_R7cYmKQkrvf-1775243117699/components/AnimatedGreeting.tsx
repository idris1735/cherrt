'use client'

import { useState, useEffect } from 'react'

const greetings = [
  'What\'re you doing today?',
  'You can do anything...',
  'Let\'s create something amazing',
  'Ask me anything',
]

export default function AnimatedGreeting() {
  const [currentText, setCurrentText] = useState('')
  const [greetingIndex, setGreetingIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(true)

  useEffect(() => {
    const greeting = greetings[greetingIndex]
    let charIndex = 0
    let timeout: NodeJS.Timeout

    if (isAnimating) {
      const animate = () => {
        if (charIndex <= greeting.length) {
          setCurrentText(greeting.slice(0, charIndex))
          charIndex++
          timeout = setTimeout(animate, 50)
        } else {
          setIsAnimating(false)
        }
      }

      animate()
      return () => clearTimeout(timeout)
    } else {
      // Pause before switching to next greeting
      timeout = setTimeout(() => {
        setGreetingIndex((prev) => (prev + 1) % greetings.length)
        setCurrentText('')
        setIsAnimating(true)
      }, 3000)

      return () => clearTimeout(timeout)
    }
  }, [greetingIndex, isAnimating])

  return (
    <div className="text-center">
      {/* Orange Accent Circle */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full w-20 h-20"></div>
          <div className="relative w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold">
            ✨
          </div>
        </div>
      </div>

      {/* Animated Text */}
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 min-h-20 flex items-center justify-center">
        <span className="inline-block">
          {currentText}
          <span className="animate-pulse">|</span>
        </span>
      </h1>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-12">
        {[
          {
            icon: '📝',
            title: 'Write',
            description: 'Help with writing',
          },
          {
            icon: '💡',
            title: 'Create',
            description: 'Generate ideas',
          },
          {
            icon: '🔍',
            title: 'Analyze',
            description: 'Understand content',
          },
          {
            icon: '⚡',
            title: 'Code',
            description: 'Programming help',
          },
        ].map((suggestion, i) => (
          <button
            key={i}
            className="bg-secondary hover:bg-muted border border-border rounded-lg p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{suggestion.icon}</span>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {suggestion.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {suggestion.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
