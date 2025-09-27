import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { getMastraBaseUrl, mastra } from '../lib/mastraClient'

interface MCPToolCall {
  id: string
  toolName: string
  timestamp: Date
  status: 'called' | 'result' | 'error' | 'pending'
  args?: any
  result?: any
  error?: string
  duration?: number
  agentId?: string
}

interface MCPServerInfo {
  host: string
  baseUrl: string
  agentId: string
  lastPing?: Date
  responseTime?: number
  version?: string
  mcpServers?: Array<{
    name: string
    status: 'connected' | 'disconnected' | 'error'
    tools: string[]
    lastSeen?: Date
  }>
}

interface MCPDebugInfo {
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'testing'
  lastError?: string
  toolCalls: MCPToolCall[]
  serverInfo?: MCPServerInfo
  metrics: {
    totalToolCalls: number
    successfulCalls: number
    failedCalls: number
    averageResponseTime: number
    lastCallTime?: Date
  }
}

const MCPDebugPanel = memo(function MCPDebugPanel() {
  const [debugInfo, setDebugInfo] = useState<MCPDebugInfo>({
    connectionStatus: 'testing',
    toolCalls: [],
    metrics: {
      totalToolCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0
    }
  })
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDebugEnabled, setIsDebugEnabled] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'status' | 'tools' | 'logs' | 'metrics'>('status')
  const [performanceWarning, setPerformanceWarning] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const toolCallInterceptorRef = useRef<Map<string, MCPToolCall>>(new Map())
  const originalConsoleRef = useRef<{
    log: typeof console.log
    error: typeof console.error
    warn: typeof console.warn
  } | null>(null)
  const performanceMonitorRef = useRef<{
    logCount: number
    toolCallCount: number
    lastCheck: number
  }>({ logCount: 0, toolCallCount: 0, lastCheck: Date.now() })

  // Store original console methods
  useEffect(() => {
    if (!originalConsoleRef.current) {
      originalConsoleRef.current = {
        log: console.log,
        error: console.error,
        warn: console.warn
      }
    }
  }, [])

  // Toggleable console interceptor - always active but conditionally processes
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !originalConsoleRef.current) return

    const { log: originalLog, error: originalError, warn: originalWarn } = originalConsoleRef.current

    // Debounce log updates to prevent excessive re-renders and memory issues
    let logUpdateTimeout: NodeJS.Timeout | null = null
    const pendingLogs: string[] = []
    const maxLogs = 30 // Further reduced to prevent memory issues

    const processPendingLogs = () => {
      if (pendingLogs.length > 0) {
        setLogs(prev => {
          const newLogs = [...prev, ...pendingLogs]
          return newLogs.slice(-maxLogs) // Keep only last 30 logs
        })
        pendingLogs.length = 0
      }
    }

    const logInterceptor = (level: string, originalFn: typeof console.log) => {
      return (...args: any[]) => {
        // Always call original function first
        originalFn(...args)
        
        // Only process logs when debug is enabled (check current state)
        if (isDebugEnabled) {
          // Track performance
          performanceMonitorRef.current.logCount++
          
          // Limit log message length to prevent memory issues
          const message = `[${level}] ${new Date().toISOString()}: ${args.map(arg => {
            const str = typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            return str.length > 300 ? str.substring(0, 300) + '...' : str // Further truncate
          }).join(' ')}`
          
          // Add to pending logs instead of immediate state update
          pendingLogs.push(message)
          
          // Detect tool calls in logs (optimized)
          detectToolCallsInLogs(message, args)
          
          // Debounce log updates with longer delay to reduce memory pressure
          if (logUpdateTimeout) clearTimeout(logUpdateTimeout)
          logUpdateTimeout = setTimeout(processPendingLogs, 500) // Increased delay
        }
      }
    }

    console.log = logInterceptor('LOG', originalLog)
    console.error = logInterceptor('ERROR', originalError)
    console.warn = logInterceptor('WARN', originalWarn)

    return () => {
      if (logUpdateTimeout) clearTimeout(logUpdateTimeout)
      // Restore original console methods
      if (originalConsoleRef.current) {
        console.log = originalConsoleRef.current.log
        console.error = originalConsoleRef.current.error
        console.warn = originalConsoleRef.current.warn
      }
    }
  }, [isDebugEnabled])

  // Memory-optimized tool call detection function with debouncing
  const detectToolCallsInLogs = useCallback((message: string, args: any[]) => {
    // Only detect tool calls when debug is enabled
    if (!isDebugEnabled) return

    // Look for patterns that indicate tool calls - more specific patterns
    const toolCallPatterns = [
      /\[askWeatherAgent\]/,
      /\[streamVNext\]/,
      /\[MCPDebug\]/,
      /Tool call:/,
      /Agent response:/,
      /MCP server/,
      /weather.*tool/i,
      /mux.*tool/i,
      /tool.*call/i,
      /agent.*call/i
    ]

    const isToolCall = toolCallPatterns.some(pattern => pattern.test(message))
    
    if (isToolCall) {
      const toolCall: MCPToolCall = {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        toolName: extractToolName(message),
        timestamp: new Date(),
        status: 'called',
        args: args.length > 1 ? args.slice(1) : undefined
      }

      // Use functional update to prevent unnecessary re-renders and limit memory usage
      setDebugInfo(prev => {
        const newToolCalls = [toolCall, ...prev.toolCalls].slice(0, 20) // Further reduced to 20
        return {
          ...prev,
          toolCalls: newToolCalls,
          metrics: {
            ...prev.metrics,
            totalToolCalls: prev.metrics.totalToolCalls + 1,
            lastCallTime: new Date()
          }
        }
      })
    }
  }, [isDebugEnabled])

  // Function to manually add tool calls (for integration with actual MCP operations)
  const addToolCall = useCallback((toolName: string, status: 'called' | 'result' | 'error' | 'pending' = 'called', args?: any, result?: any, error?: string, duration?: number) => {
    // Only add tool calls when debug is enabled
    if (!isDebugEnabled) return

    // Track performance
    performanceMonitorRef.current.toolCallCount++

    const toolCall: MCPToolCall = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolName,
      timestamp: new Date(),
      status,
      args,
      result,
      error,
      duration
    }

    setDebugInfo(prev => {
      const newToolCalls = [toolCall, ...prev.toolCalls].slice(0, 20) // Further reduced to 20
      
      // Update metrics based on status
      let newMetrics = { ...prev.metrics }
      if (status === 'called') {
        newMetrics.totalToolCalls += 1
        newMetrics.lastCallTime = new Date()
      } else if (status === 'result') {
        newMetrics.successfulCalls += 1
        if (duration) {
          // Update average response time
          const totalCalls = newMetrics.successfulCalls + newMetrics.failedCalls
          newMetrics.averageResponseTime = totalCalls > 0 
            ? (newMetrics.averageResponseTime * (totalCalls - 1) + duration) / totalCalls
            : duration
        }
      } else if (status === 'error') {
        newMetrics.failedCalls += 1
      }

      return {
        ...prev,
        toolCalls: newToolCalls,
        metrics: newMetrics
      }
    })
  }, [isDebugEnabled])

  const extractToolName = (message: string): string => {
    const patterns = [
      /\[(\w+)\]/,
      /Tool call: (\w+)/,
      /Calling (\w+)/
    ]
    
    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) return match[1]
    }
    
    return 'unknown'
  }

  // Enhanced connection testing with metrics
  const testConnection = useCallback(async () => {
    const startTime = Date.now()
    
    try {
      setDebugInfo(prev => ({ ...prev, connectionStatus: 'testing' }))
      
      const baseUrl = getMastraBaseUrl()
      const healthUrl = baseUrl.endsWith('/') ? `${baseUrl}health` : `${baseUrl}/health`
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache'
      })
      
      const responseTime = Date.now() - startTime
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        
        setDebugInfo(prev => ({ 
          ...prev, 
          connectionStatus: 'connected',
          lastError: undefined,
          serverInfo: {
            ...prev.serverInfo,
            host: new URL(baseUrl).hostname,
            baseUrl,
            agentId: import.meta.env.VITE_WEATHER_AGENT_ID || 'weather',
            lastPing: new Date(),
            responseTime,
            version: data.version || 'unknown'
          }
        }))
      } else {
        setDebugInfo(prev => ({ 
          ...prev, 
          connectionStatus: 'error',
          lastError: `HTTP ${response.status}: ${response.statusText}`
        }))
      }
    } catch (error) {
      setDebugInfo(prev => ({ 
        ...prev, 
        connectionStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  // Dynamic polling for MCP server discovery
  const discoverMCPServers = useCallback(async () => {
    try {
      // Try to get dynamic toolsets from Mastra client
      if (mastra.getDynamicToolsets) {
        const toolsets = await mastra.getDynamicToolsets()
        
        const mcpServers = Object.entries(toolsets).map(([name, toolset]: [string, any]) => ({
          name,
          status: 'connected' as const,
          tools: Array.isArray(toolset.tools) ? toolset.tools : [],
          lastSeen: new Date()
        }))

        setDebugInfo(prev => ({
          ...prev,
          serverInfo: {
            ...prev.serverInfo!,
            mcpServers
          }
        }))
      }
    } catch (error) {
      console.warn('[MCPDebug] Failed to discover MCP servers:', error)
    }
  }, [])

  // Setup optimized polling intervals - only when debug is enabled
  useEffect(() => {
    if (!isDebugEnabled) {
      // Clear any existing intervals when debug is disabled
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      return
    }

    testConnection()
    discoverMCPServers()
    
    // Test connection every 60 seconds (reduced frequency)
    const connectionInterval = setInterval(testConnection, 60000)
    
    // Discover MCP servers every 120 seconds (reduced frequency)
    const discoveryInterval = setInterval(discoverMCPServers, 120000)
    
    pollingIntervalRef.current = connectionInterval
    
    return () => {
      clearInterval(connectionInterval)
      clearInterval(discoveryInterval)
      pollingIntervalRef.current = null
    }
  }, [testConnection, discoverMCPServers, isDebugEnabled])

  const clearLogs = useCallback(() => {
    setLogs([])
    // Force garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc()
    }
  }, [])

  const clearToolCalls = useCallback(() => {
    setDebugInfo(prev => ({
      ...prev,
      toolCalls: [],
      metrics: {
        totalToolCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageResponseTime: 0,
        lastCallTime: undefined
      }
    }))
    // Force garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc()
    }
  }, [])

  // Auto-cleanup function to prevent memory leaks
  const autoCleanup = useCallback(() => {
    if (!isDebugEnabled) return

    // Clean up old logs (keep only last 20)
    setLogs(prev => prev.slice(-20))
    
    // Clean up old tool calls (keep only last 15)
    setDebugInfo(prev => ({
      ...prev,
      toolCalls: prev.toolCalls.slice(-15)
    }))
  }, [isDebugEnabled])

  // Auto-cleanup every 30 seconds when debug is enabled
  useEffect(() => {
    if (!isDebugEnabled) return

    const cleanupInterval = setInterval(autoCleanup, 30000)
    return () => clearInterval(cleanupInterval)
  }, [isDebugEnabled, autoCleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all intervals
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      
      // Restore original console methods
      if (originalConsoleRef.current) {
        console.log = originalConsoleRef.current.log
        console.error = originalConsoleRef.current.error
        console.warn = originalConsoleRef.current.warn
      }
    }
  }, [])

  // Performance monitoring
  useEffect(() => {
    if (!isDebugEnabled) {
      setPerformanceWarning(false)
      // Reset performance counters when debug is disabled
      performanceMonitorRef.current = {
        logCount: 0,
        toolCallCount: 0,
        lastCheck: Date.now()
      }
      return
    }

    const checkPerformance = () => {
      const now = Date.now()
      const timeDiff = now - performanceMonitorRef.current.lastCheck
      const logRate = performanceMonitorRef.current.logCount / (timeDiff / 1000)
      const toolCallRate = performanceMonitorRef.current.toolCallCount / (timeDiff / 1000)
      
      // Warn if we're processing more than 10 logs per second or 5 tool calls per second
      const isHighLoad = logRate > 10 || toolCallRate > 5
      setPerformanceWarning(isHighLoad)
      
      // Reset counters
      performanceMonitorRef.current = {
        logCount: 0,
        toolCallCount: 0,
        lastCheck: now
      }
    }

    const performanceInterval = setInterval(checkPerformance, 5000) // Check every 5 seconds
    return () => clearInterval(performanceInterval)
  }, [isDebugEnabled])

  // Reset debug state when disabled
  useEffect(() => {
    if (!isDebugEnabled) {
      // Clear logs and tool calls when debug is disabled
      setLogs([])
      setDebugInfo(prev => ({
        ...prev,
        toolCalls: [],
        metrics: {
          totalToolCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          averageResponseTime: 0,
          lastCallTime: undefined
        }
      }))
    }
  }, [isDebugEnabled])

  // Export functionality
  const exportData = useCallback((format: 'json' | 'csv' | 'txt' = 'json') => {
    const exportData = {
      timestamp: new Date().toISOString(),
      connectionStatus: debugInfo.connectionStatus,
      serverInfo: debugInfo.serverInfo,
      toolCalls: debugInfo.toolCalls,
      metrics: debugInfo.metrics,
      logs: logs,
      environment: {
        mode: import.meta.env.MODE,
        weatherAgentId: import.meta.env.VITE_WEATHER_AGENT_ID,
        mastraApiHost: import.meta.env.VITE_MASTRA_API_HOST
      }
    }

    let content: string
    let filename: string
    let mimeType: string

    switch (format) {
      case 'json':
        content = JSON.stringify(exportData, null, 2)
        filename = `mcp-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
        mimeType = 'application/json'
        break
      
      case 'csv':
        const csvRows = [
          ['Type', 'Timestamp', 'Tool Name', 'Status', 'Duration (ms)', 'Args', 'Result', 'Error'],
          ...debugInfo.toolCalls.map(call => [
            'Tool Call',
            call.timestamp.toISOString(),
            call.toolName,
            call.status,
            call.duration || '',
            call.args ? JSON.stringify(call.args) : '',
            call.result ? JSON.stringify(call.result) : '',
            call.error || ''
          ]),
          ...logs.map((log, index) => [
            'Log',
            new Date().toISOString(),
            'Console',
            'info',
            '',
            '',
            '',
            log
          ])
        ]
        content = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
        filename = `mcp-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
        mimeType = 'text/csv'
        break
      
      case 'txt':
        content = `MCP Debug Panel Export
Generated: ${new Date().toISOString()}

CONNECTION STATUS: ${debugInfo.connectionStatus.toUpperCase()}
${debugInfo.lastError ? `Last Error: ${debugInfo.lastError}` : ''}

SERVER INFO:
${debugInfo.serverInfo ? `
  Host: ${debugInfo.serverInfo.host}
  Agent ID: ${debugInfo.serverInfo.agentId}
  Version: ${debugInfo.serverInfo.version}
  Response Time: ${debugInfo.serverInfo.responseTime}ms
  Last Ping: ${debugInfo.serverInfo.lastPing?.toISOString()}
` : 'No server info available'}

METRICS:
  Total Tool Calls: ${debugInfo.metrics.totalToolCalls}
  Successful: ${debugInfo.metrics.successfulCalls}
  Failed: ${debugInfo.metrics.failedCalls}
  Average Response Time: ${debugInfo.metrics.averageResponseTime.toFixed(2)}ms
  Success Rate: ${debugInfo.metrics.totalToolCalls > 0 
    ? ((debugInfo.metrics.successfulCalls / debugInfo.metrics.totalToolCalls) * 100).toFixed(1)
    : 0}%
  Last Call Time: ${debugInfo.metrics.lastCallTime?.toISOString() || 'Never'}

TOOL CALLS:
${debugInfo.toolCalls.length === 0 ? 'No tool calls recorded' : ''}
${debugInfo.toolCalls.map((call, index) => `
${index + 1}. [${call.status.toUpperCase()}] ${call.toolName}
   Time: ${call.timestamp.toISOString()}
   ${call.duration ? `Duration: ${call.duration}ms` : ''}
   ${call.args ? `Args: ${JSON.stringify(call.args, null, 2)}` : ''}
   ${call.result ? `Result: ${JSON.stringify(call.result, null, 2)}` : ''}
   ${call.error ? `Error: ${call.error}` : ''}
`).join('')}

LOGS:
${logs.length === 0 ? 'No logs recorded' : ''}
${logs.map((log, index) => `${index + 1}. ${log}`).join('\n')}

ENVIRONMENT:
  Mode: ${import.meta.env.MODE}
  Weather Agent ID: ${import.meta.env.VITE_WEATHER_AGENT_ID}
  Mastra API Host: ${import.meta.env.VITE_MASTRA_API_HOST}
`
        filename = `mcp-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
        mimeType = 'text/plain'
        break
    }

    // Create and download file
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Log the export
    console.log(`[MCPDebug] Data exported as ${format.toUpperCase()}: ${filename}`)
  }, [debugInfo, logs])

  // Expose functions globally for integration with other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).mcpDebugPanel = {
        addToolCall,
        testConnection,
        discoverMCPServers,
        exportData,
        clearToolCalls,
        clearLogs
      }
    }
  }, [addToolCall, testConnection, discoverMCPServers, exportData, clearToolCalls, clearLogs])

  const getStatusColor = (status: MCPDebugInfo['connectionStatus']) => {
    switch (status) {
      case 'connected': return 'var(--ok)'
      case 'disconnected': return 'var(--fg-subtle)'
      case 'error': return 'var(--error)'
      case 'testing': return 'var(--warn)'
      default: return 'var(--fg-subtle)'
    }
  }

  const getStatusIcon = (status: MCPDebugInfo['connectionStatus']) => {
    switch (status) {
      case 'connected': return '🟢'
      case 'disconnected': return '⚪'
      case 'error': return '🔴'
      case 'testing': return '🟡'
      default: return '❓'
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getToolCallStatusIcon = (status: MCPToolCall['status']) => {
    switch (status) {
      case 'called': return '📞'
      case 'result': return '✅'
      case 'error': return '❌'
      case 'pending': return '⏳'
      default: return '❓'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex flex-col items-end space-y-2">
        {/* Debug Toggle Button */}
        <button
          onClick={() => setIsDebugEnabled(!isDebugEnabled)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            isDebugEnabled 
              ? 'bg-green-600 text-white hover:bg-green-700' 
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
          title={isDebugEnabled ? 'Debug enabled - click to disable' : 'Debug disabled - click to enable'}
        >
          {isDebugEnabled ? '🟢 Debug ON' : '🔴 Debug OFF'}
        </button>
        
        {/* Main Debug Panel Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors relative"
        >
          <span className="mr-2">{getStatusIcon(debugInfo.connectionStatus)}</span>
          MCP Debug
          {isDebugEnabled && debugInfo.toolCalls.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {debugInfo.toolCalls.length}
            </span>
          )}
        </button>
      </div>
      
      {isExpanded && (
        <div className="absolute bottom-12 right-0 w-[500px] max-h-[600px] card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2 border-b" style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold" style={{ color: 'var(--fg)' }}>MCP Debug Panel</h3>
                <span className={`text-xs px-2 py-1 rounded ${
                  isDebugEnabled 
                    ? 'text-green-800' 
                    : 'text-red-800'
                }`} style={{
                  backgroundColor: isDebugEnabled ? 'var(--ok)' : 'var(--error)',
                  color: 'white'
                }}>
                  {isDebugEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {debugInfo.serverInfo?.responseTime && `${debugInfo.serverInfo.responseTime}ms`}
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--fg-subtle)' }}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="px-4 py-2 border-b" style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}>
            <div className="flex space-x-4">
              {[
                { id: 'status', label: 'Status', icon: '📊' },
                { id: 'tools', label: 'Tool Calls', icon: '🔧', badge: debugInfo.toolCalls.length },
                { id: 'logs', label: 'Logs', icon: '📝', badge: logs.length },
                { id: 'metrics', label: 'Metrics', icon: '📈' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? ''
                      : ''
                  }`}
                  style={{
                    backgroundColor: activeTab === tab.id ? 'var(--accent-muted)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--accent)' : 'var(--fg-muted)'
                  }}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center" style={{ backgroundColor: 'var(--error)' }}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-4 max-h-96 overflow-y-auto">
            {/* Debug Status Warning */}
            {!isDebugEnabled && (
              <div className="mb-4 p-3 rounded text-sm" style={{ 
                backgroundColor: 'var(--warn)', 
                color: 'white',
                border: '1px solid var(--warn)'
              }}>
                <div className="flex items-center space-x-2">
                  <span>⚠️</span>
                  <div>
                    <strong>Debug Mode Disabled</strong>
                    <p className="text-xs mt-1 opacity-90">
                      Enable debug mode to see real-time tool calls, logs, and metrics. 
                      Debug mode may impact performance when enabled.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Warning */}
            {isDebugEnabled && performanceWarning && (
              <div className="mb-4 p-3 rounded text-sm" style={{ 
                backgroundColor: 'var(--error)', 
                color: 'white',
                border: '1px solid var(--error)'
              }}>
                <div className="flex items-center space-x-2">
                  <span>🚨</span>
                  <div>
                    <strong>High Debug Load Detected</strong>
                    <p className="text-xs mt-1 opacity-90">
                      Debug mode is processing a high volume of logs/tool calls. 
                      Consider disabling debug mode to improve performance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status Tab */}
            {activeTab === 'status' && (
              <div className="space-y-4">
                {/* Connection Status */}
                <div>
                  <h4 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Connection Status</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span style={{ color: getStatusColor(debugInfo.connectionStatus) }}>
                        {getStatusIcon(debugInfo.connectionStatus)}
                      </span>
                      <span className="text-sm capitalize" style={{ color: 'var(--fg)' }}>{debugInfo.connectionStatus}</span>
                    </div>
                    {debugInfo.serverInfo?.lastPing && (
                      <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                        Last ping: {debugInfo.serverInfo.lastPing.toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  {debugInfo.lastError && (
                    <div className="mt-2 p-2 rounded text-sm" style={{ 
                      backgroundColor: 'var(--error)', 
                      color: 'white',
                      border: '1px solid var(--error)'
                    }}>
                      {debugInfo.lastError}
                    </div>
                  )}
                </div>

                {/* Server Info */}
                <div>
                  <h4 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Server Configuration</h4>
                  <div className="text-sm space-y-1" style={{ color: 'var(--fg-muted)' }}>
                    <div>Host: {debugInfo.serverInfo?.host || 'Unknown'}</div>
                    <div>Agent ID: {debugInfo.serverInfo?.agentId || 'weather'}</div>
                    <div>Environment: {import.meta.env.MODE || 'development'}</div>
                    <div>Version: {debugInfo.serverInfo?.version || 'unknown'}</div>
                    {debugInfo.serverInfo?.responseTime && (
                      <div>Response Time: {debugInfo.serverInfo.responseTime}ms</div>
                    )}
                  </div>
                </div>

                {/* MCP Servers */}
                {debugInfo.serverInfo?.mcpServers && debugInfo.serverInfo.mcpServers.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>MCP Servers</h4>
                    <div className="space-y-2">
                      {debugInfo.serverInfo.mcpServers.map((server, index) => (
                        <div key={index} className="p-2 rounded border" style={{ 
                          backgroundColor: 'var(--overlay)', 
                          borderColor: 'var(--border)' 
                        }}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm" style={{ color: 'var(--fg)' }}>{server.name}</span>
                            <span className="text-xs" style={{ 
                              color: server.status === 'connected' ? 'var(--ok)' : 'var(--error)' 
                            }}>
                              {server.status}
                            </span>
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                            Tools: {server.tools.length > 0 ? server.tools.join(', ') : 'None'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div>
                  <h4 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Quick Actions</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        console.log('[MCPDebug] Manual connection test triggered')
                        testConnection()
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--accent-muted)', 
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)'
                      }}
                    >
                      🔄 Test Connection
                    </button>
                    <button
                      onClick={() => {
                        console.log('[MCPDebug] MCP server discovery triggered')
                        discoverMCPServers()
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--ok)', 
                        color: 'white',
                        border: '1px solid var(--ok)'
                      }}
                    >
                      🔍 Discover MCP Servers
                    </button>
                    <button
                      onClick={() => {
                        console.log('[MCPDebug] Environment variables:', {
                          VITE_MASTRA_API_HOST: import.meta.env.VITE_MASTRA_API_HOST,
                          VITE_WEATHER_AGENT_ID: import.meta.env.VITE_WEATHER_AGENT_ID,
                          MODE: import.meta.env.MODE
                        })
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--accent-muted)', 
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)'
                      }}
                    >
                      📋 Log Environment
                    </button>
                    <button
                      onClick={() => {
                        // Test tool call functionality
                        addToolCall('testWeatherTool', 'called', { zipCode: '85001' })
                        setTimeout(() => {
                          addToolCall('testWeatherTool', 'result', { zipCode: '85001' }, { temperature: 75, condition: 'sunny' }, undefined, 150)
                        }, 1000)
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--warn)', 
                        color: 'white',
                        border: '1px solid var(--warn)'
                      }}
                    >
                      🧪 Test Tool Call
                    </button>
                    <button
                      onClick={() => {
                        // Test error tool call
                        addToolCall('testErrorTool', 'called', { test: 'error' })
                        setTimeout(() => {
                          addToolCall('testErrorTool', 'error', { test: 'error' }, undefined, 'Test error message', 500)
                        }, 500)
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--error)', 
                        color: 'white',
                        border: '1px solid var(--error)'
                      }}
                    >
                      ❌ Test Error Call
                    </button>
                  </div>
                </div>

                {/* Export Section */}
                <div>
                  <h4 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Export Data</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => exportData('json')}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--accent-muted)', 
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)'
                      }}
                    >
                      📄 Export as JSON
                    </button>
                    <button
                      onClick={() => exportData('csv')}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--ok)', 
                        color: 'white',
                        border: '1px solid var(--ok)'
                      }}
                    >
                      📊 Export as CSV
                    </button>
                    <button
                      onClick={() => exportData('txt')}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: 'var(--overlay)', 
                        color: 'var(--fg)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      📝 Export as Text
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tool Calls Tab */}
            {activeTab === 'tools' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium" style={{ color: 'var(--fg)' }}>Tool Calls ({debugInfo.toolCalls.length})</h4>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => exportData('json')}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      Export
                    </button>
                    <button
                      onClick={clearToolCalls}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--error)' }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {debugInfo.toolCalls.length === 0 ? (
                    <div className="text-sm text-center py-4" style={{ color: 'var(--fg-subtle)' }}>No tool calls yet</div>
                  ) : (
                    debugInfo.toolCalls.map(call => (
                      <div key={call.id} className="p-3 rounded border" style={{ 
                        backgroundColor: 'var(--overlay)', 
                        borderColor: 'var(--border)' 
                      }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <span>{getToolCallStatusIcon(call.status)}</span>
                            <span className="font-medium text-sm" style={{ color: 'var(--fg)' }}>{call.toolName}</span>
                          </div>
                          <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                            {call.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                        {call.duration && (
                          <div className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>
                            Duration: {formatDuration(call.duration)}
                          </div>
                        )}
                        {call.args && (
                          <div className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                            <details>
                              <summary className="cursor-pointer hover:opacity-70 transition-opacity" style={{ color: 'var(--fg)' }}>Args</summary>
                              <pre className="mt-1 text-xs p-2 rounded overflow-x-auto" style={{ 
                                backgroundColor: 'var(--overlay)',
                                color: 'var(--fg)'
                              }}>
                                {JSON.stringify(call.args, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        {call.result && (
                          <div className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                            <details>
                              <summary className="cursor-pointer hover:opacity-70 transition-opacity" style={{ color: 'var(--fg)' }}>Result</summary>
                              <pre className="mt-1 text-xs p-2 rounded overflow-x-auto" style={{ 
                                backgroundColor: 'var(--ok)',
                                color: 'white'
                              }}>
                                {JSON.stringify(call.result, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        {call.error && (
                          <div className="text-xs mt-1 p-2 rounded" style={{ 
                            color: 'white',
                            backgroundColor: 'var(--error)'
                          }}>
                            Error: {call.error}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium" style={{ color: 'var(--fg)' }}>Recent Logs ({logs.length})</h4>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => exportData('txt')}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      Export
                    </button>
                    <button
                      onClick={clearLogs}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--error)' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rounded p-2 max-h-80 overflow-y-auto" style={{ 
                  backgroundColor: 'var(--overlay)',
                  border: '1px solid var(--border)'
                }}>
                  {logs.length === 0 ? (
                    <div className="text-sm text-center py-4" style={{ color: 'var(--fg-subtle)' }}>No logs yet</div>
                  ) : (
                    <div className="space-y-1">
                      {logs.slice(-50).map((log, index) => (
                        <div key={index} className="text-xs font-mono break-words" style={{ color: 'var(--fg)' }}>
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metrics Tab */}
            {activeTab === 'metrics' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium" style={{ color: 'var(--fg)' }}>Performance Metrics</h4>
                  <button
                    onClick={() => exportData('json')}
                    className="text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--accent)' }}
                  >
                    Export
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded border" style={{ 
                    backgroundColor: 'var(--accent-muted)',
                    borderColor: 'var(--accent)'
                  }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{debugInfo.metrics.totalToolCalls}</div>
                    <div className="text-sm" style={{ color: 'var(--accent)' }}>Total Tool Calls</div>
                  </div>
                  
                  <div className="p-3 rounded border" style={{ 
                    backgroundColor: 'var(--ok)',
                    borderColor: 'var(--ok)'
                  }}>
                    <div className="text-2xl font-bold text-white">{debugInfo.metrics.successfulCalls}</div>
                    <div className="text-sm text-white">Successful</div>
                  </div>
                  
                  <div className="p-3 rounded border" style={{ 
                    backgroundColor: 'var(--error)',
                    borderColor: 'var(--error)'
                  }}>
                    <div className="text-2xl font-bold text-white">{debugInfo.metrics.failedCalls}</div>
                    <div className="text-sm text-white">Failed</div>
                  </div>
                  
                  <div className="p-3 rounded border" style={{ 
                    backgroundColor: 'var(--overlay)',
                    borderColor: 'var(--border)'
                  }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
                      {debugInfo.metrics.averageResponseTime > 0 
                        ? `${debugInfo.metrics.averageResponseTime.toFixed(0)}ms`
                        : `${debugInfo.serverInfo?.responseTime || 0}ms`
                      }
                    </div>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                      {debugInfo.metrics.averageResponseTime > 0 ? 'Avg Response' : 'Last Response'}
                    </div>
                  </div>
                </div>

                {debugInfo.metrics.lastCallTime && (
                  <div className="p-3 rounded border" style={{ 
                    backgroundColor: 'var(--overlay)',
                    borderColor: 'var(--border)'
                  }}>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                      <strong style={{ color: 'var(--fg)' }}>Last Tool Call:</strong> {debugInfo.metrics.lastCallTime.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                  Success Rate: {debugInfo.metrics.totalToolCalls > 0 
                    ? ((debugInfo.metrics.successfulCalls / debugInfo.metrics.totalToolCalls) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export default MCPDebugPanel
