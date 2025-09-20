import { MCPServer } from "@mastra/mcp";
import { getWeatherByZipTool } from "../tools/weather";

export const weatherMcpServer = new MCPServer({
    name: "weather-server",
    description: "Weather MCP server providing weather data by ZIP code",
    version: "1.0.0",
    tools: {
        getWeatherByZip: getWeatherByZipTool,
    },
});