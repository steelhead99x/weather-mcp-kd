# Weather Agent KD

A TypeScript weather agent and tooling suite featuring:
- Weather lookup via the U.S. National Weather Service (Weather.gov) using ZIP code or coordinates
- Optional Anthropic-powered weather prompt generation in multiple tones
- Text-to-Speech (TTS) via Deepgram and Cartesia (WS preferred with REST fallback)
- Basic Speech-to-Text (STT) test via Deepgram (Cartesia placeholder)
- An experimental MCP server exposing a weather tool

This README reflects the current codebase and package.json scripts.

## Requirements
- Node.js 18.18 or newer (provides global fetch and ESM)
- npm 9+ recommended

## Install
```
npm install
```

## Environment Setup
Use the provided sample to configure keys and options, then create your own .env:
```
cp .env.example .env
# Edit .env and fill in values
```
Key variables (see .env.example for the full list and comments):
- ANTHROPIC_API_KEY — Required for Anthropic test scripts (Claude text generation)
- ANTHROPIC_MODEL — Optional model override (default currently set to "claude-3-haiku-20240307")
- CARTESIA_API_KEY, CARTESIA_VOICE, CARTESIA_TTS_MODEL, CARTESIA_SAMPLE_RATE — Optional; enable Cartesia TTS
- DEEPGRAM_API_KEY, DEEPGRAM_TTS_MODEL/DEEPGRAM_VOICE — Optional; enable Deepgram TTS
- WEATHER_MCP_USER_AGENT — Courtesy header for Weather.gov requests (recommended)
- STT_INPUT_FILE, STT_OUTPUT_FILE, STT_PROVIDER — Optional; configure STT test script
- TTS_TEXT, TTS_OUTPUT_BASE, TTS_PROVIDER, TTS_FORMAT — Optional; configure TTS test script

Note: Please set a descriptive WEATHER_MCP_USER_AGENT per Weather.gov policy.

## Project Layout
- src/index.ts — App entry; runs a minimal weather agent stub
- src/agents/weather-agent.ts — Agent facade and Claude-generation tester
- src/tools/weather.ts — Weather tools (get_weather_by_zip, get_weather_by_coordinates)
- src/mcp/weather-server.ts — Experimental MCP server exposing getWeatherByZip
- src/scripts/test-zip.ts — Test the ZIP weather tool
- src/scripts/test-claude.ts — Test Anthropic weather prompt generation with tones
- src/scripts/test-weather-agent.ts — Test the agent stub
- src/scripts/test-stt.ts — Test STT providers (Deepgram supported; Cartesia placeholder)
- src/scripts/test-tts.ts — Test TTS providers (Deepgram and Cartesia)

TypeScript is configured to compile everything under src to dist via `tsc` (see tsconfig.json).

## Scripts (from package.json)
- dev: Build then launch Mastra Dev Playground (uses dist/mastra/index.js)
- build: Compile TypeScript to dist/
- start: Run dist/index.js
- typecheck: Type-check only (no emit)
- test:zip: Build then run dist/scripts/test-zip.js
- test:claude: Build then run dist/scripts/test-claude.js (requires ANTHROPIC_API_KEY)
- test:weather-agent: Build then run dist/scripts/test-weather-agent.js
- test:stt: Build then run dist/scripts/test-stt.js
- test:stt:deepgram: Build then run Deepgram STT on files/sample.wav
- test:stt:cartesia: Build then run Cartesia STT placeholder on files/sample.wav
- test:tts: Build then run dist/scripts/test-tts.js
- test:tts:deepgram: Build then TTS via Deepgram
- test:tts:cartesia: Build then TTS via Cartesia
- test:all: Run all of the above tests sequentially

Run any script using npm, for example:
```
npm run test:zip
npm run test:claude
npm run test:tts:deepgram
npm run test:stt:deepgram
```

## Usage Examples

### Start the Mastra Dev Playground
```
npm run dev
```
This builds the project and launches the Mastra Dev Playground, which loads dist/mastra/index.js by default (a shim that re-exports from app.js). Set ANTHROPIC_API_KEY in your .env to use the Anthropic-powered agent.

### Run the minimal agent stub (optional)
```
npm start
```
This runs dist/index.js and prints a simple echo; no API keys required for this path.

