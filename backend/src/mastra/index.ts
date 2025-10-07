import { weatherAgent } from '../agents/weather-agent.js'
import { weatherTool } from '../tools/weather.js'
import { weatherMcpServer } from '../mcp/weather-server.js'

export { default as mastra } from '../index.js'

// Export with consistent naming: agent ID 'weather' matches weatherAgent instance
export const agents = { 
  weather: weatherAgent  // Use 'weather' as the key to match API routes
}
export const tools = { weatherTool }
export const mcpServers = { weatherMcpServer }

// Minimal telemetry configuration for Mastra dev playground
export const telemetry = {
  enabled: true,
  serviceName: 'weather-agent',
  sampling: {
    type: 'always_on' as const
  }
}

export default { agents, tools, mcpServers, telemetry }
