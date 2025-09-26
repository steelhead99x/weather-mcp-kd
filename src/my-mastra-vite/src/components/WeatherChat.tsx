import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { mastra, getWeatherAgentId, getDisplayHost } from '../lib/mastraClient'
import MuxSignedPlayer from './MuxSignedPlayer'

/**
 * WeatherChat Component
 * 
 * Uses agent.streamVNext() for optimal performance and simplified API.
 * Features: Real-time streaming, tool call handling, and debug information.
 */

interface ToolCallDebug {
  id?: string
  toolName?: string
  args?: unknown
  result?: unknown
  status?: 'called' | 'result'
}

interface DebugInfo {
  toolCalls: ToolCallDebug[]
  events: { type: string; payload?: unknown }[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  debug?: DebugInfo
}

// Lightweight formatter to improve assistant readability without extra deps.
// - Splits paragraphs on blank lines
// - Detects simple bullet lists (lines starting with '-' or '•')
// - Preserves single line breaks inside paragraphs
// - Linkifies http(s):// and www. URLs
function renderTextWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/g
  const segments: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    const [raw] = match
    const start = match.index
    if (start > lastIndex) segments.push(text.slice(lastIndex, start))
    const href = raw.startsWith('http') ? raw : `https://${raw}`
    segments.push(
      <a key={`link-${start}`} href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-[color:var(--fg-subtle)] hover:decoration-[color:var(--fg)]">
        {raw}
      </a>
    )
    lastIndex = start + raw.length
  }
  if (lastIndex < text.length) segments.push(text.slice(lastIndex))
  return segments
}

