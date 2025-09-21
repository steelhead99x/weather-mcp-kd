import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { weatherAgent, streamWeatherAgentLegacy } from "./agents/weather-agent";
import { weatherMcpServer } from "./mcp/weather-server";

export const mastra = new Mastra({
    agents: {
        weatherAgent
    },
    mcpServers: {
        weatherMcpServer
    },
    storage: new InMemoryStore()
});

// Re-export helper to explicitly use legacy streaming if needed by consumers
export { streamWeatherAgentLegacy } from './agents/weather-agent';