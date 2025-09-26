import { weatherAgent } from '../agents/weather-agent.js'
import { weatherTool } from '../tools/weather.js'
import { weatherMcpServer } from '../mcp/weather-server.js'

export const agents = { weatherAgent }
export const tools = { weatherTool }
export const mcpServers = { weatherMcpServer }

export default { agents, tools, mcpServers }
