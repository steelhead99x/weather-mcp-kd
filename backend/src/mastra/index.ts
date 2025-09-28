import { weatherAgent } from '../agents/weather-agent'
import { weatherTool } from '../tools/weather'
import { weatherMcpServer } from '../mcp/weather-server'

export { default as mastra } from '../index'

export const agents = { weatherAgent }
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
