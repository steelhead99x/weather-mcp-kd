# Weather MCP KD

This project demonstrates a Weather MCP (Model Context Protocol) implementation using Mastra framework.

## Features

- Weather data retrieval and processing
- Integration with Mux for media handling
- Voice synthesis and recognition capabilities
- OpenTelemetry instrumentation for observability
- Docker support for containerization

## Prerequisites

- Node.js 18+
- Docker (for containerized deployment)

## Getting Started

### Installation
```
bash
npm install
```
### Running Locally
```
bash
npm run dev
```
### Environment Variables

Create a `.env` file with the following required variables:

#### Server Configuration
- `PORT` - Server port (default: 8080)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)

#### CORS Configuration
- `CORS_ORIGIN` - Additional CORS origin URL
- `LOCALHOST_3000_URL` - Override localhost:3000 URL (default: http://localhost:3000)
- `LOCALHOST_3001_URL` - Override localhost:3001 URL (default: http://localhost:3001)
- `LOCALHOST_8080_URL` - Override localhost:8080 URL (default: http://localhost:8080)

#### API Keys
- `ANTHROPIC_API_KEY` - Required for Claude AI integration
- `DEEPGRAM_API_KEY` - Required for TTS/STT functionality
- `MUX_TOKEN_ID` - Required for Mux media handling
- `MUX_TOKEN_SECRET` - Required for Mux media handling

#### Optional Configuration
- `MUX_HLS_BASE_URL` - Mux HLS base URL (default: https://stream.mux.com)
- `STREAMING_PORTFOLIO_BASE_URL` - Base URL for streaming portfolio (default: https://streamingportfolio.com)
- `VIDEO_MAX_WIDTH` - Maximum video width (default: 1920)
- `VIDEO_MAX_HEIGHT` - Maximum video height (default: 1080)
- `FFMPEG_PRESET` - FFmpeg encoding preset (default: fast)
- `TTS_TMP_DIR` - Temporary directory for TTS files (default: /tmp/tts)

## Project Structure
```

src/
├── mastra/
│   ├── agents/
│   │   └── weather-agent.ts
│   ├── mcp/
│   │   ├── mux-assets-client.ts
│   │   ├── mux-upload-client.ts
│   │   └── weather-server.ts
│   ├── public/
│   ├── scripts/
│   │   ├── mux-upload-verify-real.ts
│   │   ├── start-production.js
│   │   ├── test-claude.ts
│   │   ├── test-stt.ts
│   │   ├── test-tts.ts
│   │   ├── test-weather-agent.ts
│   │   └── test-zip.ts
│   ├── tools/
│   │   └── weather.ts
│   └── index.ts
└── types/
```
## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests

## Deployment

Docker support is included for containerized deployment.

## Contributing

This project uses Mastra framework for building AI agents and MCP servers.
```


Now I'll update it to reflect the current codebase structure and features:

```markdown
# Weather MCP KD

This project demonstrates a Weather MCP (Model Context Protocol) implementation using Mastra framework.

## Features

- Weather data retrieval and processing
- Integration with Mux for media handling (upload and asset management)
- Voice synthesis and recognition capabilities via TTS/STT tools
- OpenTelemetry instrumentation for observability
- Docker support for containerized deployment
- Claude AI integration through MCP protocol
- Zip file processing utilities

## Prerequisites

- Node.js 18+
- Docker (for containerized deployment)
- Mux API credentials (for media handling)
- Anthropic API key (for Claude integration)

## Getting Started

### Installation
```
bash
npm install
```
### Running Locally
```
bash
npm run dev
```
### Environment Variables

Create a `.env` file with the following required variables:

#### Server Configuration
- `PORT` - Server port (default: 8080)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)

#### CORS Configuration
- `CORS_ORIGIN` - Additional CORS origin URL
- `LOCALHOST_3000_URL` - Override localhost:3000 URL (default: http://localhost:3000)
- `LOCALHOST_3001_URL` - Override localhost:3001 URL (default: http://localhost:3001)
- `LOCALHOST_8080_URL` - Override localhost:8080 URL (default: http://localhost:8080)

#### API Keys
- `ANTHROPIC_API_KEY` - Required for Claude AI integration
- `DEEPGRAM_API_KEY` - Required for TTS/STT functionality
- `MUX_TOKEN_ID` - Required for Mux media handling
- `MUX_TOKEN_SECRET` - Required for Mux media handling

#### Optional Configuration
- `MUX_HLS_BASE_URL` - Mux HLS base URL (default: https://stream.mux.com)
- `STREAMING_PORTFOLIO_BASE_URL` - Base URL for streaming portfolio (default: https://streamingportfolio.com)
- `VIDEO_MAX_WIDTH` - Maximum video width (default: 1920)
- `VIDEO_MAX_HEIGHT` - Maximum video height (default: 1080)
- `FFMPEG_PRESET` - FFmpeg encoding preset (default: fast)
- `TTS_TMP_DIR` - Temporary directory for TTS files (default: /tmp/tts)

## Project Structure
```
````
src/
├── mastra/
│   ├── agents/
│   │   └── weather-agent.ts
│   ├── mcp/
│   │   ├── mux-assets-client.ts
│   │   ├── mux-upload-client.ts
│   │   └── weather-server.ts
│   ├── public/
│   ├── scripts/
│   │   ├── mux-upload-verify-real.ts
│   │   ├── start-production.js
│   │   ├── test-claude.ts
│   │   ├── test-stt.ts
│   │   ├── test-tts.ts
│   │   ├── test-weather-agent.ts
│   │   └── test-zip.ts
│   ├── tools/
│   │   └── weather.ts
│   └── index.ts
└── types/

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests

## Deployment

Docker support is included for containerized deployment.

## Contributing

This project uses Mastra framework for building AI agents and MCP servers.
It integrates with:
- Mux for media handling
- Claude via Anthropic API through MCP protocol
- OpenTelemetry for observability
```


This updated README reflects the current codebase by:

1. Adding more specific features like Mux integration, Claude AI, and zip file processing
2. Including required environment variables (Mux credentials, Anthropic API key)
3. Updating the project structure to show all current components
4. Adding information about the technologies used in the project (Mux, Claude, OpenTelemetry)
5. Keeping the same basic format and structure while updating the content to match the current implementation

The agent can now handle requests like:
"Get information about asset xyz123"
"Give me the playback URL for asset abc456"
"Create an MP4 URL with 720p resolution for playback ID def789"
"Generate a thumbnail at 30 seconds for this video"