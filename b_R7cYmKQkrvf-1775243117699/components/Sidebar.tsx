'use client'

import { useState } from 'react'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 border-r border-border bg-secondary flex-col">
        {/* Logo Section */}
        <div className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-foreground">Cherrt</span>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-4">
          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-muted-foreground mb-3 px-2">
              Recent
            </h3>
            <div className="space-y-2">
              {[
                'Design system review',
                'API integration help',
                'Database optimization',
              ].map((chat, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
                >
                  <button className="flex-1 text-left text-sm text-foreground truncate hover:no-underline">
                    {chat}
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-destructive transition-opacity hover:text-destructive/80 text-lg leading-none pb-0.5"
                    aria-label={`Delete ${chat}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-border p-4 space-y-2">
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-3">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {isOpen && (
        <aside className="fixed inset-y-0 left-0 w-64 border-r border-border bg-secondary flex flex-col z-50 lg:hidden">
          {/* Logo Section */}
          <div className="h-16 border-b border-border flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold text-sm">
                C
              </div>
              <span className="font-semibold text-foreground">Cherrt</span>
            </div>
            <button
              onClick={onToggle}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New chat
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto px-4">
            <div className="mb-6">
              <h3 className="text-xs uppercase font-semibold text-muted-foreground mb-3 px-2">
                Recent
              </h3>
              <div className="space-y-2">
                {[
                  'Design system review',
                  'API integration help',
                  'Database optimization',
                ].map((chat, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-foreground truncate"
                  >
                    {chat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="border-t border-border p-4 space-y-2">
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Settings
            </button>
          </div>
        </aside>
      )}
    </>
  )
}
