import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { weatherAgent, streamWeatherAgentVNext } from "./agents/weather-agent.js";
import { weatherMcpServer } from "./mcp/weather-server.js";

export const mastra = new Mastra({
    agents: {
        weatherAgent
    },
    mcpServers: {
        weatherMcpServer
    },
    storage: new InMemoryStore()
});

// Re-export helper for preferred vNext streaming
export { streamWeatherAgentVNext } from './agents/weather-agent.js';