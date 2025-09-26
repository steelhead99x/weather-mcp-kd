/**
 * Enhanced streamVNext utility with improved error handling, performance, and monitoring
 */

import type {
  StreamVNextOptions,
  StreamVNextResponse,
  StreamChunk,
  StreamVNextError,
  StreamMetrics,
  StreamVNextHook,
  StreamVNextConfig
} from '../types/streamVNext'

export class StreamVNextEnhanced {
  private config: StreamVNextConfig
  private metrics!: StreamMetrics
  private hooks: StreamVNextHook

  constructor(config: Partial<StreamVNextConfig> = {}, hooks: StreamVNextHook = {}) {
    this.config = {
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      chunkBufferSize: 1024,
      enableMetrics: true,
      ...config
    }
    
    this.hooks = hooks
    this.initializeMetrics()
  }

  private initializeMetrics(): void {
    this.metrics = {
      startTime: Date.now(),
      chunksReceived: 0,
      bytesReceived: 0,
      errors: 0,
      retries: 0
    }
  }

  /**
   * Enhanced streamVNext with retry logic, error handling, and metrics
   */
  async streamVNext(
    agent: any,
    message: string,
    options: StreamVNextOptions = {}
  ): Promise<StreamVNextResponse> {
    this.initializeMetrics()
    
    const finalOptions: StreamVNextOptions = {
      timeout: this.config.defaultTimeout,
      retries: this.config.maxRetries,
      ...options
    }

    this.hooks.onStart?.(finalOptions)

    let lastError: StreamVNextError | null = null
    
    for (let attempt = 0; attempt <= (finalOptions.retries || 0); attempt++) {
      try {
        if (attempt > 0) {
          this.metrics.retries++
          this.hooks.onRetry?.(attempt, lastError!)
          
          // Exponential backoff with jitter
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          await this.sleep(delay)
        }

        const response = await this.executeStreamVNext(agent, message, finalOptions)
        this.metrics.endTime = Date.now()
        this.hooks.onComplete?.(this.metrics)
        
        return response
        
      } catch (error) {
        lastError = this.normalizeError(error)
        this.metrics.errors++
        this.hooks.onError?.(lastError, this.metrics)
        
        // Don't retry on non-retryable errors
        if (!lastError.retryable || attempt >= (finalOptions.retries || 0)) {
          throw lastError
        }
      }
    }
    
    throw lastError!
  }

  private async executeStreamVNext(
    agent: any,
    message: string,
    options: StreamVNextOptions
  ): Promise<StreamVNextResponse> {
    if (!agent || typeof agent.streamVNext !== 'function') {
      throw this.createError('Agent streamVNext method not available', 'AGENT_ERROR', false)
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, options.timeout || this.config.defaultTimeout)

    try {
      const response = await agent.streamVNext(message, {
        ...options,
        abortSignal: controller.signal
      })

      clearTimeout(timeoutId)
      return this.validateResponse(response)
      
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (controller.signal.aborted) {
        throw this.createError('Request timeout', 'TIMEOUT', true)
      }
      
      throw error
    }
  }

  private validateResponse(response: any): StreamVNextResponse {
    if (!response || typeof response !== 'object') {
      throw this.createError('Invalid response format', 'INVALID_RESPONSE', false)
    }

    // Check for at least one valid stream
    const hasTextStream = response.textStream && typeof response.textStream[Symbol.asyncIterator] === 'function'
    const hasFullStream = response.fullStream && typeof response.fullStream[Symbol.asyncIterator] === 'function'
    const hasAsyncIterator = Symbol.asyncIterator in Object(response)

    if (!hasTextStream && !hasFullStream && !hasAsyncIterator) {
      throw this.createError('No valid streaming method found in response', 'NO_STREAM', false)
    }

    return response as StreamVNextResponse
  }