### Weather by ZIP (tool test)
```
npm run test:zip
```
This calls the Weather.gov API via Zippopotam.us geocoding. Recommend setting WEATHER_MCP_USER_AGENT in .env.

### Weather by Coordinates (programmatic)
The tool `getWeatherByCoordinates` is exported from src/tools/weather.ts and can be imported in your code. It validates latitude/longitude and returns a normalized forecast array.

### Claude-generated weather prompts (requires ANTHROPIC_API_KEY)
```
npm run test:claude
```
Generates a short, TTS-friendly weather report in several tones:
- professional, groovy, librarian, sports
Override model by setting ANTHROPIC_MODEL in .env.

### Text-to-Speech
- Deepgram (REST):
```
npm run test:tts:deepgram
```
- Cartesia (WebSocket preferred; REST fallback automatically):
```
npm run test:tts:cartesia
```
Configure via .env: CARTESIA_API_KEY, CARTESIA_VOICE, CARTESIA_TTS_MODEL, TTS_FORMAT (mp3|wav for Cartesia; multiple formats for Deepgram). Output files save under TTS_OUTPUT_BASE with provider-specific suffixes.

### Speech-to-Text
- Deepgram (REST):
```
npm run test:stt:deepgram
```
- Cartesia: placeholder (requires CARTESIA_API_URL/CARTESIA_API_KEY if available) — adjust as needed.

Use STT_INPUT_FILE and STT_OUTPUT_FILE in .env to control input and where transcripts are written (supports .json or .txt).

## MCP Server (experimental)
The file src/mcp/weather-server.ts exports an MCPServer instance that exposes the getWeatherByZip tool. This project does not stand up a long-running server process by default; embed or adapt it into your own MCP host as needed.

## Mastra Dev Playground Integration
This repo exposes a Mastra app you can load in the Mastra Dev Playground:
- Mastra app file: src/mastra/app.ts (compiled to dist/mastra/app.js)
- Agents: weather
- Tools: getWeatherByZip, getWeatherByCoordinates

Local sanity test:
```
npm run test:mastra
```

Using in a Mastra Dev Playground (one approach):
- Point your playground to import the default export from dist/mastra/app.js, or import { weather } for the single agent.
- The agent uses Anthropic by default; set ANTHROPIC_API_KEY and optionally ANTHROPIC_MODEL in .env.
- Weather.gov requests include WEATHER_MCP_USER_AGENT when provided.

If you are using a separate Mastra playground host/app, add this package as a workspace/dependency and import:
```
import mastra from 'weather-agent-kd/dist/mastra/app.js';
// or
import { weather } from 'weather-agent-kd/dist/mastra/app.js';
```

### How to start the Mastra Dev Playground
There are two common ways to use this project with the Mastra Dev Playground:

1) If you already have the Mastra Dev Playground app
- Build this repo so the compiled app exists at dist/mastra/index.js (and dist/mastra/app.js):
  - `npm run build`
- In the Playground, add/import your app by pointing it to the built file:
  - Default export: `dist/mastra/app.js` (exports the Mastra instance)
  - Named export: `{ weather }` (single agent)
- Set environment variables before launching (at minimum for Anthropic if you plan to generate text):
  - `ANTHROPIC_API_KEY`
  - Optionally `ANTHROPIC_MODEL` (defaults to `claude-3-haiku-20240307`)
  - `WEATHER_MCP_USER_AGENT` recommended for Weather.gov

2) If you don’t have the Playground yet
- Follow the official Mastra documentation to install or open the Dev Playground.
- Once running, follow the same steps above to point it to `dist/mastra/app.js`.

Troubleshooting
- If the Playground doesn’t find your agent:
  - Ensure you ran `npm run build` and that `dist/mastra/index.js` (and `dist/mastra/app.js`) exists.
  - Ensure the file path you point to is absolute or correctly relative to the Playground’s import method.
- If requests to Weather.gov fail:
  - Provide a descriptive `WEATHER_MCP_USER_AGENT` in your `.env`.
- If text generation fails:
  - Make sure `ANTHROPIC_API_KEY` is set. You can also run `npm run test:mastra` locally to confirm the app loads.


## Legal / Attribution
- Weather data from api.weather.gov — follow their usage policy and include a descriptive User-Agent
- Geocoding via api.zippopotam.us

## License
MIT
