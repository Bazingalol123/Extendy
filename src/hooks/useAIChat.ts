import { useState, useCallback } from 'react'
import { createAIProvider } from '../providers/aiProvider'

export interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
  isStreaming?: boolean
}

export function useAIChat(provider: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)

  const sendMessage = useCallback(async (text: string, useStreaming: boolean = true) => {
    if (!apiKey) {
      console.error('No API key provided')
      return
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const ai = createAIProvider(provider, apiKey)

      if (useStreaming) {
        // Create placeholder for streaming message
        const assistantId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantId,
          sender: 'assistant',
          text: '',
          timestamp: new Date(),
          isStreaming: true
        }
        setMessages(prev => [...prev, assistantMessage])
        setStreamingMessageId(assistantId)

        // Stream response
        let fullText = ''
        await ai.streamReply(text, (chunk) => {
          fullText += chunk
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantId 
                ? { ...msg, text: fullText, isStreaming: true }
                : msg
            )
          )
        })

        // Mark streaming as complete
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId
              ? { ...msg, isStreaming: false }
              : msg
          )
        )
        setStreamingMessageId(null)
      } else {
        // Non-streaming response
        const response = await ai.reply(text)
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: response,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('AI error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [provider, apiKey])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    streamingMessageId,
    sendMessage,
    clearMessages
  }
}