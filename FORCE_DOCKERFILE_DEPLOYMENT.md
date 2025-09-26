# Force Dockerfile Deployment in Digital Ocean

## 🚨 **Issue**: Digital Ocean Still Shows Buildpack Option

If Digital Ocean is still detecting both buildpack and Dockerfile options, follow these steps to force Dockerfile usage:

## 🔧 **Solution Steps**

### **Step 1: Manual App Creation (Recommended)**

1. **Go to Digital Ocean App Platform**
2. **Click "Create App"**
3. **Connect GitHub Repository**
4. **In the "Services" section**:
   - Click "Edit" on the detected service
   - **Change "Source Type" from "Source Code" to "Dockerfile"**
   - **Select "Dockerfile" as the source**
   - **Set Dockerfile path to**: `Dockerfile`
   - **Set Source Directory to**: `/` (root)

### **Step 2: Alternative - Use App Spec**

1. **Go to Digital Ocean App Platform**
2. **Click "Create App"**
3. **Select "App Spec" tab**
4. **Paste the following configuration**:

```yaml
name: weather-agent
services:
- name: weather-agent-backend
  source_dir: /
  github:
    repo: your-username/weather-mcp-kd
    branch: main
  dockerfile_path: Dockerfile
  instance_count: 1
  instance_size_slug: basic-xxs
  http_port: 3001
  envs:
  - key: NODE_ENV
    value: production
  - key: PORT
    value: "3001"
  - key: MASTRA_API_KEY
    value: ${MASTRA_API_KEY}
  - key: OPENWEATHER_API_KEY
    value: ${OPENWEATHER_API_KEY}
  - key: MUX_TOKEN_ID
    value: ${MUX_TOKEN_ID}
  - key: MUX_TOKEN_SECRET
    value: ${MUX_TOKEN_SECRET}
  - key: ANTHROPIC_API_KEY
    value: ${ANTHROPIC_API_KEY}
  - key: DEEPGRAM_API_KEY
    value: ${DEEPGRAM_API_KEY}

static_sites:
- name: weather-agent-frontend
  source_dir: /frontend
  github:
    repo: your-username/weather-mcp-kd
    branch: main
  build_command: npm run build
  output_dir: dist
  routes:
  - path: /
  envs:
  - key: VITE_MASTRA_API_HOST
    value: ${WEATHER_AGENT_BACKEND_URL}
  - key: VITE_WEATHER_AGENT_ID
    value: weatherAgent
```

### **Step 3: Environment Variables**

Set these environment variables in Digital Ocean:

```
MASTRA_API_KEY=your_mastra_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
ANTHROPIC_API_KEY=your_anthropic_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

## 🎯 **Why This Happens**

Digital Ocean automatically detects:
- **Buildpack**: When it finds `package.json` files
- **Dockerfile**: When it finds a `Dockerfile`

Since our project has both, it shows both options. The solution is to **manually select Dockerfile** during app creation.

## ✅ **Verification**

After deployment, verify:

1. **Backend Service**:
   - URL: `https://your-app-name.ondigitalocean.app`
   - Health check: `GET /health` should return 200 OK
   - Agent endpoint: `GET /api/agents/weatherAgent/stream/vnext`

2. **Frontend Static Site**:
   - URL: `https://your-app-name.ondigitalocean.app`
   - Should load the React weather chat interface
   - Should connect to backend API

## 🔄 **If Still Having Issues**

1. **Delete the app** and recreate it
2. **Use the App Spec method** (Step 2 above)
3. **Contact Digital Ocean support** if buildpack is still being forced

## 📝 **Important Notes**

- The `.do/app.yaml` file in the repository is for reference
- You must manually configure the app in Digital Ocean UI
- The Dockerfile approach is more reliable for complex monorepo setups
- Buildpack detection is automatic and cannot be disabled via repository files
