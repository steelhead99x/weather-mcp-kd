import { MastraClient } from '@mastra/client-js'

// Extend MastraClient type to include our custom method
declare module '@mastra/client-js' {
  interface MastraClient {
    getDynamicToolsets?(): Promise<Record<string, any>>
  }
}

function sanitizeHost(raw: string | undefined): string {
  try {
    if (!raw) {
      // In production, use the same domain (no subdomain needed)
      return window.location.hostname || 'weather-mcp-kd.streamingportfolio.com'
    }
    let v = String(raw).trim()

    // Strip surrounding quotes if present
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }

    // Remove protocol
    v = v.replace(/^https?:\/\//i, '')

    // Remove /api if it exists (Mastra client will add it back)
    v = v.replace(/\/api\/?$/, '')

    // Final trim
    v = v.trim()

    // Validate hostname format (basic security check)
    if (v && !/^[a-zA-Z0-9.-]+$/.test(v)) {
      console.warn('[Mastra] Invalid hostname format detected, using current hostname')
      return window.location.hostname || 'weather-mcp-kd.streamingportfolio.com'
    }

    return v || window.location.hostname || 'weather-mcp-kd.streamingportfolio.com'
  } catch {
    return window.location.hostname || 'weather-mcp-kd.streamingportfolio.com'
  }
}

function buildBaseUrl(hostname: string): string {
  const isLocal = /^(localhost|127\.0\.0\.1)/.test(hostname)
  let url = `${isLocal ? 'http' : 'https'}://${hostname}`
  
  // Check if the hostname already includes a path
  const hasPath = hostname.includes('/')
  
  if (hasPath) {
    // If path is already provided, use it as-is (for custom API endpoints)
    url = url.endsWith('/') ? url : `${url}/`
  } else {
    // If no path is provided, just ensure it ends with /
    // The Mastra client will add /api internally
    url = url.endsWith('/') ? url : `${url}/`
  }
  
  return url
}

const rawHost = (import.meta as any)?.env?.VITE_MASTRA_API_HOST as string | undefined
const host = sanitizeHost(rawHost)
const baseUrl = buildBaseUrl(host)

// Override for direct API connection if no env var is set
const directApiHost = 'http://localhost:3002'
const finalBaseUrl = rawHost ? baseUrl : directApiHost

console.log('[Mastra] Raw host from env:', rawHost)
console.log('[Mastra] Sanitized host:', host)
console.log('[Mastra] Base URL:', baseUrl)
console.log('[Mastra] Final Base URL:', finalBaseUrl)
console.log('[Mastra] Has path in hostname:', host.includes('/'))
console.log('[Mastra] Removed /api from hostname:', rawHost?.includes('/api'))

if (!rawHost) {
  // eslint-disable-next-line no-console
  console.warn('[Mastra] VITE_MASTRA_API_HOST is not set. Using direct API connection to:', directApiHost)
}

// Test connection on startup
async function testConnection() {
  try {
    console.log('[Mastra] Testing connection to:', finalBaseUrl)
    // Test the health endpoint first
    const healthUrl = finalBaseUrl.endsWith('/') ? `${finalBaseUrl}health` : `${finalBaseUrl}/health`
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('[Mastra] Connection test successful:', data)
    } else {
      console.warn('[Mastra] Health endpoint failed:', response.status, response.statusText)
    }
  } catch (error) {
    console.error('[Mastra] Connection test error:', error)
  }
}

// Run connection test after a short delay
setTimeout(testConnection, 1000)

export const mastra = new MastraClient({
  // Mastra client expects a full baseUrl
  baseUrl: finalBaseUrl,
})

// Add method to get dynamic toolsets
mastra.getDynamicToolsets = async () => {
  try {
    console.log('[Mastra] Getting dynamic toolsets...')
    
    // Check if we have MCP servers configured
    // This would typically connect to MCP servers and get toolsets
    // For now, return empty object - you'll need to implement this based on your MCP setup
    const toolsets = {}
    
    // TODO: Implement actual MCP server connection
    // Example implementation would be:
    // const mcpClient = new MCPClient({
    //   servers: {
    //     weather: { url: new URL('https://your-mcp-server.com/mcp') },
    //     mux: { url: new URL('https://your-mux-server.com/mcp') }
    //   }
    // })
    // const toolsets = await mcpClient.getToolsets()
    
    console.log('[Mastra] Dynamic toolsets retrieved:', Object.keys(toolsets))
    return toolsets
  } catch (error) {
    console.error('[Mastra] Error getting dynamic toolsets:', error)
    return {}
  }
}

export function getWeatherAgentId() {
  return ((import.meta as any)?.env?.VITE_WEATHER_AGENT_ID as string) || 'weather'
}

// Optional helper for UI/status displays
export function getDisplayHost() {
  return host
}

// Expose resolved base URL for other UI components (e.g., debug panels)
export function getMastraBaseUrl() {
  return finalBaseUrl
}
