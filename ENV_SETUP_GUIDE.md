# Environment Setup Guide

This guide explains how to properly configure environment variables for the Weather MCP Agent application.

## Overview

This is a monorepo with three main packages:
- **Backend**: Express server with Mastra agents
- **Frontend**: React/Vite application
- **Shared**: Common types and utilities

## Environment Variable Structure

### Root Level
The backend loads environment variables from the **root `.env` file** (located at the project root).

```
weather-mcp-kd/
├── .env                 ← Backend loads from here
├── env.example          ← Template for root .env
├── backend/
│   └── env.example      ← Reference for backend variables
└── frontend/
    ├── .env             ← Frontend-specific env file
    └── env.example      ← Template for frontend/.env
```

## Setup Instructions

### 1. Create Root .env File

```bash
# Copy the example file
cp env.example .env
```

Then edit `.env` and fill in your actual values:

```bash
# Required for AI features
ANTHROPIC_API_KEY=sk-ant-... # Get from https://console.anthropic.com

# Required for Mux video features
MUX_TOKEN_ID=...              # Get from https://dashboard.mux.com/settings
MUX_TOKEN_SECRET=...          # Get from https://dashboard.mux.com/settings

# Required for text-to-speech
DEEPGRAM_API_KEY=...          # Get from https://console.deepgram.com
```

### 2. Create Frontend .env File

```bash
# Copy the example file
cd frontend
cp env.example .env
```

For local development, the defaults should work:

```bash
VITE_MASTRA_API_HOST=http://localhost:3001
VITE_WEATHER_AGENT_ID=weather
```

For production deployment, update:

```bash
VITE_MASTRA_API_HOST=https://your-production-domain.com
```

### 3. Verify Configuration

Run the backend and check for environment errors:

```bash
cd backend
npm run dev
```

You should see:
```
✓ Weather MCP server listening on http://0.0.0.0:3001
✓ Environment: development
```

Run the frontend:

```bash
cd frontend
npm run dev
```

You should see:
```
✓ [Mastra] Connection test successful
```

## Important Notes

### Agent ID Consistency

The agent ID **must match** between frontend and backend:

- **Backend**: Agent is named `'weather'` (lowercase)
- **Frontend**: Must set `VITE_WEATHER_AGENT_ID=weather` (lowercase)

### Backend Environment Loading

The backend loads environment variables from the **root** `.env` file using:

```typescript
config({ path: resolvePath(process.cwd(), '../.env') });
```

This means:
- When running `npm run dev` from the `backend/` directory, it loads `../​.env` (root)
- When running from the root directory, it loads `./.env`

### Frontend Environment Variables

All frontend environment variables **must** be prefixed with `VITE_`:

- ✅ `VITE_MASTRA_API_HOST`
- ✅ `VITE_WEATHER_AGENT_ID`
- ❌ `MASTRA_API_HOST` (won't be exposed to frontend)

### Required vs Optional Variables

**Required for basic functionality:**
- `ANTHROPIC_API_KEY` - AI model access
- `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` - Video features
- `DEEPGRAM_API_KEY` - Text-to-speech

**Optional:**
- `DATABASE_URL` - If using database features
- `REDIS_URL` - If using Redis caching
- `MASTRA_API_KEY` - If using Mastra Cloud features

## Common Issues

### Issue: "Failed to load weather agent"

**Cause**: Frontend can't connect to backend

**Solution**: Check that:
1. Backend is running (`cd backend && npm run dev`)
2. `VITE_MASTRA_API_HOST` is set correctly in `frontend/.env`
3. CORS origins include your frontend URL

### Issue: "Agent not found"

**Cause**: Agent ID mismatch between frontend and backend

**Solution**: Verify that `VITE_WEATHER_AGENT_ID=weather` in `frontend/.env`

### Issue: "Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET"

**Cause**: Mux credentials not set in root `.env`

**Solution**: Add your Mux credentials to the root `.env` file

### Issue: Backend can't find .env file

**Cause**: Running backend from wrong directory

**Solution**: 
- Either run from `backend/` directory (it will load `../​.env`)
- Or run from root directory and update the path in `backend/src/index.ts`

## Environment Variables Reference

### Backend Variables (Root .env)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | Environment mode | `development` |
| `PORT` | No | Backend server port | `3001` |
| `HOST` | No | Backend server host | `0.0.0.0` |
| `CORS_ORIGINS` | No | Allowed CORS origins | See env.example |
| `ANTHROPIC_API_KEY` | Yes | Claude API key | - |
| `ANTHROPIC_MODEL` | No | Claude model name | `claude-3-5-haiku-latest` |
| `MUX_TOKEN_ID` | Yes | Mux API token ID | - |
| `MUX_TOKEN_SECRET` | Yes | Mux API token secret | - |
| `MUX_PLAYBACK_POLICY` | No | Playback policy | `signed` |
| `DEEPGRAM_API_KEY` | Yes | Deepgram API key | - |
| `DEEPGRAM_TTS_MODEL` | No | TTS model | `aura-asteria-en` |

### Frontend Variables (frontend/.env)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VITE_MASTRA_API_HOST` | Yes | Backend API URL | `http://localhost:3001` |
| `VITE_WEATHER_AGENT_ID` | Yes | Agent ID | `weather` |
| `VITE_MUX_ASSET_ID` | No | Default Mux asset | Default asset ID |
| `VITE_MUX_KEY_SERVER_URL` | Yes | Mux key server URL | StreamingPortfolio keyserver |

## Security Best Practices

1. **Never commit `.env` files** - They contain secrets
2. **Always commit `.env.example` files** - They're templates
3. **Use different credentials** for development vs production
4. **Rotate API keys** periodically
5. **Use environment-specific** `.env` files for different deployments

## Deployment

### Production Deployment

For production, create a `.env.production` file or set environment variables through your hosting provider:

```bash
# Backend (set in your hosting provider)
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://your-frontend-domain.com
ANTHROPIC_API_KEY=your-production-key
MUX_TOKEN_ID=your-production-token
MUX_TOKEN_SECRET=your-production-secret
DEEPGRAM_API_KEY=your-production-key

# Frontend build-time variables
VITE_MASTRA_API_HOST=https://your-backend-domain.com
VITE_WEATHER_AGENT_ID=weather
```

### Docker Deployment

When using Docker, environment variables can be passed via:

1. **Docker Compose** (`docker-compose.yml`):
```yaml
services:
  backend:
    env_file:
      - .env
```

2. **Docker Run** (command line):
```bash
docker run -e ANTHROPIC_API_KEY=xxx -e MUX_TOKEN_ID=xxx ...
```

3. **Environment file**:
```bash
docker run --env-file .env your-image
```

## Getting API Keys

### Anthropic (Claude)
1. Visit https://console.anthropic.com
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key

### Mux
1. Visit https://dashboard.mux.com
2. Sign up or log in
3. Go to Settings → Access Tokens
4. Create a new token with Video permissions

### Deepgram
1. Visit https://console.deepgram.com
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key with TTS permissions

## Support

If you encounter issues:

1. Check the backend logs: `cd backend && npm run dev`
2. Check the frontend console: Open browser DevTools
3. Verify all required environment variables are set
4. Ensure API keys are valid and have correct permissions
5. Check CORS configuration if getting network errors

---

**Last Updated**: October 2025

