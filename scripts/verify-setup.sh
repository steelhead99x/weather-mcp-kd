#!/bin/bash

# Verification Script for Environment Configuration
# Run this script to verify that all fixes have been applied correctly

set -e  # Exit on any error

echo "🔍 Weather MCP Agent - Setup Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description: Found"
        return 0
    else
        echo -e "${RED}✗${NC} $description: Missing"
        return 1
    fi
}

# Function to check if a file contains a specific pattern
check_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if [ -f "$file" ] && grep -q "$pattern" "$file"; then
        echo -e "${GREEN}✓${NC} $description: Correct"
        return 0
    else
        echo -e "${RED}✗${NC} $description: Incorrect or missing"
        return 1
    fi
}

# Function to check environment variable
check_env_var() {
    local file=$1
    local var=$2
    local description=$3
    
    if [ -f "$file" ] && grep -q "^${var}=" "$file"; then
        local value=$(grep "^${var}=" "$file" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ -z "$value" ] || [ "$value" == "your_"* ] || [ "$value" == "undefined" ]; then
            echo -e "${YELLOW}⚠${NC} $description: Set but needs value"
            return 2
        else
            echo -e "${GREEN}✓${NC} $description: Configured"
            return 0
        fi
    else
        echo -e "${RED}✗${NC} $description: Missing"
        return 1
    fi
}

echo "📁 Step 1: Checking File Structure"
echo "-----------------------------------"
check_file ".env" "Root .env file"
check_file "env.example" "Root env.example file"
check_file "backend/env.example" "Backend env.example file"
check_file "frontend/.env" "Frontend .env file"
check_file "frontend/env.example" "Frontend env.example file"
check_file "ENV_SETUP_GUIDE.md" "Environment setup guide"
check_file "FIXES_SUMMARY.md" "Fixes summary document"
echo ""

echo "🔧 Step 2: Checking Backend Configuration"
echo "-----------------------------------"
check_content "backend/src/index.ts" "weather: weatherAgent" "Agent registration uses 'weather' key"
check_content "backend/src/index.ts" "id: 'weather', name: 'weather'" "Agent API endpoint returns 'weather'"
check_content "backend/src/index.ts" "existsSync(rootEnvPath)" "Backend has flexible env loading"
check_content "backend/src/mastra/index.ts" "weather: weatherAgent" "Mastra exports use 'weather' key"
echo ""

echo "🎨 Step 3: Checking Frontend Configuration"
echo "-----------------------------------"
check_env_var "frontend/.env" "VITE_WEATHER_AGENT_ID" "Agent ID"
check_content "frontend/.env" "VITE_WEATHER_AGENT_ID=weather" "Agent ID is 'weather' (not 'weatherAgent')"
check_env_var "frontend/.env" "VITE_MASTRA_API_HOST" "Mastra API host"
check_env_var "frontend/.env" "VITE_MUX_KEY_SERVER_URL" "Mux key server URL"
echo ""

echo "🔑 Step 4: Checking Required Environment Variables"
echo "-----------------------------------"
if [ -f ".env" ]; then
    check_env_var ".env" "NODE_ENV" "NODE_ENV"
    check_env_var ".env" "PORT" "PORT"
    check_env_var ".env" "ANTHROPIC_API_KEY" "Anthropic API key"
    check_env_var ".env" "MUX_TOKEN_ID" "Mux token ID"
    check_env_var ".env" "MUX_TOKEN_SECRET" "Mux token secret"
    check_env_var ".env" "DEEPGRAM_API_KEY" "Deepgram API key"
    check_env_var ".env" "CORS_ORIGINS" "CORS origins"
else
    echo -e "${RED}✗${NC} Root .env file not found - cannot check environment variables"
fi
echo ""

echo "📦 Step 5: Checking Package Dependencies"
echo "-----------------------------------"
if [ -f "backend/package.json" ]; then
    echo -e "${GREEN}✓${NC} Backend package.json exists"
    
    # Check if node_modules exists
    if [ -d "backend/node_modules" ]; then
        echo -e "${GREEN}✓${NC} Backend dependencies installed"
    else
        echo -e "${YELLOW}⚠${NC} Backend dependencies not installed - run 'cd backend && npm install'"
    fi
else
    echo -e "${RED}✗${NC} Backend package.json missing"
fi

if [ -f "frontend/package.json" ]; then
    echo -e "${GREEN}✓${NC} Frontend package.json exists"
    
    # Check if node_modules exists
    if [ -d "frontend/node_modules" ]; then
        echo -e "${GREEN}✓${NC} Frontend dependencies installed"
    else
        echo -e "${YELLOW}⚠${NC} Frontend dependencies not installed - run 'cd frontend && npm install'"
    fi
else
    echo -e "${RED}✗${NC} Frontend package.json missing"
fi
echo ""

echo "🧪 Step 6: Quick Functionality Test"
echo "-----------------------------------"

# Check if backend can be started (dry run)
if [ -f "backend/package.json" ] && [ -d "backend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Backend appears ready to run"
    echo "   To start: cd backend && npm run dev"
else
    echo -e "${YELLOW}⚠${NC} Backend may not be ready - install dependencies first"
fi

# Check if frontend can be started (dry run)
if [ -f "frontend/package.json" ] && [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend appears ready to run"
    echo "   To start: cd frontend && npm run dev"
else
    echo -e "${YELLOW}⚠${NC} Frontend may not be ready - install dependencies first"
fi
echo ""

echo "📊 Verification Summary"
echo "-----------------------------------"
echo ""
echo "Next Steps:"
echo "1. Review any ${RED}✗${NC} (failed) or ${YELLOW}⚠${NC} (warning) items above"
echo "2. Check ENV_SETUP_GUIDE.md for detailed setup instructions"
echo "3. Install dependencies if needed:"
echo "   - Root: npm install"
echo "   - Backend: cd backend && npm install"
echo "   - Frontend: cd frontend && npm install"
echo "4. Start the application:"
echo "   - Development: npm run dev (starts both frontend and backend)"
echo "   - Backend only: cd backend && npm run dev"
echo "   - Frontend only: cd frontend && npm run dev"
echo "5. Test the setup:"
echo "   - Backend health: curl http://localhost:3001/health"
echo "   - Agent endpoint: curl http://localhost:3001/api/agents"
echo "   - Frontend: Open http://localhost:5173 in your browser"
echo ""
echo "📚 Documentation:"
echo "- ENV_SETUP_GUIDE.md - Environment setup guide"
echo "- FIXES_SUMMARY.md - Summary of all fixes applied"
echo "- README.md - General project documentation"
echo ""
echo "✅ Verification complete!"

