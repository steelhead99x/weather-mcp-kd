import { useState, useEffect, useRef, useCallback } from 'react'
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

export default function MCPDebugPanel() {
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
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'status' | 'tools' | 'logs' | 'metrics'>('status')
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const toolCallInterceptorRef = useRef<Map<string, MCPToolCall>>(new Map())

  // Enhanced console log interceptor with tool call detection
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    const logInterceptor = (level: string, originalFn: typeof console.log) => {
      return (...args: any[]) => {
        const message = `[${level}] ${new Date().toISOString()}: ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')}`
        
        setLogs(prev => [...prev.slice(-99), message]) // Keep last 100 logs
        
        // Detect tool calls in logs
        detectToolCallsInLogs(message, args)
        
        originalFn(...args)
      }
    }

    console.log = logInterceptor('LOG', originalLog)
    console.error = logInterceptor('ERROR', originalError)
    console.warn = logInterceptor('WARN', originalWarn)

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // Enhanced tool call detection function
  const detectToolCallsInLogs = useCallback((message: string, args: any[]) => {
    // Look for patterns that indicate tool calls
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

      setDebugInfo(prev => ({
        ...prev,
        toolCalls: [toolCall, ...prev.toolCalls].slice(0, 50), // Keep last 50 calls
        metrics: {
          ...prev.metrics,
          totalToolCalls: prev.metrics.totalToolCalls + 1,
          lastCallTime: new Date()
        }
      }))
    }
  }, [])

  // Function to manually add tool calls (for integration with actual MCP operations)
  const addToolCall = useCallback((toolName: string, status: 'called' | 'result' | 'error' | 'pending' = 'called', args?: any, result?: any, error?: string, duration?: number) => {
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
      const newToolCalls = [toolCall, ...prev.toolCalls].slice(0, 50)
      
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
  }, [])

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

  // Setup polling intervals
  useEffect(() => {
    testConnection()
    discoverMCPServers()
    
    // Test connection every 30 seconds
    const connectionInterval = setInterval(testConnection, 30000)
    
    // Discover MCP servers every 60 seconds
    const discoveryInterval = setInterval(discoverMCPServers, 60000)
    
    pollingIntervalRef.current = connectionInterval
    
    return () => {
      clearInterval(connectionInterval)
      clearInterval(discoveryInterval)
    }
  }, [testConnection, discoverMCPServers])

  // Expose addToolCall globally for integration with other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).mcpDebugPanel = {
        addToolCall,
        testConnection,
        discoverMCPServers
      }
    }
  }, [addToolCall, testConnection, discoverMCPServers])

  const clearLogs = () => setLogs([])

  const clearToolCalls = useCallback(() => {
    setDebugInfo(prev => ({
      ...prev,
      toolCalls: [],
      metrics: {
        totalToolCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageResponseTime: 0
      }
    }))
  }, [])

  const getStatusColor = (status: MCPDebugInfo['connectionStatus']) => {
    switch (status) {
      case 'connected': return 'text-green-600'
      case 'disconnected': return 'text-gray-600'
      case 'error': return 'text-red-600'
      case 'testing': return 'text-yellow-600'
      default: return 'text-gray-600'
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
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors relative"
      >
        <span className="mr-2">{getStatusIcon(debugInfo.connectionStatus)}</span>
        MCP Debug
        {debugInfo.toolCalls.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {debugInfo.toolCalls.length}
          </span>
        )}
      </button>
      
      {isExpanded && (
        <div className="absolute bottom-12 right-0 w-[500px] max-h-[600px] bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">MCP Debug Panel</h3>
              <div className="flex items-center space-x-2">
                <div className="text-xs text-gray-600">
                  {debugInfo.serverInfo?.responseTime && `${debugInfo.serverInfo.responseTime}ms`}
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
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
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-4 max-h-96 overflow-y-auto">
            {/* Status Tab */}
            {activeTab === 'status' && (
              <div className="space-y-4">
                {/* Connection Status */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Connection Status</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={getStatusColor(debugInfo.connectionStatus)}>
                        {getStatusIcon(debugInfo.connectionStatus)}
                      </span>
                      <span className="text-sm capitalize">{debugInfo.connectionStatus}</span>
                    </div>
                    {debugInfo.serverInfo?.lastPing && (
                      <div className="text-xs text-gray-500">
                        Last ping: {debugInfo.serverInfo.lastPing.toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  {debugInfo.lastError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      {debugInfo.lastError}
                    </div>
                  )}
                </div>

                {/* Server Info */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Server Configuration</h4>
                  <div className="text-sm text-gray-600 space-y-1">
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
                    <h4 className="font-medium text-gray-700 mb-2">MCP Servers</h4>
                    <div className="space-y-2">
                      {debugInfo.serverInfo.mcpServers.map((server, index) => (
                        <div key={index} className="p-2 bg-gray-50 rounded border">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{server.name}</span>
                            <span className={`text-xs ${server.status === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                              {server.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Tools: {server.tools.length > 0 ? server.tools.join(', ') : 'None'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Quick Actions</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        console.log('[MCPDebug] Manual connection test triggered')
                        testConnection()
                      }}
                      className="w-full text-left px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 hover:bg-blue-100"
                    >
                      🔄 Test Connection
                    </button>
                    <button
                      onClick={() => {
                        console.log('[MCPDebug] MCP server discovery triggered')
                        discoverMCPServers()
                      }}
                      className="w-full text-left px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 hover:bg-green-100"
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
                      className="w-full text-left px-3 py-2 bg-purple-50 border border-purple-200 rounded text-sm text-purple-700 hover:bg-purple-100"
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
                      className="w-full text-left px-3 py-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700 hover:bg-orange-100"
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
                      className="w-full text-left px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 hover:bg-red-100"
                    >
                      ❌ Test Error Call
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tool Calls Tab */}
            {activeTab === 'tools' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-gray-700">Tool Calls ({debugInfo.toolCalls.length})</h4>
                  <button
                    onClick={clearToolCalls}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {debugInfo.toolCalls.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">No tool calls yet</div>
                  ) : (
                    debugInfo.toolCalls.map(call => (
                      <div key={call.id} className="p-3 bg-gray-50 border border-gray-200 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <span>{getToolCallStatusIcon(call.status)}</span>
                            <span className="font-medium text-sm">{call.toolName}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {call.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                        {call.duration && (
                          <div className="text-xs text-gray-600 mb-1">
                            Duration: {formatDuration(call.duration)}
                          </div>
                        )}
                        {call.args && (
                          <div className="text-xs text-gray-600 mt-1">
                            <details>
                              <summary className="cursor-pointer hover:text-gray-800">Args</summary>
                              <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                                {JSON.stringify(call.args, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        {call.result && (
                          <div className="text-xs text-gray-600 mt-1">
                            <details>
                              <summary className="cursor-pointer hover:text-gray-800">Result</summary>
                              <pre className="mt-1 text-xs bg-green-50 p-2 rounded overflow-x-auto">
                                {JSON.stringify(call.result, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        {call.error && (
                          <div className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded">
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
                  <h4 className="font-medium text-gray-700">Recent Logs ({logs.length})</h4>
                  <button
                    onClick={clearLogs}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded p-2 max-h-80 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">No logs yet</div>
                  ) : (
                    <div className="space-y-1">
                      {logs.slice(-50).map((log, index) => (
                        <div key={index} className="text-xs font-mono text-gray-700 break-words">
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
                <h4 className="font-medium text-gray-700">Performance Metrics</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 rounded border">
                    <div className="text-2xl font-bold text-blue-700">{debugInfo.metrics.totalToolCalls}</div>
                    <div className="text-sm text-blue-600">Total Tool Calls</div>
                  </div>
                  
                  <div className="p-3 bg-green-50 rounded border">
                    <div className="text-2xl font-bold text-green-700">{debugInfo.metrics.successfulCalls}</div>
                    <div className="text-sm text-green-600">Successful</div>
                  </div>
                  
                  <div className="p-3 bg-red-50 rounded border">
                    <div className="text-2xl font-bold text-red-700">{debugInfo.metrics.failedCalls}</div>
                    <div className="text-sm text-red-600">Failed</div>
                  </div>
                  
                  <div className="p-3 bg-purple-50 rounded border">
                    <div className="text-2xl font-bold text-purple-700">
                      {debugInfo.metrics.averageResponseTime > 0 
                        ? `${debugInfo.metrics.averageResponseTime.toFixed(0)}ms`
                        : `${debugInfo.serverInfo?.responseTime || 0}ms`
                      }
                    </div>
                    <div className="text-sm text-purple-600">
                      {debugInfo.metrics.averageResponseTime > 0 ? 'Avg Response' : 'Last Response'}
                    </div>
                  </div>
                </div>

                {debugInfo.metrics.lastCallTime && (
                  <div className="p-3 bg-gray-50 rounded border">
                    <div className="text-sm text-gray-600">
                      <strong>Last Tool Call:</strong> {debugInfo.metrics.lastCallTime.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500">
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
}
