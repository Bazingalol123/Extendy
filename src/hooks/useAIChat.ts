import { useState, useCallback } from 'react'
import { createAIProvider } from '../providers/aiProvider'

export interface Message {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: Date
  isStreaming?: boolean
}

/**
 * AI Chat Hook - Unified hook for all AI providers
 * @param provider - Provider name ('openai', 'anthropic', 'ollama', 'mock')
 * @param apiKey - API key or endpoint URL
 */
export function useAIChat(provider: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)

  const sendMessage = useCallback(async (text: string, useStreaming = true) => {
    if (!text.trim()) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: text.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const aiProvider = createAIProvider(provider, apiKey)
      const aiMessageId = (Date.now() + 1).toString()

      if (useStreaming) {
        // Create streaming message placeholder
        const aiMessage: Message = {
          id: aiMessageId,
          sender: 'ai',
          text: '',
          timestamp: new Date(),
          isStreaming: true
        }
        setMessages(prev => [...prev, aiMessage])
        setStreamingMessageId(aiMessageId)

        // Stream the response
        await aiProvider.streamReply(text, (chunk) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === aiMessageId
                ? { ...msg, text: msg.text + chunk }
                : msg
            )
          )
        })

        // Mark streaming as complete
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, isStreaming: false }
              : msg
          )
        )
        setStreamingMessageId(null)
      } else {
        // Non-streaming response
        const response = await aiProvider.reply(text)
        const aiMessage: Message = {
          id: aiMessageId,
          sender: 'ai',
          text: response,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiMessage])
      }
    } catch (error) {
      console.error('AI error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: 'Sorry, I encountered an error. Please check your API key and try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      setStreamingMessageId(null)
    } finally {
      setIsLoading(false)
    }
  }, [provider, apiKey])

  const clearMessages = useCallback(() => {
    setMessages([])
    setStreamingMessageId(null)
  }, [])

  return {
    messages,
    isLoading,
    streamingMessageId,
    sendMessage,
    clearMessages
  }
}