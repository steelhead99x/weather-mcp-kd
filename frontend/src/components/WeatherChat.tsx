import React, { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getWeatherAgentId, getDisplayHost } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk, StreamMetrics } from '../types/streamVNext'

/**
 * Enhanced WeatherChat Component with improved streamVNext implementation
 * 
 * Features:
 * - Better error handling and retry logic
 * - Performance metrics and monitoring
 * - Improved TypeScript types
 * - Enhanced user experience with loading states
 * - Tool call visualization
 * - Memoized components for performance
 * - Real-time validation feedback
 */

/**
 * Represents a chat message with metadata
 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  debugInfo?: DebugInfo
}

/**
 * Debug information for tool calls
 */
interface ToolCallDebug {
  id: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: 'called' | 'result'
}

/**
 * Debug information attached to messages
 */
interface DebugInfo {
  toolCalls: ToolCallDebug[]
}

/**
 * Weather agent interface for type safety
 */
interface WeatherAgent {
  streamVNext: (message: string, options?: Record<string, unknown>) => Promise<{
    textStream?: AsyncIterable<string>
    fullStream?: AsyncIterable<StreamChunk>
  }>
}

/**
 * Memoized message component to prevent unnecessary re-renders
 * @param message - The message to display
 */
const MessageComponent = memo(({ message }: { message: Message }) => (
  <div className={message.role === 'user' ? 'text-right' : 'text-left'}>
    <div
      className="inline-block px-3 py-2 rounded-2xl max-w-full break-words border"
      style={{
        background: message.role === 'user' 
          ? 'var(--accent-muted)' 
          : 'var(--overlay)',
        borderColor: message.role === 'user' 
          ? 'var(--accent)' 
          : 'var(--border)',
        color: 'var(--fg)'
      }}
    >
      <span className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
        {message.content}
      </span>
      
      {/* Tool Calls Debug Info */}
      {message.debugInfo?.toolCalls && message.debugInfo.toolCalls.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            🔧 Used {message.debugInfo.toolCalls.length} tool{message.debugInfo.toolCalls.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  </div>
))

MessageComponent.displayName = 'MessageComponent'


/**
 * Main WeatherChat component for farmer-friendly weather assistance
 * 
 * This component provides a chat interface for weather-related queries,
 * with enhanced error handling, performance optimizations, and user feedback.
 * 
 * @returns JSX element representing the weather chat interface
 */
export default function WeatherChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasAssistantResponded, setHasAssistantResponded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Enhanced streamVNext hook with better error handling and metrics
  const { state: streamState, streamVNext, retry } = useStreamVNext({
    onChunk: (chunk: StreamChunk) => {
      if (chunk.type === 'text' && chunk.content) {
        setMessages((prev) => {
          const assistantId = prev[prev.length - 1]?.id
          return prev.map((m) => 
            m.id === assistantId ? { ...m, content: m.content + chunk.content } : m
          )
        })
        setHasAssistantResponded(true)
      } else if (chunk.type === 'tool_call') {
        // Handle tool calls
        setMessages((prev) => {
          const assistantId = prev[prev.length - 1]?.id
          return prev.map((m) => {
            if (m.id === assistantId) {
              const debugInfo: DebugInfo = {
                toolCalls: [...(m.debugInfo?.toolCalls || []), {
                  id: chunk.toolName || `tool-${Date.now()}`,
                  toolName: chunk.toolName || 'unknown',
                  args: chunk.toolArgs || {},
                  status: 'called'
                }]
              }
              return { ...m, debugInfo }
            }
            return m
          })
        })
      } else if (chunk.type === 'tool_result') {
        // Handle tool results
        setMessages((prev) => {
          const assistantId = prev[prev.length - 1]?.id
          return prev.map((m) => {
            if (m.id === assistantId && m.debugInfo?.toolCalls) {
              const updatedToolCalls = m.debugInfo.toolCalls.map((tc) => 
                tc.toolName === chunk.toolName ? { ...tc, result: chunk.toolResult, status: 'result' as const } : tc
              )
              return { ...m, debugInfo: { ...m.debugInfo, toolCalls: updatedToolCalls } }
            }
            return m
          })
        })
      }
    },
    onComplete: () => {
      setHasAssistantResponded(true)
    },
    onError: () => {
      // Error handling is managed by the useStreamVNext hook
    },
    maxRetries: 3,
    timeout: 30000,
    enableMetrics: true
  })

  const agent = useMemo((): WeatherAgent | null => {
    try {
      const agentId = getWeatherAgentId()
      return mastra.getAgent(agentId) as WeatherAgent
    } catch (e) {
      return null
    }
  }, [])

  /**
   * Scrolls the chat container to the bottom
   */
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])


  /**
   * Handles sending a message to the weather agent
   * Validates ZIP code format for first message, then allows any text
   */
  const onSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !agent) return

    // First message must be a 5-digit US ZIP code. After the assistant responds once, allow any text.
    if (!hasAssistantResponded && !/^\d{5}$/.test(trimmed)) {
      return
    }

    setHasAssistantResponded(false)

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    }

    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')

    const threadId = `thread-${Date.now()}`
    const resourceId = `resource-${Date.now()}`

    const systemPrompt = `You are WeatherAgent, a farmer-friendly weather assistant. Turn forecasts into practical agricultural guidance: planting windows, irrigation timing, pest and disease pressure, frost and heat stress, spray conditions, field access, hay curing, and livestock comfort. Reference the user's location, season, and crop or operation when possible. Keep answers concise, actionable, and safety-minded. If the user provides only a ZIP code, greet them and summarize the next 7 days highlighting risks and opportunities. This service is built and powered mainly by solar energy—mention sustainability benefits only when it genuinely helps the decision.`

    try {
      await streamVNext(agent, userMsg.content, {
        format: 'mastra',
        system: systemPrompt,
        memory: {
          thread: threadId,
          resource: resourceId,
        },
        timeout: 30000,
        retries: 3
      })
    } catch (error) {
      // Error handling is managed by the useStreamVNext hook
    }
  }, [input, agent, streamVNext, hasAssistantResponded])


  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌾</span>
        <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
          Farmer-friendly, solar-powered weather insights for planting, irrigation, and livestock decisions.
        </p>
      </div>

      {/* Enhanced Status Display */}
      {streamState.metrics && (
        <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
          {streamState.isStreaming && (
            <span>Streaming... ({streamState.metrics.chunksReceived} chunks, {streamState.metrics.bytesReceived} bytes)</span>
          )}
          {streamState.retryCount > 0 && (
            <span>Retrying... ({streamState.retryCount}/3)</span>
          )}
        </div>
      )}

      <div
        aria-label="Chat messages"
        aria-live="polite"
        className="max-h-[45vh] overflow-y-auto rounded-xl border p-4"
        role="log"
        style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}
        ref={scrollRef}
      >
        <div className="space-y-3">
          {messages.map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
        </div>
      </div>

      {/* Enhanced Error Display */}
      {streamState.error && (
        <div
          aria-live="assertive"
          className="text-sm p-3 rounded-lg border"
          id="error-message"
          role="alert"
          style={{ 
            color: 'var(--error)',
            backgroundColor: 'var(--error-muted)',
            borderColor: 'var(--error)'
          }}
        >
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{streamState.error}</span>
          </div>
          {streamState.retryCount > 0 && (
            <button
              onClick={retry}
              className="mt-2 px-3 py-1 text-xs bg-red-100 hover:bg-red-200 rounded border border-red-300 transition-colors"
            >
              Retry ({streamState.retryCount}/3)
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <input
            aria-describedby="error-message zip-help"
            aria-label="Enter your 5-digit ZIP code"
            autoComplete="postal-code"
            className={`input w-full ${!hasAssistantResponded && input && !/^\d{5}$/.test(input) ? 'border-red-300' : ''}`}
            inputMode="numeric"
            pattern="\\d{5}"
            placeholder={hasAssistantResponded ? "Ask about weather..." : "Enter your 5-digit ZIP code"}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            disabled={streamState.isLoading}
          />
          {!hasAssistantResponded && input && !/^\d{5}$/.test(input) && (
            <div id="zip-help" className="text-xs text-red-600 mt-1">
              Please enter a valid 5-digit ZIP code
            </div>
          )}
        </div>
        <button
          aria-label="Send message"
          className="btn whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSend}
          disabled={streamState.isLoading || !input.trim() || (!hasAssistantResponded && !/^\d{5}$/.test(input.trim()))}
        >
          {streamState.isLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Sending...
            </span>
          ) : (
            'Ask'
          )}
        </button>
      </div>

      <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
        Connected to agent: <code style={{ color: 'var(--fg)' }}>weather</code> at{' '}
        <code style={{ color: 'var(--fg)' }}>{getDisplayHost()}</code>
      </div>

      {/* Debug Panel */}
      {streamState.metrics && (
        <details className="text-xs">
          <summary className="cursor-pointer">📊 Stream Metrics</summary>
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <div>Duration: {streamState.metrics.endTime ? streamState.metrics.endTime - streamState.metrics.startTime : 'N/A'}ms</div>
            <div>Chunks: {streamState.metrics.chunksReceived}</div>
            <div>Bytes: {streamState.metrics.bytesReceived}</div>
            <div>Errors: {streamState.metrics.errors}</div>
            <div>Retries: {streamState.metrics.retries}</div>
          </div>
        </details>
      )}
    </div>
  )
}