  /**
   * Process stream chunks with enhanced error handling and metrics
   */
  async processStream(
    response: StreamVNextResponse,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      if (response.textStream) {
        await this.processTextStream(response.textStream, onChunk)
      } else if (response.fullStream) {
        await this.processFullStream(response.fullStream, onChunk)
      } else if (Symbol.asyncIterator in Object(response)) {
        await this.processGenericStream(response as any, onChunk)
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error)
      this.metrics.errors++
      this.hooks.onError?.(normalizedError, this.metrics)
      throw normalizedError
    }
  }

  private async processTextStream(
    textStream: AsyncIterable<string>,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    for await (const textChunk of textStream) {
      if (textChunk && typeof textChunk === 'string' && textChunk.length > 0) {
        this.metrics.chunksReceived++
        this.metrics.bytesReceived += textChunk.length
        
        const chunk: StreamChunk = {
          type: 'text',
          content: textChunk,
          timestamp: Date.now()
        }
        
        onChunk(chunk)
        this.hooks.onChunk?.(chunk, this.metrics)
      }
    }
  }

  private async processFullStream(
    fullStream: AsyncIterable<StreamChunk>,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    for await (const chunk of fullStream) {
      if (chunk && typeof chunk === 'object') {
        this.metrics.chunksReceived++
        this.metrics.bytesReceived += JSON.stringify(chunk).length
        
        const enhancedChunk: StreamChunk = {
          ...chunk,
          timestamp: chunk.timestamp || Date.now()
        }
        
        onChunk(enhancedChunk)
        this.hooks.onChunk?.(enhancedChunk, this.metrics)
      }
    }
  }

  private async processGenericStream(
    stream: AsyncIterable<any>,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    for await (const item of stream) {
      if (item) {
        this.metrics.chunksReceived++
        this.metrics.bytesReceived += JSON.stringify(item).length
        
        const chunk: StreamChunk = {
          type: item.type || 'text',
          content: item.content || item.text || String(item),
          timestamp: Date.now()
        }
        
        onChunk(chunk)
        this.hooks.onChunk?.(chunk, this.metrics)
      }
    }
  }

  private normalizeError(error: unknown): StreamVNextError {
    if (error instanceof Error) {
      return {
        ...error,
        code: this.getErrorCode(error),
        retryable: this.isRetryableError(error)
      } as StreamVNextError
    }
    
    return this.createError(String(error), 'UNKNOWN_ERROR', false)
  }

  private getErrorCode(error: Error): string {
    const message = error.message.toLowerCase()
    
    if (message.includes('timeout')) return 'TIMEOUT'
    if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR'
    if (message.includes('abort')) return 'ABORTED'
    if (message.includes('json parse')) return 'PARSE_ERROR'
    if (message.includes('overloaded')) return 'OVERLOADED'
    if (message.includes('rate limit')) return 'RATE_LIMIT'
    if (message.includes('unauthorized') || message.includes('401')) return 'UNAUTHORIZED'
    if (message.includes('forbidden') || message.includes('403')) return 'FORBIDDEN'
    if (message.includes('not found') || message.includes('404')) return 'NOT_FOUND'
    
    return 'UNKNOWN_ERROR'
  }

  private isRetryableError(error: Error): boolean {
    const code = this.getErrorCode(error)
    const retryableCodes = ['TIMEOUT', 'NETWORK_ERROR', 'OVERLOADED', 'RATE_LIMIT']
    return retryableCodes.includes(code)
  }

  private createError(message: string, code: string, retryable: boolean): StreamVNextError {
    const error = new Error(message) as StreamVNextError
    error.code = code
    error.retryable = retryable
    return error
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset metrics (public method)
   */
  public resetMetrics(): void {
    this.initializeMetrics()
  }

}

/**
 * Factory function to create enhanced streamVNext instance
 */
export function createStreamVNextEnhanced(
  config?: Partial<StreamVNextConfig>,
  hooks?: StreamVNextHook
): StreamVNextEnhanced {
  return new StreamVNextEnhanced(config, hooks)
}

/**
 * Utility function for common streamVNext patterns
 */
export async function streamVNextWithRetry(
  agent: any,
  message: string,
  options: StreamVNextOptions = {},
  maxRetries: number = 3
): Promise<StreamVNextResponse> {
  const enhanced = createStreamVNextEnhanced({ maxRetries })
  return enhanced.streamVNext(agent, message, options)
}
