#!/bin/bash

echo "Setting up CORS proxy for weather agent API..."

# Install proxy dependencies
echo "Installing proxy dependencies..."
npm install express http-proxy-middleware cors nodemon --save

# Create environment file for proxy
echo "Creating environment configuration..."
cat > .env.production << EOF
VITE_MASTRA_API_HOST=localhost:3001
VITE_WEATHER_AGENT_ID=weatherAgent
EOF

echo "Proxy setup complete!"
echo ""
echo "To use the proxy solution:"
echo "1. Start the proxy server: node cors-proxy.js"
echo "2. Update your frontend to use localhost:3001 as the API host"
echo "3. The proxy will handle CORS headers and forward requests to the weather agent API"
echo ""
echo "Alternative: Contact the weather agent server administrator to fix the OPTIONS request handling"

