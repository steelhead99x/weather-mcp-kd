/**
 * Monitoring and debugging utilities for streamVNext
 * Provides performance tracking, error analysis, and debugging capabilities
 */

import { useEffect, useState } from 'react'
import type { StreamMetrics, StreamVNextError } from '../types/streamVNext'

export interface StreamVNextMonitorConfig {
  enableConsoleLogging: boolean
  enablePerformanceTracking: boolean
  enableErrorTracking: boolean
  enableMetricsCollection: boolean
  maxMetricsHistory: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface StreamVNextMonitorData {
  totalStreams: number
  successfulStreams: number
  failedStreams: number
  averageDuration: number
  averageChunksPerStream: number
  averageBytesPerStream: number
  errorCounts: Record<string, number>
  performanceHistory: StreamMetrics[]
  recentErrors: StreamVNextError[]
}

export class StreamVNextMonitor {
  private config: StreamVNextMonitorConfig
  private data: StreamVNextMonitorData
  private startTime: number

  constructor(config: Partial<StreamVNextMonitorConfig> = {}) {
    this.config = {
      enableConsoleLogging: true,
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableMetricsCollection: true,
      maxMetricsHistory: 100,
      logLevel: 'info',
      ...config
    }

    this.data = {
      totalStreams: 0,
      successfulStreams: 0,
      failedStreams: 0,
      averageDuration: 0,
      averageChunksPerStream: 0,
      averageBytesPerStream: 0,
      errorCounts: {},
      performanceHistory: [],
      recentErrors: []
    }

    this.startTime = Date.now()
  }

  /**
   * Log a message with appropriate level
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableConsoleLogging) return

    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    const currentLevel = levels[this.config.logLevel]
    const messageLevel = levels[level]

    if (messageLevel >= currentLevel) {
      const timestamp = new Date().toISOString()
      const prefix = `[StreamVNext ${level.toUpperCase()}] ${timestamp}`
      
      if (data) {
        console[level](prefix, message, data)
      } else {
        console[level](prefix, message)
      }
    }
  }

  /**
   * Track stream start
   */
  onStreamStart(options: any): void {
    this.data.totalStreams++
    this.log('debug', 'Stream started', { options })
  }

  /**
   * Track stream completion
   */
  onStreamComplete(metrics: StreamMetrics): void {
    this.data.successfulStreams++
    
    if (this.config.enablePerformanceTracking) {
      this.updatePerformanceMetrics(metrics)
    }

    this.log('info', 'Stream completed', {
      duration: metrics.endTime ? metrics.endTime - metrics.startTime : 'N/A',
      chunks: metrics.chunksReceived,
      bytes: metrics.bytesReceived,
      errors: metrics.errors,
      retries: metrics.retries
    })
  }

  /**
   * Track stream error
   */
  onStreamError(error: StreamVNextError, metrics: StreamMetrics): void {
    this.data.failedStreams++
    
    if (this.config.enableErrorTracking) {
      this.trackError(error)
    }

    this.log('error', 'Stream failed', {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      metrics
    })
  }

  /**
   * Track chunk processing
   */
  onChunkProcessed(chunk: any, metrics: StreamMetrics): void {
    this.log('debug', 'Chunk processed', {
      type: chunk.type,
      size: chunk.content ? chunk.content.length : 0,
      totalChunks: metrics.chunksReceived
    })
  }

  /**
   * Track retry attempt
   */
  onRetry(attempt: number, error: StreamVNextError): void {
    this.log('warn', `Retry attempt ${attempt}`, {
      error: error.message,
      code: error.code
    })
  }

  /**
   * Get current monitoring data
   */
  getData(): StreamVNextMonitorData {
    return { ...this.data }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    uptime: number
    successRate: number
    averageDuration: number
    totalErrors: number
    topErrors: Array<{ code: string; count: number }>
  } {
    const uptime = Date.now() - this.startTime
    const successRate = this.data.totalStreams > 0 
      ? (this.data.successfulStreams / this.data.totalStreams) * 100 
      : 0

    const topErrors = Object.entries(this.data.errorCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      uptime,
      successRate,
      averageDuration: this.data.averageDuration,
      totalErrors: this.data.failedStreams,
      topErrors
    }
  }

