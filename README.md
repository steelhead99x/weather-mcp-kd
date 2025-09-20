# Weather Agent KD

A TypeScript project that demonstrates a weather-focused agent built with Mastra. It includes:
- A Mastra Agent that can call a weather tool
- A weather tool that fetches forecasts from api.weather.gov (via ZIP geocoding from Zippopotam.us)
- An MCP server exposing the same weather tool
- Several test scripts (agent, TTS, STT, etc.)

This README is freshly written to reflect the current codebase and package.json scripts as of 2025-09-20.

## Requirements
- Node.js 20+ (required by package engines)
- npm 9+ recommended

## Install
```
npm install
```

## Environment Variables
Create a `.env` file in the project root (do not commit secrets). Variables used by this project include:
- ANTHROPIC_API_KEY: Required if you plan to use the Anthropic-backed agent or the Claude test script
- ANTHROPIC_MODEL: Optional Anthropic model override (defaults in code to "claude-3-haiku-20240307")
- WEATHER_MCP_USER_AGENT: Optional but recommended courtesy header for Weather.gov requests (e.g. "YourApp/1.0 (email@example.com)")
- DEEPGRAM_API_KEY: Optional for TTS/STT tests using Deepgram
- CARTESIA_API_KEY: Optional for TTS tests using Cartesia
- Additional optional variables exist for STT/TTS scripts (see scripts section below)

You can start from an example of your own. If you created a local example file, copy and edit it:
```
cp .env.example .env
# Edit .env to add your keys and options
```

## Project Layout (key files)
- src/mastra/index.ts — Creates and exports the Mastra instance (agents + MCP servers)
- src/mastra/agents/weather-agent.ts — Defines the Weather Agent (Anthropic model + weatherTool)
- src/mastra/tools/weather.ts — Defines and exports weatherTool (id: "get-weather")
- src/mastra/mcp/weather-server.ts — Exposes weatherTool via an MCPServer
- src/mastra/scripts/ — Test scripts for agent, ZIP tool, STT, TTS, etc.

## Scripts (package.json)
- dev: `mastra dev` — Launch Mastra Dev Playground for this app
- build: `mastra build` — Build the project into dist/
- start: `node dist/index.js` — If you have a built entry file at dist/index.js (not required for most flows)
- typecheck: `tsc --noEmit`
- test:zip: Build then run `dist/mastra/scripts/test-zip.js`
- test:claude: Build then run `dist/mastra/scripts/test-claude.js`
- test:weather-agent: Build then run `dist/mastra/scripts/test-weather-agent.js`
- test:stt: Build then run `dist/mastra/scripts/test-stt.js`
- test:stt:deepgram: Build then run STT via Deepgram
- test:stt:cartesia: Build then run STT via Cartesia (placeholder)
- test:tts: Build then run `dist/mastra/scripts/test-tts.js`
- test:tts:deepgram: Build then run TTS via Deepgram
- test:tts:cartesia: Build then run TTS via Cartesia
- test:all: Run all of the above tests sequentially

Notes:
- The test scripts require specific environment variables depending on the provider (see their headers). Some scripts are experimental:
  - test-zip.ts currently imports a symbol name that does not exist in the tool file; see the programmatic usage section below if you call the tool directly.
  - test-claude.ts references a missing config file for models and may require adjustment.

## Development
Start the Mastra Dev Playground:
```
npm run dev
```
- Ensure your `.env` contains the variables you intend to use (e.g., ANTHROPIC_API_KEY for text generation).
- The Mastra dev server will load the Mastra app exported from src/mastra/index.ts (compiled to dist during dev/build).

Build the project:
```
npm run build
```

## Using the Weather Agent (programmatic)
The Weather Agent uses Anthropic and the weatherTool behind the scenes to fulfill user queries. Minimal example:
```ts
import 'dotenv/config';
import { weatherAgent } from './dist/mastra/agents/weather-agent.js';

async function main() {
  const res = await weatherAgent.generateVNext(
    "Hello! Please get the forecast for ZIP 94102"
  );
  console.log(res.text || res);
}

main();
```
Requirements:
- ANTHROPIC_API_KEY set
- Network access for Zippopotam.us and api.weather.gov

## Using the Weather Tool Directly (programmatic)
The tool is exported as `weatherTool` and expects a `zipCode` in its context. It returns basic location info and a short forecast array.
```ts
import 'dotenv/config';
import { weatherTool } from './dist/mastra/tools/weather.js';

async function main() {
  const result = await weatherTool.execute({
    context: { zipCode: '94102' }
  });
  console.log(result);
}

main();
```
Optional:
- Set `WEATHER_MCP_USER_AGENT` in your environment to include a descriptive User-Agent for Weather.gov requests.

## MCP Server (experimental)
An MCP server is defined that exposes the weather tool:
- File: src/mastra/mcp/weather-server.ts
- Export: `weatherMcpServer`
You can embed this server in your own MCP-capable host or extend it according to your needs.

## Test Scripts
After building, you can run:
```
# Simple agent smoke test (uses Anthropic)
npm run test:weather-agent

# STT tests (Deepgram supported; Cartesia placeholder)
npm run test:stt
npm run test:stt:deepgram
npm run test:stt:cartesia

# TTS tests (Deepgram and Cartesia)
npm run test:tts
npm run test:tts:deepgram
npm run test:tts:cartesia
```
Environment variables commonly used by these scripts include:
- STT_INPUT_FILE, STT_OUTPUT_FILE, STT_PROVIDER
- TTS_TEXT, TTS_OUTPUT_BASE, TTS_PROVIDER, TTS_FORMAT
- DEEPGRAM_API_KEY, CARTESIA_API_KEY

Caveats:
- test-zip.ts currently uses an import name mismatch relative to src/mastra/tools/weather.ts (exports `weatherTool`). If you need a direct ZIP test, prefer the programmatic example above or adjust the script to import `weatherTool`.
- test-claude.ts references a non-existent `../config/models.js`. You may replace the `getAnthropicModel()` usage with a direct `process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307'` until a config helper is added.

## Troubleshooting
- Weather.gov requests fail or are throttled: Set a descriptive `WEATHER_MCP_USER_AGENT` per their guidelines.
- Anthropic calls fail: Ensure `ANTHROPIC_API_KEY` is set and valid; confirm your model name if overriding via `ANTHROPIC_MODEL`.
- STT/TTS failures: Verify the respective provider API keys and that your input/output parameters are valid.
- Mastra Dev issues: Rebuild (`npm run build`) and ensure dist files exist; check Node version (>= 20).

## License
MIT
