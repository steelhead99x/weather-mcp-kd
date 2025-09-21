# Weather Agent (Mastra + MCP + Mux)

A simple, copy‑paste friendly project that:

- Gets real weather for a US ZIP code (zippopotam.us + api.weather.gov)
- Creates audio (TTS) with Cartesia or Deepgram
- Makes a tiny video (image + audio) and uploads to Mux for streaming

---

Quick Start

1) Install

   npm install

2) Set env (create .env in project root)

   # One TTS provider (optional but recommended)
   CARTESIA_API_KEY=...
   CARTESIA_VOICE=...
   # or
   DEEPGRAM_API_KEY=...
   DEEPGRAM_TTS_MODEL=aura-asteria-en

   # Mux (only if you want uploads)
   MUX_TOKEN_ID=...
   MUX_TOKEN_SECRET=...
   MUX_CORS_ORIGIN=http://localhost

   # Weather API header (friendly contact recommended)
   WEATHER_MCP_USER_AGENT=WeatherMCP/1.0 (you@example.com)

3) Build

   npm run build

4) Try things

   # Dev server (Mastra)
   npm run dev

   # Ask the agent end‑to‑end
   npm run test:weather-agent

   # Weather tool by ZIP
   npm run test:zip

   # TTS quick tests
   npm run test:tts:cartesia
   npm run test:tts:deepgram

   # STT quick tests (optional)
   npm run test:stt:cartesia
   npm run test:stt:deepgram

   # Real Mux upload + verify (needs Mux creds)
   npm run run:mux:upload:verify

---

## 📦 Project Structure

```
src/
└─ mastra/
   ├─ index.ts                  # Mastra app wiring (agent + MCP server)
   ├─ agents/
   │  └─ weather-agent.ts      # Weather agent + TTS upload tool (Mux)
   ├─ tools/
   │  └─ weather.ts            # Weather tool (ZIP -> lat/lon -> forecast from NWS)
   ├─ mcp/
   │  ├─ weather-server.ts     # MCP server exposing the agent/tool
   │  ├─ mux-upload-client.ts  # MCP client wrapper for Mux upload endpoints
   │  └─ mux-assets-client.ts  # MCP client wrapper for Mux assets endpoints
   └─ scripts/                 # Dev/test scripts
```

---

## ⚙️ Prerequisites

- Node.js >= 20
- ffmpeg (ffmpeg-static is bundled and auto-configured)
- Optional TTS service credentials (choose one or both):
  - Cartesia: CARTESIA_API_KEY, CARTESIA_VOICE
  - Deepgram: DEEPGRAM_API_KEY (DEEPGRAM_TTS_MODEL optional)
- To upload to Mux: MUX_TOKEN_ID, MUX_TOKEN_SECRET

Example .env:

```dotenv
# TTS (choose one provider or both)
CARTESIA_API_KEY=...
CARTESIA_VOICE=...
# or
DEEPGRAM_API_KEY=...
DEEPGRAM_TTS_MODEL=aura-asteria-en

# Mux
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_CORS_ORIGIN=http://localhost

# Weather MCP user-agent header
WEATHER_MCP_USER_AGENT="WeatherMCP/1.0 (mail@streamingportfolio.com)"
```

---

## 🚀 Install & Build

```sh
npm install
npm run build
```

---

## ▶️ Run

- Development (Mastra dev):

```sh
npm run dev
```

- Production build runner:

```sh
npm start:production
```

---

## 🧠 Usage (Agent)

The agent greets users, asks for a ZIP code, calls the weather tool to fetch real data, and can invoke a TTS upload tool to produce a Mux streaming URL.

Programmatic import:

```ts
import { mastra } from "./src/mastra/index.ts";
// mastra.agents.weatherAgent ...
```

---

## 🛠️ Weather Tool

- Validates a 5-digit US ZIP code
- Looks up coordinates via https://api.zippopotam.us
- Retrieves forecast via https://api.weather.gov (NWS)
- Returns a compact forecast for the next periods

---

## 🔊 TTS + Video + Mux Upload

Inside the weather agent, a tool (tts-weather-upload) can:

1) Synthesize speech with Cartesia (preferred) or Deepgram (fallback) or a brief silence placeholder if neither is configured
2) Generate a simple MP4 from a static image (files/images/baby.jpeg if present; otherwise a generated blue background)
3) Create an upload URL via Mux MCP and PUT the MP4
4) Poll for a playback ID and return an HLS URL

Outputs also include local file paths for inspection and an optional StreamingPortfolio URL.

---

## ❗ Notes

- Requires Node 20+ (global fetch/Blob and ESM)
- ffmpeg path is set using ffmpeg-static
- The Anthropic chat model defaults to `claude-3-5-haiku-latest` via @ai-sdk/anthropic
- The weather MCP server exposes the agent and tool for MCP-capable clients

---

## 📄 License

MIT © 2025