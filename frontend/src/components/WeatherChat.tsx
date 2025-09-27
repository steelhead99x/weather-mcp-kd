import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getWeatherAgentId, getDisplayHost } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk } from '../types/streamVNext'
import MuxSignedPlayer from './MuxSignedPlayer'
import { useMuxAnalytics } from '../contexts/MuxAnalyticsContext'

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
  timestamp?: Date
  duration?: number
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

  const formatToolResult = (data: unknown): string => {
    if (data === null || data === undefined) return 'N/A'
    
    // Handle string results - add line breaks for better readability
    if (typeof data === 'string') {
      return data
        .replace(/\n\n/g, '\n\n') // Preserve existing double line breaks
        .replace(/\n/g, '\n') // Preserve single line breaks
        .trim()
    }
    
    // Handle object results - try to extract meaningful text
    if (typeof data === 'object') {
      // Try to extract text content from common properties
      if ('content' in data && typeof data.content === 'string') {
        return data.content
      } else if ('text' in data && typeof data.text === 'string') {
        return data.text
      } else if ('message' in data && typeof data.message === 'string') {
        return data.message
      } else if ('summary' in data && typeof data.summary === 'string') {
        return data.summary
      } else if ('summaryText' in data && typeof data.summaryText === 'string') {
        return data.summaryText
      } else if ('result' in data && typeof data.result === 'string') {
        return data.result
      }
      
      // For complex objects, format as JSON with proper indentation
      try {
        return JSON.stringify(data, null, 2)
      } catch (error) {
        return '[Could not serialize data]'
      }
    }
    
    return String(data)
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
              <div className="text-xs bg-green-50 p-3 rounded border border-green-200 whitespace-pre-wrap">
                {formatToolResult(toolCall.result)}
              </div>
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
  
  // Function to detect and extract Mux video URLs
  const detectMuxVideo = (content: string) => {
    const muxUrlPattern = /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g
    const matches = content.match(muxUrlPattern)
    return matches ? matches[0] : null
  }
  
  // Function to render content with URL detection
  const renderContent = (content: string) => {
    // Check for Mux video URL
    const muxVideoUrl = detectMuxVideo(content)
    
    if (muxVideoUrl) {
      // Extract assetId from URL
      const url = new URL(muxVideoUrl)
      const assetId = url.searchParams.get('assetId')
      
      if (assetId) {
        // Remove the video URL from the text content
        const textContent = content.replace(muxVideoUrl, '').trim()
        
        return (
          <div className="space-y-3">
            {/* Render text content first */}
            {textContent && (
              <span className="whitespace-pre-wrap leading-relaxed text-sm md:text-base block">
                {textContent}
              </span>
            )}
            {/* Then render the video player */}
            <div className="mt-3 border-t border-gray-200 pt-3">
              <MuxSignedPlayer 
                assetId={assetId}
                className="w-full max-w-lg mx-auto rounded-lg overflow-hidden"
              />
              <div className="text-xs text-gray-500 text-center mt-2">
                📹 Video: {muxVideoUrl}
              </div>
            </div>
          </div>
        )
      }
    }
    
    // Check for iframe content
    if (content.includes('<iframe')) {
      return (
        <div 
          className="whitespace-pre-wrap leading-relaxed text-sm md:text-base"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    }
    
    // Regular text content
    return (
      <span className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
        {content}
      </span>
    )
  }
  
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
        {renderContent(message.content)}
        
        {/* Enhanced Tool Calls Debug Info */}
        {message.debugInfo?.toolCalls && message.debugInfo.toolCalls.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors mb-3 w-full text-left"
            >
              <span className="text-lg">🔧</span>
              <span className="font-medium">
                Tool Results ({message.debugInfo.toolCalls.length})
              </span>
              <span className="text-gray-400 ml-auto">
                {toolsExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {toolsExpanded && (
              <div className="space-y-3">
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
  // Optional Mux analytics - only use if provider is available
  let muxAnalytics: any[] = []
  try {
    const { getAllAnalytics } = useMuxAnalytics()
    muxAnalytics = getAllAnalytics()
  } catch (error) {
    // MuxAnalyticsProvider not available, continue without analytics
    muxAnalytics = []
  }

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
        const toolCallId = chunk.toolName || `tool-${Date.now()}`
        const toolCallStartTime = Date.now()
        
        setMessages((prev) => {
          const assistantId = prev[prev.length - 1]?.id
          return prev.map((m) => {
            if (m.id === assistantId) {
              const debugInfo: DebugInfo = {
                toolCalls: [...(m.debugInfo?.toolCalls || []), {
                  id: toolCallId,
                  toolName: chunk.toolName || 'unknown',
                  args: chunk.toolArgs || {},
                  status: 'called',
                  timestamp: new Date(toolCallStartTime)
                }]
              }
              return { ...m, debugInfo }
            }
            return m
          })
        })
        
        // Also notify MCP Debug Panel if available
        if (typeof window !== 'undefined' && (window as any).mcpDebugPanel) {
          (window as any).mcpDebugPanel.addToolCall(
            chunk.toolName || 'unknown',
            'called',
            chunk.toolArgs
          )
        }
      } else if (chunk.type === 'tool_result') {
        // Handle tool results - store in debug info, don't add to main content
        const toolResultTime = Date.now()
        
        setMessages((prev) => {
          const assistantId = prev[prev.length - 1]?.id
          return prev.map((m) => {
            if (m.id === assistantId) {
              // Update tool call status with result and calculate duration
              const updatedToolCalls = m.debugInfo?.toolCalls?.map((tc) => {
                if (tc.toolName === chunk.toolName) {
                  const duration = tc.timestamp ? toolResultTime - tc.timestamp.getTime() : undefined
                  return { 
                    ...tc, 
                    result: chunk.toolResult, 
                    status: 'result' as const,
                    duration
                  }
                }
                return tc
              }) || []
              
              return { 
                ...m, 
                debugInfo: { ...m.debugInfo, toolCalls: updatedToolCalls }
              }
            }
            return m
          })
        })
        
        // Also notify MCP Debug Panel if available
        if (typeof window !== 'undefined' && (window as any).mcpDebugPanel) {
          // Calculate duration for debug panel
          const toolCall = messages[messages.length - 1]?.debugInfo?.toolCalls?.find(tc => tc.toolName === chunk.toolName)
          const duration: number | undefined = toolCall?.timestamp ? toolResultTime - toolCall.timestamp.getTime() : undefined
          
          const mcpDebugPanel = (window as any).mcpDebugPanel
          if (mcpDebugPanel && typeof mcpDebugPanel.addToolCall === 'function') {
            mcpDebugPanel.addToolCall(
              chunk.toolName || 'unknown',
              'result',
              undefined,
              chunk.toolResult,
              undefined,
              duration
            )
          }
        }
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

  // Load agent asynchronously with retry logic
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 1000

    const loadAgent = async () => {
      try {
        const agentId = getWeatherAgentId()
        const loadedAgent = await mastra.getAgent(agentId)
        setAgent(loadedAgent as WeatherAgent)
        setAgentError(null)
        retryCount = 0 // Reset retry count on success
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
        
        // Retry logic for network errors
        if (retryCount < maxRetries && (
          errorMessage.includes('network') || 
          errorMessage.includes('fetch') || 
          errorMessage.includes('timeout')
        )) {
          retryCount++
          console.warn(`[WeatherChat] Agent load failed, retrying ${retryCount}/${maxRetries}:`, errorMessage)
          setTimeout(loadAgent, retryDelay * retryCount)
          return
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

  // Auto-scroll when messages change (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollToBottom()
    }, 100)
    return () => clearTimeout(timeoutId)
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
            <div className="flex items-center gap-2">
              <span className="animate-pulse">🌾</span>
              <span>Gathering weather data from satellites and weather stations...</span>
            </div>
          )}
          {streamState.retryCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="animate-spin">🔄</span>
              <span>Connection interrupted, reconnecting to weather services... ({streamState.retryCount}/3)</span>
            </div>
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
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="mb-4">
                <span className="text-4xl">🌾</span>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--fg)' }}>
                Welcome to WeatherAgent
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--fg-subtle)' }}>
                Get detailed weather forecasts tailored for farming decisions. Enter your ZIP code below to start.
              </p>
              <div className="rounded-lg p-4 mb-4" style={{ 
                backgroundColor: 'var(--accent-muted)', 
                borderColor: 'var(--accent)',
                border: '1px solid'
              }}>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--accent)' }}>
                  What you'll get:
                </p>
                <ul className="text-xs space-y-1 text-left" style={{ color: 'var(--fg-subtle)' }}>
                  <li>• 7-day weather forecast with agricultural insights</li>
                  <li>• Planting and irrigation recommendations</li>
                  <li>• Pest and disease pressure alerts</li>
                  <li>• Frost and heat stress warnings</li>
                  <li>• Field access and spray condition updates</li>
                </ul>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageComponent key={message.id} message={message} />
            ))
          )}
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
            aria-label="Enter your 5-digit ZIP code for weather forecast"
            autoComplete="postal-code"
            className={`input w-full ${!hasAssistantResponded && input && !/^\d{5}$/.test(input) ? 'border-red-300' : ''}`}
            inputMode="numeric"
            pattern="\\d{5}"
            placeholder={hasAssistantResponded ? "Ask about weather..." : "Enter your ZIP code for detailed weather forecast..."}
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
          aria-label={hasAssistantResponded ? "Send message" : "Get forecast"}
          className="btn whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSend}
          disabled={!agent || streamState.isLoading || !input.trim() || (!hasAssistantResponded && !/^\d{5}$/.test(input.trim()))}
        >
          {streamState.isLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Please wait one moment...
            </span>
          ) : (
            hasAssistantResponded ? 'Ask' : 'Get Forecast'
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
          <summary className="cursor-pointer hover:text-gray-700 transition-colors">
            🔧 Technical Details
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-3">
              {/* Stream Metrics */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800 border-b border-gray-300 pb-1">Weather Data Stream</h4>
                <div className="flex justify-between">
                  <span className="text-gray-600">Response Time:</span>
                  <span className="font-mono">
                    {streamState.metrics.endTime 
                      ? `${((streamState.metrics.endTime - streamState.metrics.startTime) / 1000).toFixed(1)}s`
                      : 'In progress...'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data Sources:</span>
                  <span className="font-mono">{streamState.metrics.chunksReceived} weather stations</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data Size:</span>
                  <span className="font-mono">
                    {streamState.metrics.bytesReceived > 1024 
                      ? `${(streamState.metrics.bytesReceived / 1024).toFixed(1)}KB`
                      : `${streamState.metrics.bytesReceived}B`
                    }
                  </span>
                </div>
                {streamState.metrics.errors > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Connection Issues:</span>
                    <span className="font-mono">{streamState.metrics.errors}</span>
                  </div>
                )}
                {streamState.metrics.retries > 0 && (
                  <div className="flex justify-between text-yellow-600">
                    <span>Reconnection Attempts:</span>
                    <span className="font-mono">{streamState.metrics.retries}</span>
                  </div>
                )}
              </div>

              {/* Mux Video Analytics */}
              {(() => {
                const hasVideoAnalytics = muxAnalytics.length > 0
                
                if (!hasVideoAnalytics) return null
                
                return (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-gray-800 border-b border-gray-300 pb-1">Video Analytics</h4>
                    {muxAnalytics.map((analytics, index) => (
                      <div key={analytics.assetId || index} className="space-y-1 pl-2 border-l-2 border-blue-200">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Asset ID:</span>
                          <span className="font-mono text-xs">{analytics.assetId?.substring(0, 8)}...</span>
                        </div>
                        {analytics.videoDuration && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Duration:</span>
                            <span className="font-mono">{Math.round(analytics.videoDuration)}s</span>
                          </div>
                        )}
                        {analytics.currentTime !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Current Time:</span>
                            <span className="font-mono">{Math.round(analytics.currentTime)}s</span>
                          </div>
                        )}
                        {analytics.completionRate > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Completion:</span>
                            <span className="font-mono">{analytics.completionRate.toFixed(1)}%</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600">Play Events:</span>
                          <span className="font-mono">{analytics.playEvents}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pause Events:</span>
                          <span className="font-mono">{analytics.pauseEvents}</span>
                        </div>
                        {analytics.bufferingEvents > 0 && (
                          <div className="flex justify-between text-yellow-600">
                            <span>Buffering Events:</span>
                            <span className="font-mono">{analytics.bufferingEvents}</span>
                          </div>
                        )}
                        {analytics.seekingEvents > 0 && (
                          <div className="flex justify-between text-blue-600">
                            <span>Seek Events:</span>
                            <span className="font-mono">{analytics.seekingEvents}</span>
                          </div>
                        )}
                        {analytics.errorEvents > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Video Errors:</span>
                            <span className="font-mono">{analytics.errorEvents}</span>
                          </div>
                        )}
                        {analytics.lastEventTime && (
                          <div className="flex justify-between text-gray-500">
                            <span>Last Activity:</span>
                            <span className="font-mono text-xs">
                              {analytics.lastEventTime.toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
