# Weather Agent KD

A minimal TypeScript weather agent with a tiny MCP-style tool interface. It can be run from the CLI to call tools like mcp.get_weather_by_zip and prints the result as JSON. The repository also contains a richer experimental agent and scripts (excluded from the basic build) for exploration.

## Features
- Simple Agent wrapper that dispatches to named tools
- Weather lookup by ZIP using Weather.gov and Zippopotam.us
- Clean ESM setup with ts-node for local development
- No external HTTP client dependency (uses global fetch in Node >= 18)

## Project Layout
- src/index.ts — CLI entry point
- src/agent.ts — Minimal agent implementation (MastraAgentTemplate)
- src/tools/mcpTool.ts — MCP-like tool registry (ping, get_weather_by_zip)
- src/agents, src/scripts, src/mcp, src/tools/weather.ts — Extra experimental code (not part of the main build)

The TypeScript configuration (tsconfig.json) intentionally includes only the minimal files required for the simple CLI to keep the compiled output small and predictable.

## Prerequisites
- Node.js 18.18 or newer (for native fetch and ESM)

## Installation
```
npm install
```

## Quick Start (Dev)
Load environment variables (optional) and run the CLI via ts-node:
```
# Optionally create a .env with AGENT_NAME and WEATHER_MCP_USER_AGENT
npm run dev -- mcp.ping

npm run dev -- mcp.get_weather_by_zip '{"zipCode":"10001"}'
```

Expected output for ping:
```
{
  "ok": true,
  "message": "pong"
}
```

## Build and Run
```
# Compile TypeScript to dist/
npm run build

# Run compiled entry
npm start -- mcp.get_weather_by_zip '{"zipCode":"90210"}'
```

## Configuration
Create a .env file and adjust values as needed.

Optional environment variables (via .env or shell):
- AGENT_NAME — Overrides the agent display name used by the CLI
- WEATHER_MCP_USER_AGENT — Custom User-Agent header for weather.gov requests
- ANTHROPIC_API_KEY — Required to run the advanced agent in src/index.ts
- ANTHROPIC_MODEL — Optional model override for Anthropic (default set in code)
- CARTESIA_API_KEY, CARTESIA_VOICE — Optional; enables Cartesia TTS
- DEEPGRAM_API_KEY, DEEPGRAM_VOICE — Optional; enables Deepgram TTS

Example .env:
```
# Example variables
AGENT_NAME=weather-agent
WEATHER_MCP_USER_AGENT=WeatherAgentKD/0.1 (me@example.com)
# Required for the advanced agent
ANTHROPIC_API_KEY=sk-ant-...
```

## Notes on Extra Files
This repo also contains a more advanced weather agent (src/agents/weather-agent.ts) that integrates third-party AI services and TTS providers. These files are excluded from the simple build by tsconfig.json to avoid requiring extra API keys and dependencies for the basic CLI.

If you want to explore them, run the scripts directly with ts-node or include them in tsconfig.json and package.json as needed.

## Scripts
- dev — Run src/index.ts with ts-node-esm
- build — Type-check and compile to dist/
- start — Run dist/index.js (compiled output)
- typecheck — Type-check only

## License
MIT
