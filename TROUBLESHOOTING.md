# Weather Agent Troubleshooting Guide

## Common Issues and Solutions

### 1. "Client connection prematurely closed" Error

**Symptoms:**
- Error in agent stream with "Client connection prematurely closed"
- Intermittent connection failures

**Causes:**
- MCP client connections timing out
- Network instability
- Resource exhaustion

**Solutions:**
- The system now includes connection pooling and rate limiting
- MCP pre-warming has been disabled to prevent overload
- Added proper connection cleanup in finally blocks

### 2. "Overloaded" Error

**Symptoms:**
- Error: Overloaded in processOutputStream
- System becomes unresponsive

**Causes:**
- Too many concurrent requests
- Memory exhaustion
- Resource contention

**Solutions:**
- Added circuit breaker pattern to prevent system overload
- Reduced max concurrent connections to 2
- Added timeout protection (25 seconds)
- Implemented connection queuing

### 3. Memory Issues

**Symptoms:**
- High memory usage
- System slowdown
- Out of memory errors

**Solutions:**
- Added memory monitoring
- Implemented connection limits
- Added proper cleanup of resources
- Use `npm run monitor` to track memory usage

## Monitoring and Debugging

### System Monitor

Run the system monitor to track health in real-time:

```bash
npm run monitor
```

This will show:
- Memory usage
- Uptime
- Environment configuration
- Warnings and errors
- Overall system status

### Health Check

Use the health tool in your MCP client:

```javascript
// Check basic health
await health.execute({ context: {} });

// Check detailed health with diagnostics
await health.execute({ context: { detailed: true } });
```

### Debug Tool

Use the debug tool for detailed diagnostics:

```javascript
await debugAgent.execute({ 
  context: { 
    message: "96062",
    includeEnvCheck: true 
  } 
});
```

## Configuration

### Environment Variables

Required:
- `ANTHROPIC_API_KEY` - For AI model access

Optional:
- `DEEPGRAM_API_KEY` - For TTS features
- `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` - For video upload
- `NODE_ENV` - Set to 'production' for production mode

### Rate Limiting

The system now includes built-in rate limiting:
- Max 2 concurrent connections
- 30-second connection timeout
- Circuit breaker after 3 failures

### Memory Management

- Connection pooling prevents memory leaks
- Proper cleanup in finally blocks
- Memory monitoring and warnings

## Best Practices

1. **Monitor System Health**
   - Use the system monitor regularly
   - Check health endpoints
   - Watch for memory warnings

2. **Handle Errors Gracefully**
   - Implement proper error handling
   - Use fallback mechanisms
   - Log errors for debugging

3. **Resource Management**
   - Don't create too many concurrent requests
   - Use timeouts appropriately
   - Clean up resources properly

4. **Testing**
   - Test with different ZIP codes
   - Test error scenarios
   - Monitor system under load

## Emergency Recovery

If the system becomes unresponsive:

1. **Check System Status**
   ```bash
   npm run monitor
   ```

2. **Restart the Service**
   ```bash
   # Stop the current process
   # Restart with monitoring
   npm run monitor
   ```

3. **Check Logs**
   - Look for error patterns
   - Check memory usage trends
   - Identify failing components

4. **Reset Circuit Breaker**
   - Wait 30 seconds for automatic reset
   - Or restart the service

## Performance Tuning

### For High Load

1. **Reduce Concurrent Connections**
   - Edit `MAX_CONCURRENT_CONNECTIONS` in weather-agent.ts
   - Default is 2, reduce to 1 for very limited resources

2. **Adjust Timeouts**
   - Increase timeouts for slower systems
   - Decrease for faster response requirements

3. **Memory Optimization**
   - Monitor memory usage
   - Adjust Node.js memory limits if needed
   - Consider upgrading system resources

### For Development

1. **Enable Debug Logging**
   - Set `NODE_ENV=development`
   - Check console output for detailed logs

2. **Use Test Tools**
   - Use `test_agent` tool for simple testing
   - Use `debug_agent` for detailed diagnostics

## Support

If issues persist:

1. Check the system monitor output
2. Review error logs
3. Test with the debug tools
4. Consider system resource limitations
5. Check network connectivity for MCP clients
