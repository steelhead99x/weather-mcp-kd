import { Mastra } from "@mastra/core/mastra";
import { weatherAgent } from "./agents/weather-agent";
import { weatherMcpServer } from "./mcp/weather-server";

export const mastra = new Mastra({
    agents: {
        weatherAgent
    },
    mcpServers: {
        weatherMcpServer
    }
});