# MCP Upload Debugging Guide

This guide helps troubleshoot Mux MCP upload failures and provides comprehensive debugging tools.

## Quick Start

1. **Run the diagnostic script:**
   ```bash
   npm run debug:mcp
   ```

2. **Start the CORS proxy:**
   ```bash
   npm run dev:proxy
   ```

3. **Use the debug panel:** Click the "MCP Debug" button in the bottom-right corner of the app.

## Debugging Tools

### 1. Diagnostic Script (`debug-mcp-upload.js`)

The diagnostic script tests all critical components:

- ✅ CORS Proxy connectivity
- ✅ MCP Server direct access
- ✅ MCP Server through proxy
- ✅ Mux Keyserver connectivity
- ✅ Agent streaming endpoint
- ✅ Environment variables

**Usage:**
```bash
npm run debug:mcp
```

### 2. Debug Panel (In-App)

The debug panel provides real-time monitoring:

- **Connection Status**: Live connection monitoring
- **Server Configuration**: Environment variables and settings
- **Recent Logs**: Captured console logs
- **Quick Actions**: Manual connection tests

**Access:** Click the "MCP Debug" button in the bottom-right corner.

### 3. Enhanced Logging

All components now include comprehensive logging:

- **MuxSignedPlayer**: Token fetch process, response parsing
- **WeatherChat**: Tool call detection and result handling
- **CORS Proxy**: Request/response logging with timestamps
- **MastraClient**: Connection testing and environment validation

## Common Issues and Solutions

### Issue: "Keyserver error 500"

**Symptoms:**
- MuxSignedPlayer shows error state
- Console shows "Keyserver error 500"

**Debugging Steps:**
1. Check CORS proxy logs for detailed error messages
2. Verify Mux Keyserver is accessible:
   ```bash
   curl -X POST https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens \
     -H "Content-Type: application/json" \
     -d '{"assetId":"00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw","type":"video"}'
   ```
3. Check network connectivity and firewall settings

**Solutions:**
- Ensure Mux Keyserver is running and accessible
- Check API keys and authentication
- Verify asset ID is valid

### Issue: "Proxy error"

**Symptoms:**
- CORS proxy returns 500 errors
- Network requests fail

**Debugging Steps:**
1. Check CORS proxy logs for detailed error information
2. Verify target server is accessible:
   ```bash
   curl https://stage-weather-mcp-kd.streamingportfolio.com/health
   ```
3. Test proxy configuration

**Solutions:**
- Restart CORS proxy: `npm run dev:proxy`
- Check target server status
- Verify proxy configuration in `cors-proxy.js`

### Issue: "Missing playbackId in token response"

**Symptoms:**
- MuxSignedPlayer shows "Missing playbackId" error
- Keyserver responds but with incomplete data

**Debugging Steps:**
1. Check MuxSignedPlayer logs for full response data
2. Verify keyserver response format
3. Test with different asset IDs

**Solutions:**
- Update keyserver to return correct response format
- Check asset ID validity
- Verify Mux account configuration

### Issue: Tool calls not working

**Symptoms:**
- Agent doesn't respond to upload requests
- Tool calls show in debug panel but fail

**Debugging Steps:**
1. Check WeatherChat logs for tool call details
2. Verify agent configuration and tools
3. Test agent streaming endpoint

**Solutions:**
- Ensure agent has Mux upload tools configured
- Check MCP server tool registration
- Verify agent permissions and authentication

## Environment Variables

Required environment variables:

```bash
# Mastra API Host (no protocol, no path)
VITE_MASTRA_API_HOST=localhost:3001

# Weather Agent ID
VITE_WEATHER_AGENT_ID=weather

# Development mode
NODE_ENV=development
```

## Logging Levels

### Console Logging

All components use prefixed logging for easy filtering:

- `[MuxSignedPlayer]`: Token fetch and player initialization
- `[WeatherChat]`: Tool calls and message processing
- `[CORS-Proxy]`: Request/response logging
- `[Mastra]`: Client configuration and connection testing
- `[MCPDebug]`: Debug panel actions

### Log Filtering

Filter logs in browser console:
```javascript
// Show only Mux-related logs
console.clear();
// Then interact with the app to see filtered logs
```

## Advanced Debugging

### Network Analysis

Use browser DevTools Network tab to monitor:
- Request/response headers
- Response bodies
- Timing information
- Error status codes

### Server-Side Debugging

Check server logs for:
- MCP tool execution errors
- Authentication failures
- Resource access issues
- Database connection problems

### MCP Protocol Debugging

For MCP-specific issues:
1. Check MCP server capabilities
2. Verify tool schemas and parameters
3. Test tool execution independently
4. Review MCP protocol compliance

## Performance Monitoring

### Connection Health

The debug panel monitors:
- Connection status (connected/disconnected/error)
- Response times
- Error rates
- Last successful operation

### Resource Usage

Monitor:
- Memory usage
- Network bandwidth
- CPU utilization
- Storage usage

## Troubleshooting Checklist

- [ ] CORS proxy is running (`npm run dev:proxy`)
- [ ] Environment variables are set correctly
- [ ] MCP server is accessible
- [ ] Mux Keyserver is responding
- [ ] Agent has required tools configured
- [ ] Network connectivity is working
- [ ] Browser console shows no errors
- [ ] Debug panel shows "connected" status

## Getting Help

If issues persist:

1. **Run full diagnostics:** `npm run debug:mcp`
2. **Check debug panel:** Look for error messages and connection status
3. **Review logs:** Check browser console and server logs
4. **Test components individually:** Use the diagnostic script to isolate issues
5. **Check network:** Verify all services are accessible

## Additional Resources

- [Mastra MCP Documentation](https://docs.mastra.ai/tools-mcp/)
- [Mux Documentation](https://docs.mux.com/)
- [CORS Proxy Configuration](./cors-proxy.js)
- [Debug Script](./debug-mcp-upload.js)
