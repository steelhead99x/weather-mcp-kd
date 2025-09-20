import { Mastra } from '@mastra/core';
import { weatherAgent } from './agents/weather-agent.js';
import { getWeatherByZipTool, getWeatherByCoordinatesTool } from './tools/weather.js';

// First, assign tools to the agent
weatherAgent.tools = {
    getWeatherByZipTool,
    getWeatherByCoordinatesTool,
};

// Create Mastra instance with proper configuration
export const mastra = new Mastra({
    agents: {
        weatherAgent,
    },
});

export default mastra;