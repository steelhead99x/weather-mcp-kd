import { MCPServer } from "@mastra/mcp";
import { weatherTool } from "../tools/weather";

export const weatherMcpServer = new MCPServer({
    id: "weather-server",
    name: "Weather MCP Server",
    version: "0.0.X",
    tools: {
        weatherTool
    }
});