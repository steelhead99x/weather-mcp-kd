import { weatherAgent } from './dist/mastra/agents/weather-agent.js';
import { getWeatherByZipTool, getWeatherByCoordinatesTool } from './dist/mastra/tools/weather.js';
import { Mastra } from '@mastra/core';

// Assign tools to agent
weatherAgent.tools = {
    getWeatherByZipTool,
    getWeatherByCoordinatesTool,
};

// Create and export Mastra instance
export default new Mastra({
    agents: {
        weatherAgent,
    },
});

// Export telemetry configuration
export const telemetry = {
    serviceName: 'weather-agent-kd',
    enabled: false,
    sampling: { type: 'always_off' },
};