/**
 * Enhanced TypeScript types for streamVNext implementation
 * Provides better type safety and IntelliSense support
 */

export interface StreamVNextOptions {
  format?: 'mastra' | 'openai' | 'anthropic'
  system?: string
  memory?: {
    thread?: string
    resource?: string
  }
  temperature?: number
  maxTokens?: number
  timeout?: number
  retries?: number
  abortSignal?: AbortSignal
}

export interface StreamVNextResponse {
  textStream?: AsyncIterable<string>
  fullStream?: AsyncIterable<StreamChunk>
  metadata?: StreamMetadata
  // Optional HTTP-like fields to support broader response shapes
  body?: ReadableStream
  stream?: ReadableStream
  text?: string
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'metadata'
  content?: string
  toolName?: string
  toolArgs?: Record<string, any>
  toolResult?: any
  error?: string
  timestamp?: number
}

export interface StreamMetadata {
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error'
  duration?: number
}

export interface StreamVNextError extends Error {
  code?: string
  status?: number
  retryable?: boolean
  details?: any
}

export interface StreamVNextAgent {
  streamVNext(
    message: string,
    options?: StreamVNextOptions
  ): Promise<StreamVNextResponse>
}

export interface StreamVNextConfig {
  defaultTimeout: number
  maxRetries: number
  retryDelay: number
  chunkBufferSize: number
  enableMetrics: boolean
}

export interface StreamMetrics {
  startTime: number
  endTime?: number
  chunksReceived: number
  bytesReceived: number
  errors: number
  retries: number
}

export interface StreamVNextHook {
  onStart?: (options: StreamVNextOptions) => void
  onChunk?: (chunk: StreamChunk, metrics: StreamMetrics) => void
  onError?: (error: StreamVNextError, metrics: StreamMetrics) => void
  onComplete?: (metrics: StreamMetrics) => void
  onRetry?: (attempt: number, error: StreamVNextError) => void
}
