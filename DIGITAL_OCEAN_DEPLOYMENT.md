# Digital Ocean Deployment Guide

## 🚀 Option 1: Dockerfile Deployment (Recommended)

### Configuration Files

The project includes the following deployment configuration:

1. **`.do/app.yaml`** - Digital Ocean App Platform configuration
2. **`Dockerfile`** - Multi-stage production Docker build
3. **`Dockerfile.simple`** - Simplified Docker build (alternative)

### Setup Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Digital Ocean deployment configuration"
   git push origin main
   ```

2. **Create App in Digital Ocean**:
   - Go to Digital Ocean App Platform
   - Click "Create App"
   - Connect your GitHub repository
   - Select the repository: `your-username/weather-mcp-kd`

3. **Configure Environment Variables**:
   Set these environment variables in Digital Ocean:
   ```
   MASTRA_API_KEY=your_mastra_api_key
   WEATHER_MCP_USER_AGENT=WeatherAgent/1.0 (weather-agent@streamingportfolio.com)
   MUX_TOKEN_ID=your_mux_token_id
   MUX_TOKEN_SECRET=your_mux_token_secret
   ANTHROPIC_API_KEY=your_anthropic_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ```

4. **Deploy**:
   - Digital Ocean will automatically detect the Dockerfile
   - The app will build and deploy automatically
   - Backend will be available at the provided URL
   - Frontend will be served as a static site

### App Configuration

The `.do/app.yaml` file configures:

- **Backend Service**: Uses Dockerfile, exposes port 3001
- **Frontend Static Site**: Builds from `/frontend` directory
- **Environment Variables**: All required API keys
- **Routing**: Frontend serves from root `/`

### Dockerfile Features

- **Multi-stage build**: Optimized for production
- **Node.js 20 Alpine**: Lightweight base image
- **Security**: Non-root user execution
- **Dependencies**: Only production dependencies in final image
- **Build Process**: Shared → Backend → Frontend build order

## 🔧 Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check that all environment variables are set
   - Verify GitHub repository access
   - Check Docker build logs in Digital Ocean

2. **Runtime Errors**:
   - Verify API keys are correctly set
   - Check backend logs for specific errors
   - Ensure port 3001 is properly exposed

3. **Frontend Issues**:
   - Check that `VITE_MASTRA_API_HOST` points to backend URL
   - Verify frontend build completed successfully

### Manual Deployment Commands

If you need to test locally:

```bash
# Build the Docker image
docker build -t weather-agent .

# Run the container
docker run -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e MASTRA_API_KEY=your_key \
  -e WEATHER_MCP_USER_AGENT="WeatherAgent/1.0 (weather-agent@streamingportfolio.com)" \
  weather-agent
```

## 📊 Monitoring

### Health Checks

The backend includes health endpoints:
- `GET /health` - Basic health check
- `GET /api/agents/weatherAgent/stream/vnext` - Agent endpoint test

### Logs

Monitor logs in Digital Ocean App Platform:
- Build logs: Check for compilation errors
- Runtime logs: Check for API connection issues
- Error logs: Check for missing environment variables

## 🎯 Expected Results

After successful deployment:

1. **Backend Service**: 
   - Available at `https://your-app-name.ondigitalocean.app`
   - Weather agent responds to API calls
   - Health endpoint returns 200 OK

2. **Frontend Static Site**:
   - Available at `https://your-app-name.ondigitalocean.app`
   - React app loads correctly
   - Connects to backend API
   - Weather chat interface functional

## 🔄 Updates

To update the deployment:

1. Push changes to GitHub
2. Digital Ocean will automatically rebuild and redeploy
3. Monitor the deployment in App Platform dashboard

## 📝 Notes

- The Dockerfile uses a multi-stage build for optimization
- Frontend is built as a static site for better performance
- Backend runs as a service with proper health checks
- All sensitive data is handled via environment variables
