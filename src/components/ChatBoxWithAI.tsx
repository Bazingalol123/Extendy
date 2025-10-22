import { useState, useRef, useEffect } from 'react'
import { SendIcon, TrashIcon, SparklesIcon } from './Icons'
import { useAIChat, Message } from '../hooks/useAIChat'
import { AVAILABLE_PROVIDERS, getProviderDisplayName } from '../config/providers'

interface ChatBoxWithAIProps {
  currentProvider: string
  onProviderChange: (provider: string) => void
}

export default function ChatBoxWithAI({ currentProvider, onProviderChange }: ChatBoxWithAIProps) {
  const [input, setInput] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [useStreaming, setUseStreaming] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load API key from storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['token'], (res) => setApiKey(res.token || ''))
    }
  }, [])

  // Use the AI chat hook with streaming support
  const { messages, isLoading, streamingMessageId, sendMessage, clearMessages } = useAIChat(
    currentProvider,
    apiKey
  )

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(scrollToBottom, [messages])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return
    const text = input.trim()
    setInput('')
    await sendMessage(text, useStreaming)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* CHAT HEADER - Minimal & Clean */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">AI Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-1 focus:ring-blue-500"
            />
            <span>Stream</span>
          </label>
          <button
            onClick={clearMessages}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Clear chat"
          >
            <TrashIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 dark:bg-gray-950">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
              <SparklesIcon className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Ready to assist
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs mb-6">
              Ask me anything or let me help you with your tasks
            </p>

            <div className="grid gap-2 w-full max-w-md">
              {[
                { text: "What can you help me with?", icon: "💡" },
                { text: "Write a haiku about coding", icon: "✍️" },
                { text: "Help me be more productive", icon: "⚡" }
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(suggestion.text)
                    inputRef.current?.focus()
                  }}
                  className="text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 transition-all text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="mr-2">{suggestion.icon}</span>
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg: Message) => (
          <div key={msg.id} className={`flex gap-3 mb-4 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm ${
              msg.sender === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
            }`}>
              {msg.sender === 'user' ? '👤' : '🤖'}
            </div>
            <div className={`flex-1 max-w-[75%] ${msg.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-800'
              }`}>
                {msg.text}
                {msg.isStreaming && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse"></span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 px-1">
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && messages.length > 0 && !streamingMessageId && (
          <div className="flex gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm shadow-sm">
              🤖
            </div>
            <div className="flex items-center gap-1 px-4 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA - Modern Design */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 resize-none px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            rows={1}
            disabled={isLoading}
            style={{ 
              minHeight: '44px',
              maxHeight: '120px'
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all active:scale-95 disabled:active:scale-100"
            title="Send message"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <SendIcon className="w-5 h-5" />
            )}
          </button>
        </div>
        
        {/* AI Model Selector - Below Input */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-2">
            <label htmlFor="model-select" className="text-xs text-gray-500 dark:text-gray-500">
              Model:
            </label>
            <select
              id="model-select"
              value={currentProvider}
              onChange={(e) => onProviderChange(e.target.value)}
              className="text-xs px-2 py-1 bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {AVAILABLE_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {getProviderDisplayName(p)}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-600">
            Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono text-xs">Enter</kbd> to send
          </span>
        </div>
      </div>
    </div>
  )
}