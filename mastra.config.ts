import { Mastra } from '@mastra/core';
import { weatherAgent } from './dist/mastra/agents/weather-agent.js';
import { getWeatherByZipTool, getWeatherByCoordinatesTool } from './dist/mastra/tools/weather.js';

// Assign tools to agent
weatherAgent.tools = {
    getWeatherByZipTool,
    getWeatherByCoordinatesTool,
};

// Create Mastra instance
const mastra = new Mastra({
    agents: {
        weatherAgent,
    },
});

// Export default for Mastra dev playground
export default mastra;

// Export telemetry configuration
export const telemetry = {
    serviceName: 'weather-agent-kd',
    enabled: false,
    sampling: { type: 'always_off' as const },
};