/**
 * React hook for enhanced streamVNext functionality
 * Provides better state management, error handling, and performance optimizations
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createStreamVNextEnhanced } from '../utils/streamVNextEnhanced'
import type {
  StreamVNextOptions,
  StreamChunk,
  StreamMetrics
} from '../types/streamVNext'

export interface UseStreamVNextState {
  isLoading: boolean
  error: string | null
  isStreaming: boolean
  metrics: StreamMetrics | null
  retryCount: number
}

export interface UseStreamVNextReturn {
  state: UseStreamVNextState
  streamVNext: (agent: any, message: string, options?: StreamVNextOptions) => Promise<void>
  reset: () => void
  retry: () => Promise<void>
}

export interface UseStreamVNextOptions {
  onChunk?: (chunk: StreamChunk) => void
  onComplete?: (metrics: StreamMetrics) => void
  onError?: (error: Error, metrics: StreamMetrics) => void
  maxRetries?: number
  timeout?: number
  enableMetrics?: boolean
}

export function useStreamVNext(options: UseStreamVNextOptions = {}): UseStreamVNextReturn {
  const [state, setState] = useState<UseStreamVNextState>({
    isLoading: false,
    error: null,
    isStreaming: false,
    metrics: null,
    retryCount: 0
  })

  const lastRequestRef = useRef<{
    agent: any
    message: string
    options: StreamVNextOptions
  } | null>(null)

  const enhancedRef = useRef(createStreamVNextEnhanced({
    maxRetries: options.maxRetries || 3,
    defaultTimeout: options.timeout || 30000,
    enableMetrics: options.enableMetrics !== false
  }, {
    onStart: () => {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        isStreaming: true
      }))
    },
    onChunk: (chunk, metrics) => {
      options.onChunk?.(chunk)
      setState(prev => ({
        ...prev,
        metrics: { ...metrics }
      }))
    },
    onError: (error, metrics) => {
      setState(prev => ({
        ...prev,
        error: error.message,
        isLoading: false,
        isStreaming: false,
        metrics: { ...metrics }
      }))
      options.onError?.(error, metrics)
    },
    onComplete: (metrics) => {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        metrics: { ...metrics },
        retryCount: 0
      }))
      options.onComplete?.(metrics)
    },
    onRetry: (attempt, error) => {
      setState(prev => ({
        ...prev,
        retryCount: attempt,
        error: `Retrying... (${attempt}/${options.maxRetries || 3}): ${error.message}`
      }))
    }
  }))

  const streamVNext = useCallback(async (
    agent: any,
    message: string,
    streamOptions: StreamVNextOptions = {}
  ) => {
    try {
      lastRequestRef.current = { agent, message, options: streamOptions }
      
      const response = await enhancedRef.current.streamVNext(agent, message, streamOptions)
      
      // Process the stream
      await enhancedRef.current.processStream(response, (chunk) => {
        options.onChunk?.(chunk)
      })
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      setState(prev => ({
        ...prev,
        error: err.message,
        isLoading: false,
        isStreaming: false
      }))
      options.onError?.(err, enhancedRef.current.getMetrics())
    }
  }, [options])

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      isStreaming: false,
      metrics: null,
      retryCount: 0
    })
    lastRequestRef.current = null
    enhancedRef.current.resetMetrics()
  }, [])

  const retry = useCallback(async () => {
    if (lastRequestRef.current) {
      await streamVNext(
        lastRequestRef.current.agent,
        lastRequestRef.current.message,
        lastRequestRef.current.options
      )
    }
  }, [streamVNext])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  return {
    state,
    streamVNext,
    reset,
    retry
  }
}

/**
 * Hook for managing multiple concurrent streams
 */
export function useStreamVNextPool(maxConcurrent: number = 3) {
  const [streams, setStreams] = useState<Map<string, UseStreamVNextState>>(new Map())
  const activeStreamsRef = useRef<Set<string>>(new Set())

  const createStream = useCallback((id: string, options: UseStreamVNextOptions = {}) => {
    const stream = useStreamVNext(options)
    
    setStreams(prev => {
      const newMap = new Map(prev)
      newMap.set(id, stream.state)
      return newMap
    })

    return stream
  }, [])

  const removeStream = useCallback((id: string) => {
    setStreams(prev => {
      const newMap = new Map(prev)
      newMap.delete(id)
      return newMap
    })
    activeStreamsRef.current.delete(id)
  }, [])

  const canStartNewStream = useCallback(() => {
    return activeStreamsRef.current.size < maxConcurrent
  }, [maxConcurrent])

  return {
    streams: Array.from(streams.entries()),
    createStream,
    removeStream,
    canStartNewStream,
    activeCount: activeStreamsRef.current.size,
    maxConcurrent
  }
}

/**
 * Hook for debounced streamVNext calls
 */
export function useDebouncedStreamVNext(
  delay: number = 500,
  options: UseStreamVNextOptions = {}
) {
  const [debouncedMessage, setDebouncedMessage] = useState<string>('')
  const streamVNextHook = useStreamVNext(options)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMessage(streamVNextHook.state.isLoading ? '' : debouncedMessage)
    }, delay)

    return () => clearTimeout(timer)
  }, [debouncedMessage, delay, streamVNextHook.state.isLoading])

  const streamVNext = useCallback(async (
    agent: any,
    message: string,
    streamOptions: StreamVNextOptions = {}
  ) => {
    setDebouncedMessage(message)
    await streamVNextHook.streamVNext(agent, message, streamOptions)
  }, [streamVNextHook])

  return {
    ...streamVNextHook,
    streamVNext,
    debouncedMessage
  }
}
