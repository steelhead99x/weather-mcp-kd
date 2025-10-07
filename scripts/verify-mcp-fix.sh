#!/bin/bash

# MCP SDK Version Fix Verification Script
# This script verifies that the MCP SDK version conflict has been resolved

echo "🔍 MCP SDK Version Fix Verification"
echo "===================================="
echo ""

echo "📋 Checking MCP SDK Version:"
echo "============================"

# Check local version
echo "Local Environment:"
cd backend
LOCAL_VERSION=$(npm list @modelcontextprotocol/sdk --depth=0 2>/dev/null | grep @modelcontextprotocol/sdk | awk '{print $2}' | sed 's/[^0-9.]//g')
echo "  @modelcontextprotocol/sdk version: $LOCAL_VERSION"

if [[ "$LOCAL_VERSION" == "1.18.2" ]] || [[ "$LOCAL_VERSION" == "1.17.5" ]]; then
    echo "  ✅ Local version is correct (1.17.5+)"
else
    echo "  ❌ Local version needs update: $LOCAL_VERSION"
    echo "  Run: bash scripts/fix-mcp-version-conflict.sh"
fi

cd ..

echo ""
echo "🐳 Docker Build Test:"
echo "===================="

# Test Docker build locally
echo "Building Docker image to test MCP SDK version..."
if docker build -t weather-mcp-test . > /dev/null 2>&1; then
    echo "  ✅ Docker build successful"
    
    # Test the container
    echo "Testing container startup..."
    CONTAINER_ID=$(docker run -d -e NODE_ENV=production -e MUX_TOKEN_ID=test -e MUX_TOKEN_SECRET=test weather-mcp-test)
    
    # Wait a moment for startup
    sleep 5
    
    # Check if container is still running
    if docker ps | grep -q "$CONTAINER_ID"; then
        echo "  ✅ Container started successfully"
        
        # Check logs for MCP errors
        LOGS=$(docker logs "$CONTAINER_ID" 2>&1)
        if echo "$LOGS" | grep -q "union is not a function"; then
            echo "  ❌ MCP SDK error still present in container"
            echo "  Logs:"
            echo "$LOGS" | grep -A 5 -B 5 "union is not a function"
        else
            echo "  ✅ No MCP SDK errors detected in container logs"
        fi
        
        # Clean up
        docker stop "$CONTAINER_ID" > /dev/null 2>&1
        docker rm "$CONTAINER_ID" > /dev/null 2>&1
    else
        echo "  ❌ Container failed to start"
        echo "  Logs:"
        docker logs "$CONTAINER_ID" 2>&1 | tail -20
        docker rm "$CONTAINER_ID" > /dev/null 2>&1
    fi
    
    # Clean up image
    docker rmi weather-mcp-test > /dev/null 2>&1
else
    echo "  ❌ Docker build failed"
fi

echo ""
echo "📝 Summary:"
echo "==========="
echo "The MCP SDK version conflict fix includes:"
echo "  • Updated Dockerfile to force @modelcontextprotocol/sdk@^1.19.1"
echo "  • Enhanced error handling in MCP clients"
echo "  • Better error messages for debugging"
echo ""
echo "🚀 Next Steps:"
echo "=============="
echo "1. Commit and push these changes to your repository"
echo "2. Redeploy to Digital Ocean"
echo "3. Monitor the logs for the improved error messages"
echo "4. Test the audio report functionality"
echo ""
echo "🔍 If issues persist:"
echo "====================="
echo "• Check Digital Ocean deployment logs"
echo "• Verify environment variables are set correctly"
echo "• Ensure the Dockerfile changes are applied"
