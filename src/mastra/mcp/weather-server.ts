import { MCPServer } from "@mastra/mcp";
import { weatherTool } from "../tools/weather";

export const weatherMcpServer = new MCPServer({
    id: "weather-server",
    name: "Weather MCP Server",
    version: "1.0.0",
    tools: {
        weatherTool
    }
});