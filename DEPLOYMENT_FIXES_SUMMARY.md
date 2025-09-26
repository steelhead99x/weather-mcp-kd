# Digital Ocean App Platform Deployment Fixes

## 🎯 Problem Solved
Your Weather MCP application wasn't working on Digital Ocean App Platform because it was only configured to run the backend API, but not serve the frontend React application.

## ✅ What Was Fixed

### 1. **Created Full-Stack Production Server**
- **File**: `src/production-server.js`
- **Purpose**: Serves both Mastra backend API and Vite frontend
- **Features**:
  - Starts Mastra backend on port 3000
  - Serves frontend static files
  - Proxies API requests to backend
  - Handles CORS and SPA routing
  - Health checks and graceful shutdown

### 2. **Updated Dockerfile**
- **Before**: Only built and ran Mastra backend
- **After**: Builds both backend and frontend, runs full-stack server
- **Changes**:
  - Added Vite frontend build step
  - Updated CMD to use `start:fullstack` script
  - Proper dependency management

### 3. **Enhanced Package.json**
- **Added Dependencies**: `express`, `cors`, `http-proxy-middleware`
- **Added Script**: `start:fullstack` for production deployment
- **Purpose**: Support for the production server

### 4. **Created App Platform Configuration**
- **File**: `.do/app.yaml`
- **Purpose**: Digital Ocean App Platform deployment spec
- **Features**:
  - Single service configuration
  - Environment variables
  - Proper port and routing setup
  - Cost-optimized instance size

### 5. **Updated Frontend Configuration**
- **File**: `src/my-mastra-vite/src/lib/mastraClient.ts`
- **Changes**: Better hostname detection for production
- **Purpose**: Frontend connects to same domain as backend

### 6. **Created Deployment Guide**
- **File**: `DEPLOYMENT_GUIDE.md`
- **Purpose**: Step-by-step deployment instructions
- **Includes**: Environment variables, troubleshooting, monitoring

## 🏗️ Architecture

```
Digital Ocean App Platform
├── Single Service (weather-app)
│   ├── Port 8080 (external)
│   ├── Mastra Backend (port 3000 internal)
│   ├── Express Server (production-server.js)
│   │   ├── Serves Frontend Static Files
│   │   ├── Proxies /api/* to Mastra Backend
│   │   └── Handles SPA Routing
│   └── Environment Variables
└── Auto-scaling & Monitoring
```

## 🚀 How It Works

1. **Build Phase**:
   - Builds Mastra backend (TypeScript → JavaScript)
   - Builds Vite frontend (React → Static files)

2. **Runtime**:
   - Starts Mastra backend on port 3000
   - Starts Express server on port 8080
   - Express serves frontend files
   - Express proxies API requests to Mastra

3. **Routing**:
   - `https://your-domain.com/` → Frontend (React app)
   - `https://your-domain.com/api/*` → Mastra backend
   - `https://your-domain.com/health` → Health check

## 📋 Deployment Checklist

### ✅ Files Created/Modified
- [x] `.do/app.yaml` - App Platform configuration
- [x] `src/production-server.js` - Full-stack server
- [x] `Dockerfile` - Updated for full-stack
- [x] `package.json` - Added dependencies and scripts
- [x] `src/my-mastra-vite/src/lib/mastraClient.ts` - Updated for production
- [x] `DEPLOYMENT_GUIDE.md` - Deployment instructions
- [x] `test-deployment.js` - Configuration validator

### ✅ Configuration Verified
- [x] All required files exist
- [x] Package.json scripts configured
- [x] Dependencies installed
- [x] App Platform config valid
- [x] Dockerfile properly configured

## 🔧 Environment Variables Required

Set these in Digital Ocean App Platform:

```bash
# API Keys
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
MUX_TOKEN_ID=your_key
MUX_TOKEN_SECRET=your_key
DEEPGRAM_API_KEY=your_key
WEATHER_API_KEY=your_key

# Application Settings
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
CORS_ORIGIN=https://weather-mcp-kd.streamingportfolio.com

# Frontend Settings
VITE_MASTRA_API_HOST=https://weather-mcp-kd.streamingportfolio.com
VITE_WEATHER_AGENT_ID=weather
```

## 🎉 Benefits

1. **Single Service**: Cost-effective deployment
2. **Full-Stack**: Both backend and frontend served
3. **Auto-Scaling**: Digital Ocean handles scaling
4. **HTTPS**: Automatic SSL certificates
5. **Monitoring**: Built-in health checks and logs
6. **Easy Updates**: Git-based deployments

## 🚀 Next Steps

1. **Push to GitHub**: Commit all changes
2. **Create App**: In Digital Ocean App Platform
3. **Connect Repo**: Link your GitHub repository
4. **Set Variables**: Add environment variables
5. **Deploy**: Click deploy and wait for completion
6. **Test**: Visit your app URL and test functionality

## 🐛 Troubleshooting

If deployment fails:

1. **Check Logs**: View runtime logs in App Platform
2. **Verify Variables**: Ensure all API keys are set
3. **Test Locally**: Run `npm run start:fullstack`
4. **Check Build**: Verify both backend and frontend build successfully

## 📊 Performance

- **Instance Size**: Basic XXS (512MB RAM, 1 vCPU)
- **Startup Time**: ~30-60 seconds
- **Memory Usage**: Optimized with garbage collection
- **Cost**: ~$5/month for basic instance

Your Weather MCP application is now ready for production deployment on Digital Ocean App Platform! 🎉
