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

Create a `.env` file based on `.env.example` and populate with required values.

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

Create a `.env` file based on `.env.example` and populate with required values.

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