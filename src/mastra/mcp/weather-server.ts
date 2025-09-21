import { MCPServer } from "@mastra/mcp";
import { weatherAgent } from "../agents/weather-agent.js";
import { weatherTool } from "../tools/weather.js";

export const weatherMcpServer = new MCPServer({
    id: "weather-mcp-server",
    name: "Weather MCP Server",
    version: "1.0.0",
    description: "Provides weather information and TTS capabilities via MCP",
    agents: { 
        weatherAgent 
    },
    tools: { 
        weatherTool
        // Note: ttsWeatherTool is defined inside weather-agent.ts and not exported separately
        // The agent itself has access to it, so we don't need to expose it separately via MCP
    }
});
