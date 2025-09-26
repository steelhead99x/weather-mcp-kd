# Digital Ocean App Platform Deployment Guide

## Overview
This guide explains how to deploy the Weather MCP application to Digital Ocean App Platform with both backend and frontend services.

## 🚀 Quick Deployment

### 1. Prerequisites
- Digital Ocean account
- GitHub repository with your code
- API keys for services (Anthropic, OpenAI, Mux, Deepgram, Weather API)

### 2. Deploy via App Platform UI

1. **Go to Digital Ocean App Platform**
   - Navigate to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
   - Click "Create App"

2. **Connect GitHub Repository**
   - Select "GitHub" as source
   - Choose your repository: `weather-mcp-kd`
   - Select branch: `main` (or your deployment branch)

3. **Configure App Settings**
   - **App Name**: `weather-mcp-kd`
   - **Source Directory**: `/` (root)
   - **Build Command**: `npm run build && cd src/my-mastra-vite && npm ci && npm run build`
   - **Run Command**: `npm run start:fullstack`
   - **HTTP Port**: `8080`

4. **Set Environment Variables**
   Add these environment variables in the App Platform UI:

   **Required API Keys:**
   ```
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   MUX_TOKEN_ID=your_mux_token_id
   MUX_TOKEN_SECRET=your_mux_token_secret
   DEEPGRAM_API_KEY=your_deepgram_key
   WEATHER_API_KEY=your_weather_key
   ```

   **Application Settings:**
   ```
   NODE_ENV=production
   PORT=8080
   HOST=0.0.0.0
   CORS_ORIGIN=https://weather-mcp-kd.streamingportfolio.com
   TTS_TMP_DIR=/tmp/tts
   VIDEO_MAX_WIDTH=1920
   VIDEO_MAX_HEIGHT=1080
   FFMPEG_PRESET=fast
   FFMPEG_CRF=23
   FFMPEG_THREADS=0
   NODE_OPTIONS=--expose-gc --max-old-space-size=1024
   ```

   **Frontend Settings:**
   ```
   VITE_MASTRA_API_HOST=https://weather-mcp-kd.streamingportfolio.com
   VITE_WEATHER_AGENT_ID=weather
   ```

5. **Configure Instance**
   - **Instance Size**: Basic XXS (512MB RAM, 1 vCPU)
   - **Instance Count**: 1
   - **Auto-scaling**: Disabled (for cost optimization)

6. **Deploy**
   - Click "Create Resources"
   - Wait for deployment to complete
   - Your app will be available at: `https://weather-mcp-kd-xxxxx.ondigitalocean.app`

### 3. Deploy via App Spec (Advanced)

If you prefer using the App Spec file:

1. **Update the App Spec**
   - Edit `.do/app.yaml`
   - Update `your-username/weather-mcp-kd` with your actual GitHub username/repo
   - Update the domain in environment variables

2. **Deploy via CLI**
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

## 🔧 Architecture

The deployment uses a single service that:

1. **Builds both backend and frontend**
   - Mastra backend (TypeScript → JavaScript)
   - Vite frontend (React → Static files)

2. **Runs a production server** (`src/production-server.js`)
   - Starts Mastra backend on port 3000
   - Serves frontend static files
   - Proxies API requests to backend
   - Handles CORS and routing

3. **Serves everything on port 8080**
   - Frontend: `https://your-domain.com/`
   - API: `https://your-domain.com/api/*`

## 📁 File Structure

```
weather-mcp-kd/
├── .do/
│   └── app.yaml                 # App Platform configuration
├── Dockerfile                   # Container configuration
├── package.json                 # Root dependencies & scripts
├── src/
│   ├── production-server.js     # Production server (backend + frontend)
│   ├── mastra/                  # Backend API
│   └── my-mastra-vite/          # Frontend React app
└── DEPLOYMENT_GUIDE.md          # This file
```

## 🐛 Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version (requires >=20.0.0)
   - Verify all dependencies are in package.json
   - Check build logs in App Platform

2. **API Connection Issues**
   - Verify environment variables are set
   - Check CORS configuration
   - Ensure Mastra backend starts successfully

3. **Frontend Not Loading**
   - Check if Vite build completed successfully
   - Verify static file serving path
   - Check browser console for errors

4. **Memory Issues**
   - Increase instance size if needed
   - Check NODE_OPTIONS memory settings
   - Monitor memory usage in App Platform

### Debugging Commands

```bash
# Test locally with Docker
docker build -t weather-mcp-kd .
docker run -p 8080:8080 weather-mcp-kd

# Test production server locally
npm run build
cd src/my-mastra-vite && npm run build
cd ../..
npm run start:fullstack
```

### Logs

View logs in Digital Ocean App Platform:
- Go to your app
- Click "Runtime Logs"
- Check for errors in startup sequence

## 🔄 Updates

To update your deployment:

1. **Push changes to GitHub**
2. **App Platform auto-deploys** (if enabled)
3. **Or manually trigger deployment** in App Platform UI

## 💰 Cost Optimization

- **Instance Size**: Basic XXS is sufficient for most use cases
- **Auto-scaling**: Disable to prevent unexpected costs
- **Monitoring**: Use App Platform metrics to optimize

## 🔒 Security

- **Environment Variables**: Never commit API keys to Git
- **CORS**: Configured for your domain only
- **HTTPS**: Automatically provided by App Platform
- **Health Checks**: Built-in health endpoint for monitoring

## 📊 Monitoring

The app includes:
- Health check endpoint: `/health`
- Runtime logs in App Platform
- Performance metrics
- Error tracking

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review App Platform logs
3. Test locally with Docker
4. Verify environment variables
5. Check API key validity
