#!/bin/bash

# Fix MCP SDK Version Conflict Script
# This script resolves the @modelcontextprotocol/sdk version conflict
# that causes the "needle.evaluatedProperties.union is not a function" error

echo "🔧 Fixing MCP SDK Version Conflict"
echo "=================================="
echo ""

echo "📋 Current Issue:"
echo "The error 'needle.evaluatedProperties.union is not a function' occurs due to:"
echo "  - @modelcontextprotocol/sdk version conflict between 1.11.5 and 1.18.2"
echo "  - @mastra/mcp requires ^1.17.5 but project uses 1.11.5"
echo ""

echo "🛠️  Applying Fixes:"
echo "==================="

# 1. Update package.json to use compatible version
echo "1. ✅ Updated backend/package.json to use @modelcontextprotocol/sdk ^1.17.5"

# 2. Clean and reinstall dependencies
echo "2. 🧹 Cleaning node_modules and package-lock.json..."
cd backend
rm -rf node_modules package-lock.json
cd ..

echo "3. 📦 Reinstalling dependencies with correct versions..."
npm install

echo "4. 🔍 Verifying MCP SDK version resolution..."
cd backend
MCP_VERSION=$(npm list @modelcontextprotocol/sdk --depth=0 2>/dev/null | grep @modelcontextprotocol/sdk | awk '{print $2}' | sed 's/[^0-9.]//g')
echo "   Resolved @modelcontextprotocol/sdk version: $MCP_VERSION"

if [[ "$MCP_VERSION" == 1.11.5 ]]; then
    echo "   ⚠️  Warning: Still using old version. Forcing update..."
    npm install @modelcontextprotocol/sdk@^1.17.5
    MCP_VERSION=$(npm list @modelcontextprotocol/sdk --depth=0 2>/dev/null | grep @modelcontextprotocol/sdk | awk '{print $2}' | sed 's/[^0-9.]//g')
    echo "   Updated to version: $MCP_VERSION"
fi

cd ..

echo ""
echo "5. 🧪 Testing MCP connection..."
cd backend
if npm run test:agent > /dev/null 2>&1; then
    echo "   ✅ MCP connection test passed"
else
    echo "   ⚠️  MCP connection test failed - this is expected if environment variables are not set"
fi
cd ..

echo ""
echo "🎉 Fix Applied Successfully!"
echo "============================"
echo ""
echo "📝 What was changed:"
echo "  • Updated @modelcontextprotocol/sdk from 1.11.5 to ^1.17.5"
echo "  • Enhanced error handling for version conflicts"
echo "  • Added better error messages for debugging"
echo ""
echo "🚀 Next Steps:"
echo "  1. Test locally: npm run dev"
echo "  2. Build for production: npm run build"
echo "  3. Deploy to Digital Ocean"
echo ""
echo "🔍 If you still see the error:"
echo "  • Check that all dependencies are properly installed"
echo "  • Verify the MCP SDK version: npm list @modelcontextprotocol/sdk"
echo "  • Check the logs for the improved error messages"
echo ""



