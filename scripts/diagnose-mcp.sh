#!/bin/bash

# Quick MCP Diagnostic Script
# Run this after deploying to Digital Ocean to check MCP status

echo "🔍 MCP Diagnostic Script"
echo "========================"
echo ""

# Get the app URL from environment or prompt
if [ -z "$APP_URL" ]; then
    echo "Enter your Digital Ocean app URL (e.g., https://your-app.ondigitalocean.app):"
    read APP_URL
fi

echo "Testing app at: $APP_URL"
echo ""

# Test basic health
echo "1. Testing basic health endpoint..."
HEALTH_RESPONSE=$(curl -s "$APP_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✅ Health endpoint responding"
    echo "   Response: $HEALTH_RESPONSE" | jq . 2>/dev/null || echo "   Response: $HEALTH_RESPONSE"
else
    echo "   ❌ Health endpoint failed"
    echo "   Check if your app is deployed and running"
    exit 1
fi

echo ""

# Test MCP debug endpoint
echo "2. Testing MCP debug endpoint..."
MCP_RESPONSE=$(curl -s "$APP_URL/debug/mcp" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✅ MCP debug endpoint responding"
    echo "   Response:"
    echo "$MCP_RESPONSE" | jq . 2>/dev/null || echo "$MCP_RESPONSE"
    
    # Check for specific error patterns
    if echo "$MCP_RESPONSE" | grep -q "union is not a function"; then
        echo ""
        echo "   🚨 FOUND THE ERROR: 'union is not a function'"
        echo "   This confirms the MCP SDK version issue"
        echo "   Solution: Redeploy with the updated Dockerfile"
    elif echo "$MCP_RESPONSE" | grep -q "not_configured"; then
        echo ""
        echo "   ⚠️  MCP not configured - check environment variables"
    elif echo "$MCP_RESPONSE" | grep -q "success"; then
        echo ""
        echo "   ✅ MCP connection successful!"
    fi
else
    echo "   ❌ MCP debug endpoint failed"
fi

echo ""

# Test audio report functionality
echo "3. Testing audio report functionality..."
echo "   This will make a test request to the weather agent..."

# Create a test request
TEST_RESPONSE=$(curl -s -X POST "$APP_URL/api/agents/weatherAgent/stream/vnext" \
  -H "Content-Type: application/json" \
  -d '{"messages": "can you provide an audio report", "timeout": 30000, "retries": 3, "format": "mastra"}' \
  2>/dev/null)

if [ $? -eq 0 ]; then
    echo "   ✅ Audio report request sent successfully"
    echo "   Check your Digital Ocean logs for the response"
else
    echo "   ❌ Audio report request failed"
fi

echo ""
echo "📋 Summary:"
echo "==========="
echo "• Health endpoint: $([ $? -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "• MCP debug endpoint: $([ $? -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "• Audio report test: $([ $? -eq 0 ] && echo "✅ Sent" || echo "❌ Failed")"
echo ""
echo "🔍 Next Steps:"
echo "=============="
echo "1. Check Digital Ocean logs for detailed error messages"
echo "2. If you see 'union is not a function', redeploy with the updated Dockerfile"
echo "3. If MCP shows 'not_configured', check your environment variables"
echo "4. If everything looks good, test the audio report in your frontend"