  /**
   * Export monitoring data for analysis
   */
  exportData(): string {
    return JSON.stringify({
      config: this.config,
      data: this.data,
      summary: this.getPerformanceSummary(),
      timestamp: new Date().toISOString()
    }, null, 2)
  }

  /**
   * Reset monitoring data
   */
  reset(): void {
    this.data = {
      totalStreams: 0,
      successfulStreams: 0,
      failedStreams: 0,
      averageDuration: 0,
      averageChunksPerStream: 0,
      averageBytesPerStream: 0,
      errorCounts: {},
      performanceHistory: [],
      recentErrors: []
    }
    this.startTime = Date.now()
    this.log('info', 'Monitoring data reset')
  }

  private updatePerformanceMetrics(metrics: StreamMetrics): void {
    if (!this.config.enableMetricsCollection) return

    // Add to history
    this.data.performanceHistory.push({ ...metrics })
    
    // Keep only recent metrics
    if (this.data.performanceHistory.length > this.config.maxMetricsHistory) {
      this.data.performanceHistory = this.data.performanceHistory.slice(-this.config.maxMetricsHistory)
    }

    // Update averages
    const durations = this.data.performanceHistory
      .filter(m => m.endTime)
      .map(m => m.endTime! - m.startTime)
    
    this.data.averageDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0

    this.data.averageChunksPerStream = this.data.performanceHistory.length > 0
      ? this.data.performanceHistory.reduce((sum, m) => sum + m.chunksReceived, 0) / this.data.performanceHistory.length
      : 0

    this.data.averageBytesPerStream = this.data.performanceHistory.length > 0
      ? this.data.performanceHistory.reduce((sum, m) => sum + m.bytesReceived, 0) / this.data.performanceHistory.length
      : 0
  }

  private trackError(error: StreamVNextError): void {
    // Count errors by code
    const code = error.code || 'UNKNOWN_ERROR'
    this.data.errorCounts[code] = (this.data.errorCounts[code] || 0) + 1

    // Keep recent errors
    this.data.recentErrors.push({ ...error })
    if (this.data.recentErrors.length > 50) {
      this.data.recentErrors = this.data.recentErrors.slice(-50)
    }
  }
}

/**
 * Global monitor instance
 */
export const globalStreamVNextMonitor = new StreamVNextMonitor({
  enableConsoleLogging: process.env.NODE_ENV === 'development',
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
})

/**
 * React hook for monitoring streamVNext performance
 */
export function useStreamVNextMonitoring() {
  const [monitorData, setMonitorData] = useState(globalStreamVNextMonitor.getData())
  const [summary, setSummary] = useState(globalStreamVNextMonitor.getPerformanceSummary())

  useEffect(() => {
    const interval = setInterval(() => {
      setMonitorData(globalStreamVNextMonitor.getData())
      setSummary(globalStreamVNextMonitor.getPerformanceSummary())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return {
    data: monitorData,
    summary,
    exportData: () => globalStreamVNextMonitor.exportData(),
    reset: () => globalStreamVNextMonitor.reset()
  }
}

/**
 * Debug utility for streamVNext
 */
export function debugStreamVNext(response: any): void {
  console.group('🔍 StreamVNext Debug Info')
  
  console.log('Response type:', typeof response)
  console.log('Response keys:', response ? Object.keys(response) : 'null')
  
  if (response.textStream) {
    console.log('✅ textStream available:', typeof response.textStream)
    console.log('textStream is AsyncIterable:', Symbol.asyncIterator in response.textStream)
  }
  
  if (response.fullStream) {
    console.log('✅ fullStream available:', typeof response.fullStream)
    console.log('fullStream is AsyncIterable:', Symbol.asyncIterator in response.fullStream)
  }
  
  if (response.metadata) {
    console.log('📊 Metadata:', response.metadata)
  }
  
  console.groupEnd()
}
