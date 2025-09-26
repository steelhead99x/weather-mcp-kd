import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getWeatherAgentId, getDisplayHost } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk } from '../types/streamVNext'

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
 * Tool display component with collapsible interface
 */
const ToolCallDisplay = memo(({ toolCall }: { toolCall: ToolCallDebug }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'called': return '⏳'
      case 'result': return '✅'
      case 'error': return '❌'
      default: return '🔧'
    }
  }

  const formatToolData = (data: unknown): string => {
    if (data === null || data === undefined) return 'N/A'
    if (typeof data === 'string') return data
    if (typeof data === 'number' || typeof data === 'boolean') return String(data)
    
    try {
      return JSON.stringify(data, null, 2)
    } catch (error) {
      return '[Could not serialize data]'
    }
  }

  return (
    <div className="border border-gray-200 rounded-md mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-2 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span>{getStatusIcon(toolCall.status)}</span>
          <span className="font-medium text-sm">{toolCall.toolName}</span>
          <span className="text-xs text-gray-500">({toolCall.status})</span>
        </div>
        <span className="text-xs text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-3 border-t border-gray-200 bg-white">
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Arguments:</div>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                {formatToolData(toolCall.args)}
              </pre>
            </div>
          )}
          
          {toolCall.result !== undefined && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Result:</div>
              <pre className="text-xs bg-green-50 p-2 rounded overflow-x-auto border border-green-200">
                {formatToolData(toolCall.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

ToolCallDisplay.displayName = 'ToolCallDisplay'

/**
 * Memoized message component to prevent unnecessary re-renders
 * @param message - The message to display
 */
const MessageComponent = memo(({ message }: { message: Message }) => {
  const [toolsExpanded, setToolsExpanded] = useState(false)
  
  return (
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
        
        {/* Enhanced Tool Calls Debug Info */}
        {message.debugInfo?.toolCalls && message.debugInfo.toolCalls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors mb-2"
            >
              <span>🔧</span>
              <span>
                Used {message.debugInfo.toolCalls.length} tool{message.debugInfo.toolCalls.length > 1 ? 's' : ''}
              </span>
              <span className="text-gray-400">
                {toolsExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {toolsExpanded && (
              <div className="mt-2 space-y-2">
                {message.debugInfo.toolCalls.map((toolCall) => (
                  <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

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

  const [agent, setAgent] = useState<WeatherAgent | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)

  // Load agent asynchronously
  useEffect(() => {
    const loadAgent = async () => {
      try {
        const agentId = getWeatherAgentId()
        const loadedAgent = await mastra.getAgent(agentId)
        setAgent(loadedAgent as WeatherAgent)
        setAgentError(null)
      } catch (error) {
        let errorMessage: string
        
        if (error instanceof Error) {
          errorMessage = error.message
        } else if (error && typeof error === 'object') {
          // Handle object errors properly
          if ('message' in error && typeof error.message === 'string') {
            errorMessage = error.message
          } else if ('code' in error || 'status' in error) {
            // Try to create a meaningful message from object properties
            errorMessage = JSON.stringify(error)
          } else {
            errorMessage = 'Unknown error object'
          }
        } else {
          errorMessage = String(error) || 'Unknown error'
        }
        
        setAgentError(`Failed to load weather agent: ${errorMessage}`)
        setAgent(null)
      }
    }
    
    loadAgent()
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
      {(streamState.error || agentError) && (
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
            <span>
              {agentError || (typeof streamState.error === 'string' ? streamState.error : String(streamState.error || 'Unknown error'))}
            </span>
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
          disabled={!agent || streamState.isLoading || !input.trim() || (!hasAssistantResponded && !/^\d{5}$/.test(input.trim()))}
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
