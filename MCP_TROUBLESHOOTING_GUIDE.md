# MCP Troubleshooting Guide

## If the MCP SDK Version Fix Doesn't Work

### 1. Check Digital Ocean Deployment Logs

```bash
# Check if the Docker build used the correct version
# Look for these lines in the build logs:
# "Installing @modelcontextprotocol/sdk@^1.17.5"
# "npm install @modelcontextprotocol/sdk@^1.17.5 --workspace=backend"
```

### 2. Verify Environment Variables

The MCP connection requires these environment variables:

```bash
# Required for Mux MCP
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret

# Optional but recommended
MUX_MCP_UPLOAD_ARGS=@mux/mcp,client=cursor,--tools=dynamic,--resource=video.uploads
MUX_CONNECTION_TIMEOUT=45000
```

### 3. Test MCP Connection Directly

Add this debug endpoint to test MCP connectivity:

```typescript
// Add to your backend/src/index.ts
app.get('/debug/mcp', async (req, res) => {
  try {
    const uploadClient = new MuxMCPClient();
    const tools = await uploadClient.getTools();
    
    res.json({
      status: 'success',
      tools: Object.keys(tools),
      mcpVersion: process.env.npm_package_dependencies_modelcontextprotocol_sdk
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      stack: error.stack
    });
  }
});
```

### 4. Check for Alternative Error Patterns

Look for these related errors in your logs:

- `TypeError: Cannot read property 'union' of undefined`
- `MCP error -32603: Invalid arguments`
- `needle.evaluatedProperties is not a function`
- `@mux/mcp connection timeout`

### 5. Test with Minimal MCP Configuration

Try using the most basic MCP configuration:

```bash
# Set these environment variables
MUX_MCP_UPLOAD_ARGS=@mux/mcp,client=cursor,--tools=static
```

### 6. Check Node.js Version Compatibility

Ensure your Digital Ocean environment uses Node.js 20+:

```dockerfile
# In your Dockerfile, verify this line:
FROM node:20.18-alpine AS base
```

### 7. Debug MCP Tool Execution

Add detailed logging to your MCP client:

```typescript
// In mux-upload-client.ts, add this before tool execution:
console.log('[MCP Debug] Tool execution context:', {
  toolName: tool.name,
  context: context,
  sdkVersion: require('@modelcontextprotocol/sdk/package.json').version
});
```

### 8. Test with Different Mux MCP Versions

If the issue persists, try different Mux MCP versions:

```bash
# In your backend/package.json, try:
"@mux/mcp": "^12.7.0"  # or "^12.6.0"
```

### 9. Check for Memory/Resource Issues

The error might be related to resource constraints:

```bash
# Add to your Digital Ocean environment variables:
NODE_OPTIONS=--max-old-space-size=2048
```

### 10. Fallback Strategy

If MCP continues to fail, implement a fallback:

```typescript
// In your weather agent, add fallback logic:
try {
  // Try MCP upload
  const result = await uploadToMuxViaMCP(audioFile);
  return result;
} catch (mcpError) {
  console.warn('[Fallback] MCP upload failed, using direct API:', mcpError.message);
  
  // Fallback to direct Mux API
  const result = await uploadToMuxDirectAPI(audioFile);
  return result;
}
```

## Quick Diagnostic Commands

```bash
# 1. Check MCP SDK version in container
docker run --rm your-image npm list @modelcontextprotocol/sdk

# 2. Test MCP connection
docker run --rm -e MUX_TOKEN_ID=test -e MUX_TOKEN_SECRET=test your-image node -e "
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
console.log('MCP SDK loaded successfully');
"

# 3. Check for version conflicts
docker run --rm your-image npm ls @modelcontextprotocol/sdk
```

## Common Solutions

1. **Force rebuild**: Delete Digital Ocean app and recreate
2. **Clear cache**: Use `npm ci --force` in Dockerfile
3. **Pin versions**: Use exact versions instead of ranges
4. **Check dependencies**: Run `npm audit` for conflicts

## When to Contact Support

- Error persists after trying all above steps
- MCP connection works locally but fails in production
- Multiple dependency version conflicts
- Resource/memory issues in Digital Ocean
