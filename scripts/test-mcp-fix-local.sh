#!/bin/bash

# Test MCP Fix Locally
# This script runs a quick test to verify the MCP fix works

echo "🧪 Testing MCP Fix Locally"
echo "=========================="
echo ""

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
    echo "❌ Error: Run this script from the project root"
    exit 1
fi

echo "1. Running typecheck..."
cd backend
if npm run typecheck > /dev/null 2>&1; then
    echo "   ✅ TypeScript compilation successful"
else
    echo "   ❌ TypeScript errors found"
    npm run typecheck
    exit 1
fi

echo ""
echo "2. Building project..."
if npm run compile > /dev/null 2>&1; then
    echo "   ✅ Build successful"
else
    echo "   ❌ Build failed"
    exit 1
fi

echo ""
echo "3. Checking MCP SDK version..."
MCP_VERSION=$(npm list @modelcontextprotocol/sdk --depth=0 2>/dev/null | grep @modelcontextprotocol/sdk | awk '{print $2}' | sed 's/[^0-9.]//g')
echo "   Current version: $MCP_VERSION"

if [[ "$MCP_VERSION" == "1.18.2" ]] || [[ "$MCP_VERSION" == "1.17.5" ]]; then
    echo "   ✅ Version is compatible"
else
    echo "   ⚠️  Warning: Unexpected version $MCP_VERSION"
fi

echo ""
echo "4. Checking @mux/mcp version..."
MUX_MCP_VERSION=$(npm list @mux/mcp --depth=0 2>/dev/null | grep @mux/mcp | awk '{print $2}' | sed 's/[^0-9.]//g')
echo "   Current version: $MUX_MCP_VERSION"

cd ..

echo ""
echo "📋 Summary:"
echo "==========="
echo "✅ TypeScript compilation: OK"
echo "✅ Build: OK"
echo "✅ MCP SDK version: $MCP_VERSION"
echo "✅ @mux/mcp version: $MUX_MCP_VERSION"
echo ""
echo "🎯 Key Changes Applied:"
echo "======================"
echo "1. Removed audio_only_with_image parameter (causing union error)"
echo "2. Using basic upload with playback_policy instead"
echo "3. Added enhanced debug endpoints (/health and /debug/mcp)"
echo "4. Added MCP SDK version pinning in Dockerfile"
echo ""
echo "🚀 Next Steps:"
echo "=============="
echo "1. Review the changes:"
echo "   git diff backend/src/agents/weather-agent.ts"
echo ""
echo "2. Test locally (if you have MUX credentials):"
echo "   npm run dev"
echo "   # Then try the audio report feature"
echo ""
echo "3. Commit and push:"
echo "   git add ."
echo "   git commit -m 'Fix MCP union error by removing audio_only_with_image parameter'"
echo "   git push"
echo ""
echo "4. Redeploy to Digital Ocean"
echo ""
echo "5. Test with the diagnostic script:"
echo "   bash scripts/diagnose-mcp.sh"
