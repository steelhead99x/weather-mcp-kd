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
      return window.location.hostname || 'localhost:3001'
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

    // Validate hostname format (basic security check) - allow colons for port numbers
    if (v && !/^[a-zA-Z0-9.-]+(:[0-9]+)?$/.test(v)) {
      console.warn('[Mastra] Invalid hostname format detected, using current hostname')
      return window.location.hostname || 'localhost:3001'
    }

    return v || window.location.hostname || 'localhost:3001'
  } catch {
    return window.location.hostname || 'localhost:3001'
  }
}

function buildBaseUrl(hostname: string): string {
  // Check if it's a local address (with or without port)
  const isLocal = /^(localhost|127\.0\.0\.1)(:[0-9]+)?/.test(hostname)
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

// Environment-specific configuration
const isProduction = import.meta.env.PROD
const isDevelopment = import.meta.env.DEV

// Get the raw host from env
const rawHost = (import.meta as any)?.env?.VITE_MASTRA_API_HOST as string | undefined

// Determine the final base URL
let finalBaseUrl: string

if (rawHost) {
  // Use explicitly configured host
  const host = sanitizeHost(rawHost)
  finalBaseUrl = buildBaseUrl(host)
  console.log('[Mastra] Using configured host:', rawHost, '→', finalBaseUrl)
} else if (isProduction) {
  // In production without explicit config, use the same origin as the frontend
  // This assumes backend is served on the same domain
  finalBaseUrl = window.location.origin + '/'
  console.log('[Mastra] Production mode - using same origin:', finalBaseUrl)
} else {
  // In development without explicit config, default to localhost:3001
  finalBaseUrl = 'http://localhost:3001'
  console.log('[Mastra] Development mode - using localhost:', finalBaseUrl)
}

console.log('[Mastra] Final Base URL:', finalBaseUrl)
console.log('[Mastra] Environment:', { isProduction, isDevelopment })

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
  try {
    // Extract hostname from finalBaseUrl
    const url = new URL(finalBaseUrl)
    return url.host
  } catch {
    return finalBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

// Expose resolved base URL for other UI components (e.g., debug panels)
export function getMastraBaseUrl() {
  return finalBaseUrl
}
