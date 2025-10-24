import { useState, useRef, useEffect } from 'react'
import { createAIProvider } from '../providers/aiProvider'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function SidebarApp() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStreamText, setCurrentStreamText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get provider from storage
  const [provider, setProvider] = useState<ReturnType<typeof createAIProvider> | null>(null)

  useEffect(() => {
    // Load provider from chrome.storage
    chrome.storage.local.get(['selectedProvider', 'apiKey'], (result) => {
      if (result.apiKey && result.selectedProvider) {
        const aiProvider = createAIProvider(result.selectedProvider, result.apiKey)
        setProvider(aiProvider)
      }
    })
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  const handleSend = async () => {
    if (!input.trim() || !provider || isStreaming) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)
    setCurrentStreamText('')

    try {
      // Stream the response
      await provider.streamReply(input, (chunk) => {
        setCurrentStreamText(prev => prev + chunk)
      })

      // Once complete, add to messages
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: currentStreamText
      }])
      setCurrentStreamText('')
    } catch (error) {
      console.error('Streaming error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Error: Failed to get response'
      }])
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 shadow-lg">
        <h1 className="text-xl font-bold">⚡ Extendy</h1>
        <p className="text-sm opacity-90">AI Extension Builder</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {isStreaming && currentStreamText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow">
              {currentStreamText}
              <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask AI to build an extension..."
            disabled={isStreaming}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                     disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isStreaming ? '⏳' : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}