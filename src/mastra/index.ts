import { Mastra } from '@mastra/core';
import { weatherAgent } from './agents/weather-agent.js';
import { getWeatherByZipTool, getWeatherByCoordinatesTool } from './tools/weather.js';

// First, assign tools to the agent (cast to any to satisfy TS if tools is readonly)
;(weatherAgent as any).tools = {
    getWeatherByZipTool,
    getWeatherByCoordinatesTool,
};

// Export telemetry config separately so Mastra instrumentation can consume it
export const telemetry = {
    serviceName: 'weather-agent-kd',
    enabled: false,
    sampling: { type: 'always_off' as const },
};

// Create and export Mastra instance directly as default
const _mastra = new Mastra({
    agents: {
        weatherAgent,
    },
    telemetry,
});

export const mastra = _mastra;
export default _mastra;