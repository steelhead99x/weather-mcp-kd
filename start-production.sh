#!/bin/bash

# Set NODE_ENV to production to reduce debug logging
export NODE_ENV=production

echo "🚀 Starting Weather Agent in production mode..."
echo "📝 NODE_ENV: $NODE_ENV"
echo "🔧 This should reduce frontend debug messages"

# Run the application
npm run start:telemetry
