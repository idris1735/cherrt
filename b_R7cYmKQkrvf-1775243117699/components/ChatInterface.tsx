'use client'

import { useState, useEffect } from 'react'
import AnimatedGreeting from './AnimatedGreeting'

export default function ChatInterface() {
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (input.trim()) {
      // Handle sending message
      setInput('')
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Animated Greeting */}
          <AnimatedGreeting />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-background px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-3">
            <div className="flex-1 flex gap-2 bg-input rounded-lg px-4 py-3 border border-border focus-within:border-primary transition-colors">
              <input
                type="text"
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              />
              <button className="p-1 hover:text-primary transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 19V5m8 14V5M4 9h16M4 15h16" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.40337462,22.99 3.50612381,23.1 4.13003136,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13003136,1.16151496 C3.34915502,0.9 2.40337462,0.9 1.77946707,1.4370192 C0.994600742,2.0605983 0.837631574,2.99 1.15159189,3.77547692 L3.03521743,10.2164699 C3.03521743,10.3735673 3.19218622,10.5306646 3.50612381,10.5306646 L16.6915026,11.3161515 C16.6915026,11.3161515 17.1624089,11.3161515 17.1624089,11.8533188 C17.1624089,12.4744748 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Chertt can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  )
}
