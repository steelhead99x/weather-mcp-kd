import { useState, useEffect } from 'react'
import { getMastraBaseUrl } from '../lib/mastraClient'

interface MCPDebugInfo {
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'testing'
  lastError?: string
  toolCalls: Array<{
    id: string
    toolName: string
    timestamp: Date
    status: 'called' | 'result' | 'error'
    args?: any
    result?: any
    error?: string
  }>
  serverInfo?: {
    host: string
    baseUrl: string
    agentId: string
  }
}

export default function MCPDebugPanel() {
  const [debugInfo, setDebugInfo] = useState<MCPDebugInfo>({
    connectionStatus: 'testing',
    toolCalls: []
  })
  const [isExpanded, setIsExpanded] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    // Capture console logs for debugging (only in development)
    if (process.env.NODE_ENV !== 'development') return

    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    const logInterceptor = (level: string, originalFn: typeof console.log) => {
      return (...args: any[]) => {
        const message = `[${level}] ${new Date().toISOString()}: ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ')}`
        setLogs(prev => [...prev.slice(-99), message]) // Keep last 100 logs
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

  useEffect(() => {
    // Test connection status
    const testConnection = async () => {
      try {
        setDebugInfo(prev => ({ ...prev, connectionStatus: 'testing' }))
        
        const baseUrl = getMastraBaseUrl()
        const healthUrl = baseUrl.endsWith('/') ? `${baseUrl}health` : `${baseUrl}/health`
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
        
        if (response.ok) {
          setDebugInfo(prev => ({ 
            ...prev, 
            connectionStatus: 'connected',
            lastError: undefined 
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
    }

    testConnection()
    const interval = setInterval(testConnection, 30000) // Test every 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  const clearLogs = () => setLogs([])

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

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
      >
        <span className="mr-2">{getStatusIcon(debugInfo.connectionStatus)}</span>
        MCP Debug
      </button>
      
      {isExpanded && (
        <div className="absolute bottom-12 right-0 w-96 max-h-96 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">MCP Debug Panel</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
            {/* Connection Status */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Connection Status</h4>
              <div className="flex items-center space-x-2">
                <span className={getStatusColor(debugInfo.connectionStatus)}>
                  {getStatusIcon(debugInfo.connectionStatus)}
                </span>
                <span className="text-sm capitalize">{debugInfo.connectionStatus}</span>
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
                <div>Host: {import.meta.env.VITE_MASTRA_API_HOST || 'stage-weather-mcp-kd.streamingportfolio.com'}</div>
                <div>Agent ID: {import.meta.env.VITE_WEATHER_AGENT_ID || 'weather'}</div>
                <div>Environment: {import.meta.env.MODE || 'development'}</div>
              </div>
            </div>

            {/* Recent Logs */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-gray-700">Recent Logs</h4>
                <button
                  onClick={clearLogs}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear
                </button>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded p-2 max-h-32 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-sm text-gray-500">No logs yet</div>
                ) : (
                  <div className="space-y-1">
                    {logs.slice(-10).map((log, index) => (
                      <div key={index} className="text-xs font-mono text-gray-700 break-words">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Quick Actions</h4>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    console.log('[MCPDebug] Manual connection test triggered')
                    {
                      const baseUrl = getMastraBaseUrl()
                      const healthUrl = baseUrl.endsWith('/') ? `${baseUrl}health` : `${baseUrl}/health`
                      fetch(healthUrl)
                        .then(res => res.json())
                        .then(data => console.log('[MCPDebug] Health check result:', data))
                        .catch(err => console.error('[MCPDebug] Health check error:', err))
                    }
                  }}
                  className="w-full text-left px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 hover:bg-blue-100"
                >
                  Test Connection
                </button>
                <button
                  onClick={() => {
                    console.log('[MCPDebug] Environment variables:', {
                      VITE_MASTRA_API_HOST: import.meta.env.VITE_MASTRA_API_HOST,
                      VITE_WEATHER_AGENT_ID: import.meta.env.VITE_WEATHER_AGENT_ID,
                      MODE: import.meta.env.MODE
                    })
                  }}
                  className="w-full text-left px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 hover:bg-green-100"
                >
                  Log Environment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
