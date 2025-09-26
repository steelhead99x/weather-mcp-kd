#!/bin/bash

# Test Dockerfile configuration for Digital Ocean deployment
echo "🐳 Testing Dockerfile configuration..."

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found"
    exit 1
fi

# Check if .do/app.yaml exists
if [ ! -f ".do/app.yaml" ]; then
    echo "❌ .do/app.yaml not found"
    exit 1
fi

# Check Dockerfile syntax
echo "📋 Checking Dockerfile syntax..."
if docker build --help | grep -q "dry-run" 2>/dev/null; then
    if docker build --dry-run . > /dev/null 2>&1; then
        echo "✅ Dockerfile syntax is valid"
    else
        echo "❌ Dockerfile syntax error"
        exit 1
    fi
else
    echo "⚠️ Docker dry-run not available, skipping syntax check"
fi

# Check if all required files are present
echo "📁 Checking required files..."
required_files=(
    "package.json"
    "backend/package.json"
    "frontend/package.json"
    "shared/package.json"
    "backend/src/index.ts"
    "frontend/src/main.tsx"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Check if build scripts exist
echo "🔨 Checking build scripts..."
if grep -q "build" backend/package.json && grep -q "build" frontend/package.json; then
    echo "✅ Build scripts configured"
else
    echo "❌ Build scripts missing"
    exit 1
fi

# Check if start:production script exists
if grep -q "start:production" backend/package.json; then
    echo "✅ Production start script configured"
else
    echo "❌ Production start script missing"
    exit 1
fi

# Check .do/app.yaml configuration
echo "⚙️ Checking Digital Ocean configuration..."
if grep -q "dockerfile_path: Dockerfile" .do/app.yaml; then
    echo "✅ Dockerfile path configured"
else
    echo "❌ Dockerfile path not configured"
    exit 1
fi

if grep -q "http_port: 3001" .do/app.yaml; then
    echo "✅ Port 3001 configured"
else
    echo "❌ Port 3001 not configured"
    exit 1
fi

echo ""
echo "🎉 All Dockerfile configuration checks passed!"
echo "✅ Ready for Digital Ocean deployment"
echo ""
echo "Next steps:"
echo "1. Push to GitHub: git push origin main"
echo "2. Create app in Digital Ocean App Platform"
echo "3. Connect your GitHub repository"
echo "4. Set environment variables"
echo "5. Deploy!"