function renderAssistantContent(content: string): React.ReactNode {
  // Split into blocks by one or more blank lines
  const blocks = content.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const trimmed = lines.map((l) => l.trimEnd())
        const isList = trimmed.length > 1 && trimmed.every((l) => /^[-•]/.test(l.trim()))
        if (isList) {
          return (
            <ul key={`b-${i}`} className="list-disc pl-5 my-2 space-y-1">
              {trimmed.map((l, j) => (
                <li key={`li-${i}-${j}`}>{renderTextWithLinks(l.replace(/^[-•]\s*/, ''))}</li>
              ))}
            </ul>
          )
        }
        // Regular paragraph: preserve single line breaks
        return (
          <p key={`p-${i}`} className="my-2">
            {trimmed.map((l, j) => (
              <React.Fragment key={`ln-${i}-${j}`}>
                {renderTextWithLinks(l)}
                {j < trimmed.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

// Extract urls from text and determine if they are images or videos, then render inline previews.
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/g
  const urls: string[] = []
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    const raw = match[0]
    const href = raw.startsWith('http') ? raw : `https://${raw}`
    // Avoid duplicates
    if (!urls.includes(href)) urls.push(href)
  }
  return urls
}

function isImageUrl(u: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(u)
}

function isVideoUrl(u: string): boolean {
  // Support common browser-playable formats; HLS (.m3u8) is Safari-only, omit for now
  return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(u)
}

function isStreamingPortfolioUrl(u: string): boolean {
  return /streamingportfolio\.com/i.test(u)
}

function extractAssetIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (!isStreamingPortfolioUrl(url)) return null
    
    // Check for asset ID in query parameters
    const assetId = urlObj.searchParams.get('assetId') || 
                   urlObj.searchParams.get('assetID') || 
                   urlObj.searchParams.get('assetid')
    
    if (assetId) return assetId
    
    // Check for asset ID in path segments (e.g., /video/ASSET_ID)
    const pathSegments = urlObj.pathname.split('/').filter(Boolean)
    if (pathSegments.length >= 2) {
      // Look for patterns like /video/ASSET_ID or /asset/ASSET_ID
      const videoIndex = pathSegments.findIndex(seg => /video|asset|play/i.test(seg))
      if (videoIndex !== -1 && videoIndex + 1 < pathSegments.length) {
        return pathSegments[videoIndex + 1]
      }
    }
    
    return null
  } catch {
    return null
  }
}

function renderStreamingPortfolioEmbeds(content: string): React.ReactNode | null {
  const urls = extractUrls(content)
  if (!urls.length) return null
  const streamingUrls = urls.filter(isStreamingPortfolioUrl)
  if (!streamingUrls.length) return null
  
  return (
    <div className="mt-3 space-y-3">
      {streamingUrls.map((u, idx) => {
        const assetId = extractAssetIdFromUrl(u)
        if (!assetId) return null
        
        return (
          <div key={`streaming-${idx}`} className="group">
            <div className="w-full max-w-md">
              <MuxSignedPlayer assetId={assetId} className="w-full" />
            </div>
            <div className="mt-1 text-xs truncate" style={{ color: 'var(--fg-subtle)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="underline decoration-[color:var(--fg-subtle)] hover:decoration-[color:var(--fg)]">
                {u}
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function renderMediaEmbeds(content: string): React.ReactNode | null {
  const urls = extractUrls(content)
  if (!urls.length) return null
  const media = urls.filter((u) => isImageUrl(u) || isVideoUrl(u))
  if (!media.length) return null
  return (
    <div className="mt-3 space-y-3">
      {media.map((u, idx) => (
        <div key={`media-${idx}`} className="group">
          {isImageUrl(u) ? (
            <a href={u} target="_blank" rel="noopener noreferrer" className="block">
              <img src={u} alt="linked image" className="max-h-64 rounded-lg border shadow-sm" style={{ borderColor: 'var(--border)' }} loading="lazy" />
            </a>
          ) : (
            <div className="w-full max-w-xs">
              <video src={u} controls playsInline className="w-full rounded-lg border" style={{ borderColor: 'var(--border)' }} />
            </div>
          )}
          <div className="mt-1 text-xs truncate" style={{ color: 'var(--fg-subtle)' }}>
            <a href={u} target="_blank" rel="noopener noreferrer" className="underline decoration-[color:var(--fg-subtle)] hover:decoration-[color:var(--fg)]">
              {u}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatError(err: unknown): string {
  if (!err) return 'Something went wrong'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function safeJson(val: unknown, maxLen = 200): string {
  try {
    const s = typeof val === 'string' ? val : JSON.stringify(val)
    if (!s) return ''
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
  } catch (e) {
    console.warn('[WeatherChat] JSON stringify failed:', e)
    try {
      const s = String(val)
      return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
    } catch {
      return '[unable to stringify]'
    }
  }
}

export default function WeatherChat() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasAssistantResponded, setHasAssistantResponded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [debouncedInput, setDebouncedInput] = useState('')
  const [collapsedToolCalls, setCollapsedToolCalls] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const agent = useMemo(() => {
    try {
      const agentId = getWeatherAgentId()
      console.log('[WeatherChat] Getting agent with ID:', agentId)
      const agentInstance = mastra.getAgent(agentId)
      console.log('[WeatherChat] Agent instance:', agentInstance)
      return agentInstance
    } catch (e) {
      console.error('[WeatherChat] Failed to get agent:', e)
      return null
    }
  }, [])

  // Debounce input changes for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(input)
    }, 300)
    return () => clearTimeout(timer)
  }, [input])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current && 'scrollTo' in scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      } else if (scrollRef.current && 'scrollTop' in scrollRef.current) {
        // Fallback for test environments
        (scrollRef.current as any).scrollTop = (scrollRef.current as any).scrollHeight
      }
    })
  }, [])

  const toggleToolCallCollapse = useCallback((toolCallId: string) => {
    setCollapsedToolCalls(prev => {
      const newSet = new Set(prev)
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId)
      } else {
        newSet.add(toolCallId)
      }
      return newSet
    })
  }, [])

  const onSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    // First message must be a 5-digit US ZIP code. After the assistant responds once, allow any text.
    if (!hasAssistantResponded && !/^\d{5}$/.test(trimmed)) {
      setError('Please enter a valid 5-digit US ZIP code to start the conversation.')
      return
    }

    setError(null)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        debug: { toolCalls: [], events: [] },
      },
    ])
    setLoading(true)

    const attemptRequest = async (attempt: number): Promise<void> => {
      try {
        const systemPrompt = `You are WeatherAgent, a farmer-friendly weather assistant. Turn forecasts into practical agricultural guidance: planting windows, irrigation timing, pest and disease pressure, frost and heat stress, spray conditions, field access, hay curing, and livestock comfort. Reference the user's location, season, and crop or operation when possible. Keep answers concise, actionable, and safety-minded. If the user provides only a ZIP code, greet them and summarize the next 7 days highlighting risks and opportunities. This service is built and powered mainly by solar energy—mention sustainability benefits only when it genuinely helps the decision.`

        let response: any
        const threadId = `thread-${Date.now()}`
        const resourceId = 'weather-user'
        
        console.log('[WeatherChat] Attempting to stream with agent:', agent)
        console.log('[WeatherChat] Agent methods available:', Object.getOwnPropertyNames(agent))
        console.log('[WeatherChat] Agent streamVNext method:', typeof (agent as any).streamVNext)
        console.log('[WeatherChat] Agent stream method:', typeof (agent as any).stream)
        
        // Use Mastra MCP streaming with proper configuration
        if (typeof (agent as any).streamVNext === 'function') {
          console.log('[WeatherChat] Using Mastra MCP streamVNext method')
          
          // Get dynamic toolsets for this request
          const dynamicToolsets = await mastra.getDynamicToolsets?.() || {}
          console.log('[WeatherChat] Dynamic toolsets:', Object.keys(dynamicToolsets))
          
          response = await (agent as any).streamVNext(
            userMsg.content,
            {
              format: 'mastra', // Use Mastra MCP format for optimal performance
              system: systemPrompt,
              memory: {
                thread: threadId,
                resource: resourceId,
              },
              toolsets: dynamicToolsets,
              // Add proper error handling and callbacks
              onChunk: (chunk: any) => {
                console.debug('[WeatherChat] Mastra MCP chunk:', chunk)
                // Handle chunks immediately if needed
              },
              onError: ({ error }: { error: Error | string }) => {
                console.error('[WeatherChat] Mastra MCP error:', error)
                setError(formatError(error))
              },
              onFinish: (result: any) => {
                console.log('[WeatherChat] Mastra MCP finished:', result)
                receivedText = true
                try { clearTimeout(timeoutId) } catch {}
              },
              // Model settings for better performance
              modelSettings: {
                temperature: 0.7,
                maxRetries: 3,
              },
              // Ensure proper tool handling
              toolChoice: 'auto',
            }
          )
          console.log('[WeatherChat] streamVNext response:', response)
          console.log('[WeatherChat] streamVNext response type:', typeof response)
          console.log('[WeatherChat] streamVNext response keys:', response ? Object.keys(response) : 'null')
        } else {
          throw new Error('Agent streamVNext is not available in this client. Please ensure you are using a compatible Mastra version.')
        }

        let receivedText = false
        const timeoutId = setTimeout(() => {
          if (!receivedText) {
            const host = getDisplayHost()
            setError(`No response received from agent. If you're running locally, ensure your Mastra server is reachable at http://${host} and that CORS is enabled. Also verify the agent is streaming text.`)
          }
        }, 10000)

        const handleChunk = (chunk: any) => {
          try { 
            console.debug('[WeatherChat] chunk', { 
              type: chunk?.type || chunk?.event || chunk?.kind, 
              preview: safeJson(chunk, 200),
              hasPayload: !!chunk?.payload,
              hasData: !!chunk?.data
            }) 
          } catch (e) {
            console.error('[WeatherChat] Error logging chunk:', e)
          }
          
          // Handle errors first, including overloaded_error
          if (chunk?.type === 'error' || chunk?.payload?.type === 'error') {
            const errorPayload = chunk?.payload || chunk
            const errorType = errorPayload?.type || errorPayload?.error?.type
            const errorMessage = errorPayload?.error?.message || errorPayload?.message || errorPayload?.error
            
            console.error('[WeatherChat] Error chunk received:', {
              type: errorType,
              message: errorMessage,
              fullChunk: chunk
            })
            
            if (errorType === 'overloaded_error') {
              setError('The weather service is currently overloaded. Please try again in a few moments.')
            } else {
              setError(formatError(errorMessage || errorPayload))
            }
            return
          }
          
          // Prefer direct text chunks
          let appended = false
          const appendText = (t?: unknown) => {
            const s = typeof t === 'string' ? t : undefined
            if (s && s.length > 0) {
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + s } : m)))
              setHasAssistantResponded(true)
              scrollToBottom()
              appended = true
              receivedText = true
              try { clearTimeout(timeoutId) } catch {}
            }
          }

          // Handle Mastra MCP chunk types (MastraModelOutput format) - optimized
          if (chunk?.type === 'text-delta') {
            appendText(chunk.payload?.text)
          } else if (chunk?.type === 'text-start') {
            console.log('[WeatherChat] Text generation started:', chunk.payload?.id)
          } else if (chunk?.type === 'text-end') {
            console.log('[WeatherChat] Text generation finished:', chunk.payload?.id)
          } else if (chunk?.type === 'text') {
            appendText(chunk.payload?.text || chunk.content)
          } else if (chunk?.type === 'mastra-text-delta') {
            // Mastra MCP specific text delta format
            appendText(chunk.text || chunk.content || chunk.data)
          } else if (chunk?.type === 'mastra-tool-call') {
            // Mastra MCP tool call format
            const toolName = chunk.toolName || chunk.name
            const args = chunk.args || chunk.arguments
            const id = chunk.id || chunk.toolCallId
            
            console.log('[WeatherChat] Mastra MCP tool call:', { toolName, id, args })
            
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const debug = m.debug || { toolCalls: [], events: [] }
                const call: any = { id, toolName, args, status: 'called' as const }
                return { ...m, debug: { ...debug, toolCalls: [...debug.toolCalls, call] } }
              })
            )
            scrollToBottom()
          } else if (chunk?.type === 'mastra-tool-result') {
            // Mastra MCP tool result format
            const id = chunk.id || chunk.toolCallId
            const toolName = chunk.toolName || chunk.name
            const result = chunk.result || chunk.output
            
            console.log('[WeatherChat] Mastra MCP tool result:', { toolName, id, result })
            
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const debug = m.debug || { toolCalls: [], events: [] }
                const calls = [...debug.toolCalls]
                const idx = calls.findIndex((c) => (id && c.id === id))
                const updated = { id, toolName, result, status: 'result' as const }
                if (idx >= 0) {
                  calls[idx] = { ...calls[idx], ...updated }
                } else {
                  calls.push(updated)
                }
                return { ...m, debug: { ...debug, toolCalls: calls } }
              })
            )
            scrollToBottom()
          }

          // Known Mastra/text formats
          if (chunk?.type === 'text') {
            appendText(chunk.content)
          }

          // vNext sometimes emits generic events with event/kind and payload/data
          const eventName: string | undefined = chunk?.event || chunk?.kind
          const payload = chunk?.payload ?? chunk?.data
          if (!appended && eventName && /delta|message|content|token/i.test(eventName)) {
            // Try common fields in payload
            appendText(payload?.text || payload?.content || payload?.delta?.text || payload?.delta?.content)
            if (!appended) appendText(payload?.message?.content)
            if (!appended) appendText(payload?.response?.output_text || payload?.response?.text)
            // Anthropic content_block_delta shape
            if (!appended && payload?.delta?.delta) appendText(payload?.delta?.delta?.text)
          }

          // Try other common nesting patterns (OpenAI-style)
          if (!appended) {
            appendText(chunk?.delta?.content || chunk?.delta?.text)
          }
          // Anthropic event style
          if (!appended && (chunk?.type === 'content_block_delta' || chunk?.type === 'message_delta' || chunk?.type === 'delta')) {
            appendText(chunk?.delta?.text || chunk?.delta?.delta?.text || chunk?.delta?.content)
          }
          if (!appended) {
            const choice = chunk?.choices?.[0]
            appendText(choice?.delta?.content || choice?.message?.content)
          }
          if (!appended) {
            // Sometimes content can be an array of parts
            const parts = (chunk?.content || payload?.content)
            if (Array.isArray(parts)) {
              const textParts = parts.map((p) => (typeof p === 'string' ? p : p?.text || p?.content)).filter(Boolean)
              if (textParts.length) appendText(textParts.join(''))
            }
          }
          if (!appended) {
            // Final fallbacks
            appendText(chunk?.message?.content)
            appendText(chunk?.output_text || chunk?.text)
          }

          // Handle tool calls (optimized for vstream format)
          const toolType = chunk.type || eventName
          if (toolType === 'tool-call' || toolType === 'tool_call' || toolType === 'tool_call_created' || toolType === 'tool_use' || toolType === 'tool_invocation') {
            const toolName = chunk?.payload?.toolName || chunk?.toolName || chunk?.name || chunk?.tool?.name
            const args = chunk?.payload?.args || chunk?.args || chunk?.input || chunk?.tool?.arguments
            const id = chunk?.payload?.toolCallId || chunk?.id || chunk?.tool_use_id || chunk?.tool?.id
            
            console.log('[WeatherChat] Tool call detected:', {
              toolType,
              toolName,
              id,
              args: args ? JSON.stringify(args, null, 2) : 'undefined',
              chunk: JSON.stringify(chunk, null, 2)
            })
            
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const debug = m.debug || { toolCalls: [], events: [] }
                const call: any = { id, toolName, args, status: 'called' as const }
                return { ...m, debug: { ...debug, toolCalls: [...debug.toolCalls, call] } }
              })
            )
            scrollToBottom()
          }
          
          // Handle tool call streaming (vstream specific)
          if (toolType === 'tool-call-input-streaming-start') {
            console.log('[WeatherChat] Tool call input streaming started:', chunk?.payload?.toolName)
          } else if (toolType === 'tool-call-delta') {
            console.log('[WeatherChat] Tool call delta:', chunk?.payload?.argsTextDelta)
          } else if (toolType === 'tool-call-input-streaming-end') {
            console.log('[WeatherChat] Tool call input streaming ended:', chunk?.payload?.toolCallId)
          }
          // Handle tool results
          if (toolType === 'tool-result' || toolType === 'tool_result' || toolType === 'tool_completed' || toolType === 'tool_result_created') {
            const id = chunk?.payload?.toolCallId || chunk?.id || chunk?.tool_use_id
            const toolName = chunk?.payload?.toolName || chunk?.toolName || chunk?.name
            const result = chunk?.payload?.result || chunk?.result || chunk?.output || chunk?.tool_result
            
            console.log('[WeatherChat] Tool result received:', {
              toolType,
              toolName,
              id,
              result: result ? JSON.stringify(result, null, 2) : 'undefined',
              chunk: JSON.stringify(chunk, null, 2)
            })
            
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const debug = m.debug || { toolCalls: [], events: [] }
                const calls = [...debug.toolCalls]
                const idx = calls.findIndex((c) => (id && c.id === id))
                const updated = { id, toolName, result, status: 'result' as const }
                if (idx >= 0) {
                  calls[idx] = { ...calls[idx], ...updated }
                } else {
                  calls.push(updated)
                }
                return { ...m, debug: { ...debug, toolCalls: calls } }
              })
            )
            scrollToBottom()
          }
          // Handle other data types and always record for debug
          try {
            const type = chunk?.type || eventName || 'event'
            const payloadForDebug = payload ?? chunk
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, debug: { ...(m.debug || { toolCalls: [], events: [] }), events: [ ...(m.debug?.events || []), { type, payload: payloadForDebug } ] } } : m))
            )
          } catch {}

          // Handle errors (optimized for vstream)
          if (chunk.type === 'error') {
            const errorPayload = chunk.payload || chunk
            const errorMessage = errorPayload?.error || errorPayload?.message || errorPayload
            setError(formatError(errorMessage))
          } else if (chunk.type === 'tool-error') {
            const errorPayload = chunk.payload || chunk
            const errorMessage = errorPayload?.error || errorPayload?.message || 'Tool execution failed'
            console.error('[WeatherChat] Tool error:', errorMessage)
            setError(`Tool error: ${formatError(errorMessage)}`)
          } else if (chunk.type === 'tripwire') {
            const reason = chunk.payload?.tripwireReason || 'Content blocked by safety mechanisms'
            console.warn('[WeatherChat] Stream tripwire triggered:', reason)
            setError(`Content blocked: ${reason}`)
          }
        }

        console.log('[WeatherChat] Processing response:', response)
        console.log('[WeatherChat] Response properties:', response ? Object.getOwnPropertyNames(response) : 'null')
        console.log('[WeatherChat] Response type:', typeof response)
        console.log('[WeatherChat] Response constructor:', response?.constructor?.name)
        
        // Debug the specific streaming methods
        if (response) {
          console.log('[WeatherChat] textStream type:', typeof response.textStream)
          console.log('[WeatherChat] textStream value:', response.textStream)
          console.log('[WeatherChat] fullStream type:', typeof response.fullStream)
          console.log('[WeatherChat] fullStream value:', response.fullStream)
          console.log('[WeatherChat] stream method type:', typeof response.stream)
          console.log('[WeatherChat] processDataStream method type:', typeof response.processDataStream)
          console.log('[WeatherChat] Has async iterator:', Symbol.asyncIterator in Object(response))
          
          // Check if it's a ReadableStream
          if (response.textStream) {
            console.log('[WeatherChat] textStream is ReadableStream:', response.textStream instanceof ReadableStream)
            console.log('[WeatherChat] textStream locked:', response.textStream.locked)
          }
          if (response.fullStream) {
            console.log('[WeatherChat] fullStream is ReadableStream:', response.fullStream instanceof ReadableStream)
            console.log('[WeatherChat] fullStream locked:', response.fullStream.locked)
          }
        }
        
        // Handle streamVNext response (MastraModelOutput) - with fallback support
        if (response && typeof response.textStream === 'object' && response.textStream) {
          console.log('[WeatherChat] Using textStream from MastraModelOutput (streamVNext)')
          
          // Use async iterator for cleaner code
          try {
            for await (const textChunk of response.textStream) {
              if (textChunk && typeof textChunk === 'string' && textChunk.length > 0) {
                console.log('[WeatherChat] Appending text:', textChunk)
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + textChunk } : m)))
                setHasAssistantResponded(true)
                scrollToBottom()
                receivedText = true
                try { clearTimeout(timeoutId) } catch {}
              }
            }
          } catch (streamError) {
            console.error('[WeatherChat] Error reading textStream:', streamError)
            const errorMsg = streamError instanceof Error ? streamError.message : String(streamError)
            if (errorMsg.includes('JSON parse error') || errorMsg.includes('overloaded_error')) {
              setError('The weather service is temporarily unavailable. Please try again in a few moments.')
            } else {
              setError(`Stream error: ${errorMsg}`)
            }
          }
        } else if (response && typeof response.fullStream === 'object' && response.fullStream) {
          console.log('[WeatherChat] Using fullStream from MastraModelOutput (streamVNext)')
          
          // Use async iterator for cleaner code
          try {
            for await (const chunk of response.fullStream) {
              console.log('[WeatherChat] Processing fullStream chunk:', chunk?.type)
              
              // Process the chunk using the existing handleChunk function
              try {
                handleChunk(chunk)
              } catch (chunkError) {
                console.error('[WeatherChat] Error processing chunk:', chunkError)
                // Don't break the stream for individual chunk errors, just log them
              }
            }
          } catch (streamError) {
            console.error('[WeatherChat] Error reading fullStream:', streamError)
            const errorMsg = streamError instanceof Error ? streamError.message : String(streamError)
            if (errorMsg.includes('JSON parse error') || errorMsg.includes('overloaded_error')) {
              setError('The weather service is temporarily unavailable. Please try again in a few moments.')
            } else {
              setError(`Stream error: ${errorMsg}`)
            }
          }
        } else if (typeof response?.processDataStream === 'function') {
          console.log('[WeatherChat] Using processDataStream (legacy stream) - fallback')
          await response.processDataStream({ onChunk: handleChunk })
        } else if (typeof (response as any)?.stream === 'function') {
          console.log('[WeatherChat] Using stream() method (legacy stream) - fallback')
          for await (const chunk of (response as any).stream()) {
            handleChunk(chunk)
          }
        } else if (response && Symbol.asyncIterator in Object(response)) {
          console.log('[WeatherChat] Using async iterator - fallback')
          for await (const chunk of response as any) {
            handleChunk(chunk)
          }
        } else {
          console.error('[WeatherChat] No valid streaming method found in response')
          console.error('[WeatherChat] Response type:', typeof response)
          console.error('[WeatherChat] Response keys:', response ? Object.keys(response) : 'null')
          console.error('[WeatherChat] Response properties:', {
            hasTextStream: !!(response?.textStream),
            hasFullStream: !!(response?.fullStream),
            hasProcessDataStream: !!(response?.processDataStream),
            hasStream: !!(response?.stream),
            hasAsyncIterator: response ? Symbol.asyncIterator in Object(response) : false,
          })
          setError('No valid streaming method found in agent response. Please check your Mastra server configuration.')
        }
        
        // Stream finished
        try { clearTimeout(timeoutId) } catch {}
        if (!receivedText) {
          const host = getDisplayHost()
          setError(`No response received from agent. If you're running locally, ensure your Mastra server is reachable at http://${host} and that CORS is enabled. Also verify the agent is streaming text.`)
        }
        // Reset retry count on success
        setRetryCount(0)
      } catch (e: unknown) {
        console.error('[WeatherChat] Request error:', e)
        
        let error = formatError(e) || 'Failed to contact agent'
        
        // Handle specific error types
        if (e && typeof e === 'object' && 'message' in e) {
          const errorMessage = (e as any).message
          if (errorMessage.includes('JSON parse error') || errorMessage.includes('overloaded_error')) {
            error = 'The weather service is temporarily unavailable. Please try again in a few moments.'
          } else if (errorMessage.includes('Failed to fetch')) {
            error = 'Unable to connect to the weather service. Please check your connection and try again.'
          }
        }
        
        // Retry logic for network errors (max 3 attempts)
        if (attempt < 3 && (error.includes('Failed to fetch') || error.includes('temporarily unavailable'))) {
          setRetryCount(attempt + 1)
          setTimeout(() => attemptRequest(attempt + 1), Math.pow(2, attempt) * 1000)
          return
        }
        
        setError(error)
        setRetryCount(0)
      }
    }

    await attemptRequest(0)
    setLoading(false)
    scrollToBottom()
  }, [agent, input, messages, scrollToBottom, hasAssistantResponded])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌾</span>
        <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>Farmer-friendly, solar-powered weather insights for planting, irrigation, and livestock decisions.</p>
      </div>

      <div 
        ref={scrollRef} 
        className="max-h-[45vh] overflow-y-auto rounded-xl border p-4" 
        style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--fg-subtle)' }}>Howdy! Enter a 5-digit ZIP like 94102 to get a farmer-focused forecast. Try: "94102" or ask "Best window to spray this week?"</div>
        )}


        <div className="space-y-3">
          {messages.map((m, index) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              {/* Add a new line between responses */}
              {m.role === 'assistant' && index > 0 && messages[index - 1]?.role === 'assistant' && (
                <div className="h-4"></div>
              )}
              <div
                className="inline-block px-3 py-2 rounded-2xl max-w-full break-words border"
                style={{
                  background: m.role === 'user' ? 'var(--accent-muted)' : 'var(--overlay)',
                  borderColor: m.role === 'user' ? 'var(--accent)' : 'var(--border)',
                  color: 'var(--fg)'
                }}
              >
                {m.role === 'assistant' ? (
                  m.content ? (
                    <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                      {renderAssistantContent(m.content)}
                      {renderMediaEmbeds(m.content)}
                      {renderStreamingPortfolioEmbeds(m.content)}
                      {m.debug && (m.debug.toolCalls.length > 0 || m.debug.events.length > 0) ? (
                        <div className="mt-3 p-2 rounded-lg border text-xs space-y-2" style={{ borderColor: 'var(--border)', background: 'color-mix(in oklab, var(--overlay) 80%, transparent)' }}>
                          <div className="font-medium" style={{ color: 'var(--fg-subtle)' }}>Details</div>
                          {m.debug.toolCalls.length > 0 && (
                            <div>
                              <div className="mb-1" style={{ color: 'var(--fg-subtle)' }}>Tool calls:</div>
                              <div className="space-y-2">
                                {m.debug.toolCalls.map((tc, idx) => {
                                  const toolCallId = `${m.id}-tc-${idx}`
                                  const hasDetails = tc.args || tc.result
                                  // Auto-hide tool calls with details by default (only expand if explicitly clicked)
                                  const isCollapsed = hasDetails ? !collapsedToolCalls.has(toolCallId) : false
                                  
                                  return (
                                    <div key={`tc-${idx}`} className="border rounded-lg p-2" style={{ borderColor: 'var(--border)' }}>
                                      <div 
                                        className="flex items-center justify-between cursor-pointer hover:opacity-80"
                                        onClick={() => hasDetails && toggleToolCallCollapse(toolCallId)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{String(tc.toolName || 'tool')}</span>
                                          <span className="text-xs px-2 py-1 rounded" style={{ 
                                            background: tc.status === 'called' ? 'var(--accent-muted)' : 'var(--overlay)',
                                            color: tc.status === 'called' ? 'var(--accent)' : 'var(--fg-subtle)'
                                          }}>
                                            {tc.status === 'called' ? 'calling' : 'completed'}
                                          </span>
                                        </div>
                                        {hasDetails ? (
                                          <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                                            {isCollapsed ? '▶' : '▼'}
                                          </span>
                                        ) : null}
                                      </div>
                                      
                                      {hasDetails && !isCollapsed ? (
                                        <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                                          {tc.args ? (
                                            <div>
                                              <div className="text-xs font-medium mb-1" style={{ color: 'var(--fg-subtle)' }}>Arguments:</div>
                                              <code className="block text-xs p-2 rounded bg-gray-100 dark:bg-gray-800 break-words">
                                                {safeJson(tc.args) || ''}
                                              </code>
                                            </div>
                                          ) : null}
                                          {tc.result ? (
                                            <div>
                                              <div className="text-xs font-medium mb-1" style={{ color: 'var(--fg-subtle)' }}>Result:</div>
                                              <code className="block text-xs p-2 rounded bg-gray-100 dark:bg-gray-800 break-words">
                                                {safeJson(tc.result) || ''}
                                              </code>
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    loading ? (
                      <span className="opacity-70 flex items-center gap-2">
                        <span className="animate-pulse">●</span>
                        <span>typing…</span>
                      </span>
                    ) : null
                  )
                ) : (
                  <span className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{m.content}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div 
          id="error-message"
          className="text-sm" 
          style={{ color: 'var(--error)' }}
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="input"
          type="text"
          inputMode={hasAssistantResponded ? 'text' : 'numeric'}
          autoComplete={hasAssistantResponded ? 'on' : 'postal-code'}
          pattern={hasAssistantResponded ? undefined : "\\d{5}"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' && !e.shiftKey ? onSend() : undefined)}
          placeholder={hasAssistantResponded ? 'Ask anything about the weather…' : 'Enter your zipcode here'}
          aria-label={hasAssistantResponded ? 'Ask anything about the weather' : 'Enter your 5-digit ZIP code'}
          aria-describedby={error ? 'error-message' : undefined}
        />
        <button 
          className="btn whitespace-nowrap" 
          onClick={onSend} 
          disabled={loading}
          aria-label={loading ? 'Processing request' : 'Send message'}
          aria-describedby={loading ? 'loading-text' : undefined}
        >
          {loading ? 'Processing...' : 'Ask'}
        </button>
        {loading && (
          <div id="loading-text" className="sr-only">
            Processing your weather request, please wait...
          </div>
        )}
      </div>

      <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
        Connected to agent: <code style={{ color: 'var(--fg)' }}>{getWeatherAgentId()}</code> at <code style={{ color: 'var(--fg)' }}>{(import.meta as any).env?.VITE_MASTRA_API_HOST || 'localhost:4000'}</code>
      </div>
    </div>
  )
}
