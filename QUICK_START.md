# Quick Start Guide

Welcome! Your Weather MCP Agent codebase has been fixed and verified. Here's everything you need to know to get started.

## ✅ What Was Fixed

All environment configuration and consistency issues have been resolved:

1. ✅ **Agent ID Consistency** - Now uses 'weather' everywhere (was 'weatherAgent' in some places)
2. ✅ **Environment Files** - Proper structure with complete examples
3. ✅ **Backend Environment Loading** - Supports multiple .env file locations
4. ✅ **Frontend Configuration** - Correct defaults and working values
5. ✅ **Documentation** - Comprehensive setup guides created

## 🚀 Start the Application

### Option 1: Start Everything (Recommended)
```bash
# From the root directory
npm run dev
```
This starts both the backend (port 3001) and frontend (port 5173) simultaneously.

### Option 2: Start Separately
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend  
npm run dev
```

## 🧪 Test Your Setup

### 1. Test Backend
```bash
# Health check
curl http://localhost:3001/health
# Expected: {"ok":true,"service":"weather-mcp-server",...}

# Agent endpoint
curl http://localhost:3001/api/agents
# Expected: [{"id":"weather","name":"weather"}]
```

### 2. Test Frontend
1. Open http://localhost:5173 in your browser
2. Open DevTools Console (F12)
3. Look for: `[Mastra] Connection test successful`
4. Enter a 5-digit ZIP code (e.g., 90210)
5. You should get a weather forecast

### 3. Test Full Integration
1. Start both backend and frontend
2. Enter ZIP code: `90210`
3. Type: `audio weather forecast`
4. Wait for the video player to appear
5. Video should play with weather forecast

## 📋 Verification

Run the verification script to check your setup:
```bash
bash scripts/verify-setup.sh
```

All items should show ✓ (green checkmarks).

## 🔑 Environment Variables

### Required Variables (Already Set)
Your `.env` file already has these configured:
- ✅ `ANTHROPIC_API_KEY` - For AI responses
- ✅ `MUX_TOKEN_ID` & `MUX_TOKEN_SECRET` - For video features
- ✅ `DEEPGRAM_API_KEY` - For text-to-speech
- ✅ `PORT` - Backend port (3001)
- ✅ `NODE_ENV` - Environment mode
- ✅ `CORS_ORIGINS` - Allowed origins

### Frontend Variables (Already Set)
Your `frontend/.env` file has:
- ✅ `VITE_MASTRA_API_HOST` - Backend URL (http://localhost:3001)
- ✅ `VITE_WEATHER_AGENT_ID` - Agent ID (weather)
- ✅ `VITE_MUX_KEY_SERVER_URL` - Mux keyserver

## 📂 File Structure

```
weather-mcp-kd/
├── .env                     ← Backend environment variables
├── env.example              ← Template for .env
├── ENV_SETUP_GUIDE.md       ← Detailed environment setup
├── FIXES_SUMMARY.md         ← Summary of all fixes
├── QUICK_START.md           ← This file
├── backend/
│   ├── .env                 ← Not used (loads from root)
│   ├── env.example          ← Backend reference
│   ├── src/
│   │   ├── index.ts         ← Main backend server
│   │   ├── agents/
│   │   │   └── weather-agent.ts
│   │   └── ...
│   └── package.json
└── frontend/
    ├── .env                 ← Frontend environment variables
    ├── env.example          ← Template for frontend/.env
    ├── src/
    │   ├── App.tsx          ← Main React app
    │   ├── components/
    │   │   └── WeatherChat.tsx
    │   └── ...
    └── package.json
```

## 🎯 Key Points

### Agent ID
- **Always use**: `weather` (lowercase, no 'Agent' suffix)
- Backend: Registered as `weather`
- Frontend: `VITE_WEATHER_AGENT_ID=weather`
- API: Returns `{"id":"weather","name":"weather"}`

### Environment Loading
Backend loads .env from:
1. Root directory (`../​.env` when in backend/)
2. Current directory (`./.env` when in root)
3. Backend directory (`backend/.env` as fallback)

Frontend loads from:
- `frontend/.env` (VITE_ prefixed variables only)

### Port Configuration
- Backend: `3001` (configurable via `PORT` in .env)
- Frontend: `5173` (default Vite port)
- Make sure these ports are available

## 🐛 Common Issues

### Issue: "Failed to load weather agent"
**Solution**: 
1. Check backend is running: `curl http://localhost:3001/health`
2. Check `VITE_MASTRA_API_HOST` in `frontend/.env`
3. Check CORS origins include `http://localhost:5173`

### Issue: "Agent not found"
**Solution**: 
1. Verify `VITE_WEATHER_AGENT_ID=weather` in `frontend/.env`
2. Check backend logs for agent registration
3. Test: `curl http://localhost:3001/api/agents`

### Issue: Backend won't start
**Solution**:
1. Check `.env` file exists in root directory
2. Verify all required API keys are set
3. Check logs for specific error messages
4. Try: `cd backend && npm install` to reinstall dependencies

### Issue: Frontend can't connect
**Solution**:
1. Verify backend is running on port 3001
2. Check `VITE_MASTRA_API_HOST=http://localhost:3001`
3. Clear browser cache and reload
4. Check browser console for error messages

### Issue: Video player not working
**Solution**:
1. Verify Mux credentials in root `.env`
2. Check `VITE_MUX_KEY_SERVER_URL` in `frontend/.env`
3. Ensure Mux assets are configured with signed playback
4. Check backend logs for Mux connection errors

## 📚 Additional Documentation

- **ENV_SETUP_GUIDE.md** - Comprehensive environment setup guide
- **FIXES_SUMMARY.md** - Detailed summary of all fixes applied
- **README.md** - General project documentation

## 🆘 Need Help?

1. Run verification: `bash scripts/verify-setup.sh`
2. Check backend logs: Look for `[env]` messages
3. Check browser console: Look for connection errors
4. Review ENV_SETUP_GUIDE.md for detailed troubleshooting

## 🎉 You're Ready!

Your codebase is now properly configured. Start the application and begin testing!

```bash
npm run dev
```

Then visit: http://localhost:5173

---

**Status**: ✅ All systems ready
**Last Verified**: October 2025

