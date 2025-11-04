import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { mastra, getWeatherAgentId, getDisplayHost } from '../lib/mastraClient'
import { useStreamVNext } from '../hooks/useStreamVNext'
import type { StreamChunk } from '../types/streamVNext'
import MuxSignedPlayer from './MuxSignedPlayer'
import { useMuxAnalytics } from '../contexts/MuxAnalyticsContext'
import { useTypewriter } from '../hooks/useTypewriter'
import { FormattedMessage } from './FormattedMessage'
import { StatusIndicator, TypingIndicator } from './StatusIndicator'

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
    <div className="border rounded-md mb-1 tool-call-container" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-2 hover:opacity-80 transition-opacity flex items-center justify-between group tool-call-expand"
        style={{ backgroundColor: 'var(--overlay)' }}
      >
        <div className="flex items-center gap-2">
          <span className="group-hover:scale-110 transition-transform">{getStatusIcon(toolCall.status)}</span>
          <span className="font-medium text-xs" style={{ color: 'var(--fg)' }}>{toolCall.toolName}</span>
          <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>({toolCall.status})</span>
          {toolCall.duration && (
            <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
              {toolCall.duration < 1000 ? `${toolCall.duration}ms` : `${(toolCall.duration / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        <span className="text-xs group-hover:opacity-70 transition-opacity" style={{ color: 'var(--fg-subtle)' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-2 border-t" style={{ 
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-elev)'
        }}>
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--fg)' }}>Arguments:</div>
              <pre className="text-xs p-2 rounded overflow-x-auto max-h-32" style={{ 
                backgroundColor: 'var(--overlay)',
                color: 'var(--fg)'
              }}>
                {formatToolData(toolCall.args)}
              </pre>
            </div>
          )}
          
          {toolCall.result !== undefined && (
            <div className="mb-2">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--fg)' }}>Result:</div>
              <div className="text-xs tool-call-result whitespace-pre-wrap" style={{ color: 'var(--fg)' }}>
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
const MessageComponent = memo(({ message, isLatest }: { message: Message; isLatest?: boolean }) => {
  const [toolsExpanded, setToolsExpanded] = useState(false)

  // Apply typewriter effect only to the latest assistant message
  const shouldAnimate = isLatest && message.role === 'assistant' && message.content.length > 0
  const { displayedText, isTyping, skip } = useTypewriter(
    message.content,
    {
      speed: 30, // Slower, more readable speed (33 chars/second)
      skipAnimation: !shouldAnimate,
    }
  )

  const contentToDisplay = shouldAnimate ? displayedText : message.content
  
  // Function to detect and extract Mux video URLs
  const detectMuxVideo = (content: string) => {
    const muxUrlPattern = /https:\/\/streamingportfolio\.com\/player\?assetId=([a-zA-Z0-9]+)/g
    const matches = content.match(muxUrlPattern)
    return matches ? matches[0] : null
  }

  // Function to detect and extract image URLs
  const detectImages = (content: string) => {
    // Pattern for markdown images: ![alt text](url)
    const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
    const markdownMatches = Array.from(content.matchAll(markdownImagePattern))
    
    // Pattern for direct image URLs (common image extensions)
    const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s]*)?/gi
    const urlMatches = Array.from(content.matchAll(imageUrlPattern))
    
    const images = []
    
    // Process markdown images
    for (const match of markdownMatches) {
      images.push({
        type: 'markdown',
        alt: match[1] || '',
        url: match[2],
        fullMatch: match[0]
      })
    }
    
    // Process direct URL images (avoid duplicates from markdown)
    for (const match of urlMatches) {
      const url = match[0]
      const isAlreadyInMarkdown = images.some(img => img.url === url)
      if (!isAlreadyInMarkdown) {
        images.push({
          type: 'url',
          alt: '',
          url: url,
          fullMatch: url
        })
      }
    }
    
    return images
  }
  
  // Function to format text content for better readability
  const formatTextContent = (text: string) => {
    return text
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Handle multiple consecutive line breaks
      .replace(/\n{3,}/g, '\n\n')
      // Clean up extra spaces
      .replace(/[ \t]+/g, ' ')
      .trim()
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
              <FormattedMessage content={textContent} className="animate-fade-in" />
            )}
            {/* Then render the video player */}
            <div className="mt-3 border-t pt-3 animate-slide-up" style={{ borderColor: 'var(--border)' }}>
              <MuxSignedPlayer
                assetId={assetId}
                className="w-full max-w-lg mx-auto rounded-lg overflow-hidden shadow-soft"
              />
              <div className="text-xs text-center mt-2" style={{ color: 'var(--fg-subtle)' }}>
                📹 Video: {muxVideoUrl}
              </div>
            </div>
          </div>
        )
      }
    }
    
    // Check for images
    const images = detectImages(content)

    if (images.length > 0) {
      // Remove image references from text content
      let textContent = content
      images.forEach(img => {
        textContent = textContent.replace(img.fullMatch, '').trim()
      })

      return (
        <div className="space-y-3">
          {/* Render text content first */}
          {textContent && (
            <FormattedMessage content={textContent} className="animate-fade-in" />
          )}
          {/* Then render the images */}
          <div className="space-y-3">
            {images.map((img, index) => (
              <div key={index} className="border-t pt-3 animate-slide-up" style={{ borderColor: 'var(--border)' }}>
                <img
                  src={img.url}
                  alt={img.alt || 'Image'}
                  className="w-full max-w-lg mx-auto rounded-lg shadow-soft transition-transform hover:scale-[1.02]"
                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                  onError={(e) => {
                    // Fallback for broken images
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const fallbackDiv = document.createElement('div')
                    fallbackDiv.className = 'w-full max-w-lg mx-auto rounded-lg bg-gray-100 flex items-center justify-center p-8 text-gray-500 text-sm'
                    fallbackDiv.textContent = `🖼️ Image failed to load: ${img.url}`
                    target.parentNode?.insertBefore(fallbackDiv, target.nextSibling)
                  }}
                />
                {img.alt && (
                  <div className="text-xs text-center mt-2" style={{ color: 'var(--fg-subtle)' }}>
                    {img.alt}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Check for iframe content
    if (content.includes('<iframe')) {
      return (
        <div
          className="whitespace-pre-wrap leading-relaxed text-sm md:text-base animate-fade-in"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    }

    // Regular text content with improved formatting
    return <FormattedMessage content={content} />
  }
  
  return (
    <div
      className={`${message.role === 'user' ? 'text-right animate-slide-in-right' : 'text-left animate-slide-in-left'}`}
    >
      <div
        className={`inline-block px-4 py-3 rounded-2xl max-w-full break-words border transition-all duration-300 ${
          shouldAnimate && isTyping ? 'cursor-pointer' : ''
        }`}
        style={{
          background: message.role === 'user'
            ? 'var(--accent-muted)'
            : 'var(--overlay)',
          borderColor: message.role === 'user'
            ? 'var(--accent)'
            : 'var(--border)',
          color: 'var(--fg)'
        }}
        onClick={shouldAnimate && isTyping ? skip : undefined}
        title={shouldAnimate && isTyping ? 'Click to show full message' : undefined}
      >
        {renderContent(contentToDisplay)}

        {/* Typing cursor indicator */}
        {shouldAnimate && isTyping && (
          <span className="inline-block w-0.5 h-4 ml-1 bg-[var(--accent)] animate-typing align-middle"></span>
        )}
        
        {/* Enhanced Tool Calls Debug Info - Collapsed by default */}
        {message.debugInfo?.toolCalls && message.debugInfo.toolCalls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors mb-2 w-full text-left group"
            >
              <span className="text-sm group-hover:scale-110 transition-transform">🔧</span>
              <span className="font-medium">
                Tool Results ({message.debugInfo.toolCalls.length})
              </span>
              <span className="text-gray-400 ml-auto group-hover:text-gray-600 transition-colors">
                {toolsExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {toolsExpanded && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
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

  // Auto-scroll when messages change (with smoother debounce for typewriter effect)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (scrollRef.current) {
        // Smooth scroll to bottom
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 150) // Slightly longer debounce for smoother scrolling with typewriter
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
      {streamState.isStreaming && (
        <StatusIndicator
          type="processing"
          message="Gathering weather data from satellites and stations"
          className="animate-fade-in"
        />
      )}
      {streamState.retryCount > 0 && (
        <StatusIndicator
          type="loading"
          message={`Reconnecting to weather services (${streamState.retryCount}/3)`}
          className="animate-fade-in"
        />
      )}

      <div
        aria-label="Chat messages"
        aria-live="polite"
        className="max-h-[45vh] overflow-y-auto rounded-xl border p-4 shadow-inner-soft transition-all duration-300"
        role="log"
        style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}
        ref={scrollRef}
      >
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 px-4 animate-fade-in">
              <div className="mb-6 animate-bounce-gentle">
                <span className="text-5xl">🌾</span>
              </div>
              <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--fg)' }}>
                Welcome to WeatherAgent
              </h3>
              <p className="text-sm mb-6 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--fg-subtle)' }}>
                Get detailed weather forecasts tailored for farming decisions. Enter your ZIP code below to start.
              </p>
              <div className="rounded-xl p-5 mb-4 max-w-md mx-auto shadow-soft animate-slide-up" style={{
                backgroundColor: 'var(--accent-muted)',
                borderColor: 'var(--accent)',
                border: '1px solid'
              }}>
                <p className="text-sm font-semibold mb-3 flex items-center justify-center gap-2" style={{ color: 'var(--accent)' }}>
                  <span>✨</span>
                  <span>What you'll get:</span>
                </p>
                <ul className="text-sm space-y-2 text-left" style={{ color: 'var(--fg)' }}>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--ok)] mt-0.5">✓</span>
                    <span>7-day weather forecast with agricultural insights</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--ok)] mt-0.5">✓</span>
                    <span>Planting and irrigation recommendations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--ok)] mt-0.5">✓</span>
                    <span>Pest and disease pressure alerts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--ok)] mt-0.5">✓</span>
                    <span>Frost and heat stress warnings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--ok)] mt-0.5">✓</span>
                    <span>Field access and spray condition updates</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageComponent
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                />
              ))}
              {/* Show typing indicator when streaming and no content yet */}
              {streamState.isStreaming && messages[messages.length - 1]?.content === '' && (
                <div className="text-left">
                  <TypingIndicator message="Weather Agent is analyzing data" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Enhanced Error Display */}
      {(streamState.error || agentError) && (
        <div
          aria-live="assertive"
          className="text-sm p-4 rounded-xl border shadow-soft animate-slide-up"
          id="error-message"
          role="alert"
          style={{
            color: 'var(--error)',
            backgroundColor: 'var(--error-muted)',
            borderColor: 'var(--error)'
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="font-medium mb-1">Connection Error</p>
              <p className="text-xs opacity-90">
                {agentError || (typeof streamState.error === 'string' ? streamState.error : String(streamState.error || 'Unknown error'))}
              </p>
              {streamState.retryCount > 0 && (
                <button
                  onClick={retry}
                  className="mt-3 px-4 py-2 text-xs font-medium bg-white hover:bg-red-50 rounded-lg border border-[var(--error)] transition-all hover:shadow-md"
                  style={{ color: 'var(--error)' }}
                >
                  Retry Connection ({streamState.retryCount}/3)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <input
            aria-describedby="error-message zip-help"
            aria-label="Enter your 5-digit ZIP code for weather forecast"
            autoComplete="postal-code"
            className={`input w-full transition-all duration-200 ${
              !hasAssistantResponded && input && !/^\d{5}$/.test(input)
                ? 'border-[var(--error)] focus:shadow-[0_0_0_3px_rgba(216,63,135,0.2)]'
                : ''
            }`}
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
            <div id="zip-help" className="text-xs mt-2 animate-fade-in" style={{ color: 'var(--error)' }}>
              ℹ️ Please enter a valid 5-digit ZIP code
            </div>
          )}
        </div>
        <button
          aria-label={hasAssistantResponded ? "Send message" : "Get forecast"}
          className="btn whitespace-nowrap shadow-soft"
          onClick={onSend}
          disabled={!agent || streamState.isLoading || !input.trim() || (!hasAssistantResponded && !/^\d{5}$/.test(input.trim()))}
        >
          {streamState.isLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              <span className="hidden sm:inline">Processing...</span>
            </span>
          ) : (
            <>
              <span>{hasAssistantResponded ? 'Send' : 'Get Forecast'}</span>
              <span className="text-lg">→</span>
            </>
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
          <summary className="cursor-pointer hover:opacity-70 transition-opacity" style={{ color: 'var(--fg-muted)' }}>
            🔧 Technical Details
          </summary>
          <div className="mt-2 p-3 rounded-lg border" style={{ 
            backgroundColor: 'var(--overlay)',
            borderColor: 'var(--border)'
          }}>
            <div className="space-y-3">
              {/* Stream Metrics */}
              <div className="space-y-2">
                <h4 className="font-semibold border-b pb-1" style={{ 
                  color: 'var(--fg)',
                  borderColor: 'var(--border)'
                }}>Weather Data Stream</h4>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--fg-muted)' }}>Response Time:</span>
                  <span className="font-mono" style={{ color: 'var(--fg)' }}>
                    {streamState.metrics.endTime 
                      ? `${((streamState.metrics.endTime - streamState.metrics.startTime) / 1000).toFixed(1)}s`
                      : 'In progress...'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--fg-muted)' }}>Data Sources:</span>
                  <span className="font-mono" style={{ color: 'var(--fg)' }}>{streamState.metrics.chunksReceived} weather stations</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--fg-muted)' }}>Data Size:</span>
                  <span className="font-mono" style={{ color: 'var(--fg)' }}>
                    {streamState.metrics.bytesReceived > 1024 
                      ? `${(streamState.metrics.bytesReceived / 1024).toFixed(1)}KB`
                      : `${streamState.metrics.bytesReceived}B`
                    }
                  </span>
                </div>
                {streamState.metrics.errors > 0 && (
                  <div className="flex justify-between" style={{ color: 'var(--error)' }}>
                    <span>Connection Issues:</span>
                    <span className="font-mono">{streamState.metrics.errors}</span>
                  </div>
                )}
                {streamState.metrics.retries > 0 && (
                  <div className="flex justify-between" style={{ color: 'var(--warn)' }}>
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
                    <h4 className="font-semibold border-b pb-1" style={{ 
                      color: 'var(--fg)',
                      borderColor: 'var(--border)'
                    }}>Video Analytics</h4>
                    {muxAnalytics.map((analytics, index) => (
                      <div key={analytics.assetId || index} className="space-y-1 pl-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>Asset ID:</span>
                          <span className="font-mono text-xs" style={{ color: 'var(--fg)' }}>{analytics.assetId?.substring(0, 8)}...</span>
                        </div>
                        {analytics.videoDuration && (
                          <div className="flex justify-between">
                            <span style={{ color: 'var(--fg-muted)' }}>Duration:</span>
                            <span className="font-mono" style={{ color: 'var(--fg)' }}>{Math.round(analytics.videoDuration)}s</span>
                          </div>
                        )}
                        {analytics.currentTime !== undefined && (
                          <div className="flex justify-between">
                            <span style={{ color: 'var(--fg-muted)' }}>Current Time:</span>
                            <span className="font-mono" style={{ color: 'var(--fg)' }}>{Math.round(analytics.currentTime)}s</span>
                          </div>
                        )}
                        {analytics.completionRate > 0 && (
                          <div className="flex justify-between">
                            <span style={{ color: 'var(--fg-muted)' }}>Completion:</span>
                            <span className="font-mono" style={{ color: 'var(--fg)' }}>{analytics.completionRate.toFixed(1)}%</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>Play Events:</span>
                          <span className="font-mono" style={{ color: 'var(--fg)' }}>{analytics.playEvents}</span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>Pause Events:</span>
                          <span className="font-mono" style={{ color: 'var(--fg)' }}>{analytics.pauseEvents}</span>
                        </div>
                        {analytics.bufferingEvents > 0 && (
                          <div className="flex justify-between" style={{ color: 'var(--warn)' }}>
                            <span>Buffering Events:</span>
                            <span className="font-mono">{analytics.bufferingEvents}</span>
                          </div>
                        )}
                        {analytics.seekingEvents > 0 && (
                          <div className="flex justify-between" style={{ color: 'var(--accent)' }}>
                            <span>Seek Events:</span>
                            <span className="font-mono">{analytics.seekingEvents}</span>
                          </div>
                        )}
                        {analytics.errorEvents > 0 && (
                          <div className="flex justify-between" style={{ color: 'var(--error)' }}>
                            <span>Video Errors:</span>
                            <span className="font-mono">{analytics.errorEvents}</span>
                          </div>
                        )}
                        {analytics.lastEventTime && (
                          <div className="flex justify-between" style={{ color: 'var(--fg-subtle)' }}>
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
