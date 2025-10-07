# MCP "union is not a function" Error - Fix Summary

## Problem Identified

The error `TypeError: needle.evaluatedProperties.union is not a function` was occurring when trying to create Mux uploads with the `audio_only_with_image` parameter.

### Root Cause

The error is **NOT** in `@modelcontextprotocol/sdk` directly, but in the `@mux/mcp@12.8.0` package's schema validation when processing the `audio_only_with_image` parameter. This parameter triggers internal schema validation that uses a `union()` function which doesn't exist in the version of the schema library being used.

### Why It Only Happened on Digital Ocean

- **Local Mac**: The issue also occurs locally when tested with the audio report feature
- **Digital Ocean**: Same issue, but more visible because it's the production environment

## Solutions Implemented

### Solution 1: Updated Dockerfile (Preventive)
Added MCP SDK version pinning to ensure compatibility:

```dockerfile
# Force update MCP SDK to prevent version conflicts
RUN npm ci --workspaces --omit=dev && \
    npm install @modelcontextprotocol/sdk@^1.17.5 --workspace=backend
```

This helps with general MCP SDK compatibility but doesn't fix the `@mux/mcp` internal issue.

### Solution 2: Remove ALL Object Parameters (CRITICAL FIX)

**CRITICAL DISCOVERY**: The `@mux/mcp@12.8.0` validation bug is triggered by **ANY** object parameter, even empty objects `{}`!

Modified `backend/src/agents/weather-agent.ts` and `backend/src/mcp/mux-upload-client.ts`:

**Before (causing error):**
```typescript
const createArgs = {
    cors_origin: process.env.MUX_CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com',
    audio_only_with_image: { ... }  // ❌ Object triggers error
};

// OR even this fails:
const createArgs = {
    cors_origin: '...',
    new_asset_settings: {}  // ❌ Even empty object triggers error!
};
```

**After (working):**
```typescript
const createArgs: any = {
    cors_origin: process.env.MUX_CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com'
    // ✅ ONLY primitive types (strings, booleans, numbers)
    // ✅ NO object parameters at all
};
```

**Additional fix in `mux-upload-client.ts`:**
- Added logic to completely remove `new_asset_settings` if it's empty
- Only includes parameters that have actual primitive values

### Solution 3: Enhanced Debugging Tools

Added new debug endpoints to help troubleshoot MCP issues:

1. **Enhanced `/health` endpoint** - Now includes MCP connection status
2. **New `/debug/mcp` endpoint** - Provides detailed MCP diagnostics including:
   - SDK version
   - Configuration status
   - Available tools
   - Error messages

## Trade-offs

### What We Lost
- The `audio_only_with_image` convenience parameter that would automatically overlay an image on the audio
- Direct image integration in the Mux upload

### What We Kept
- Audio uploads still work
- Video playback still works
- The audio-only content will upload successfully to Mux

### Future Enhancement Options

1. **Wait for @mux/mcp update**: The `@mux/mcp` package may fix this in a future version
2. **Use direct Mux API**: Bypass MCP entirely and use Mux's REST API directly
3. **Post-processing**: Upload audio first, then use Mux API to add the image overlay separately

## Testing the Fix

After deploying:

```bash
# 1. Check the health endpoint
curl https://your-app.ondigitalocean.app/health

# 2. Check MCP debug endpoint
curl https://your-app.ondigitalocean.app/debug/mcp

# 3. Test audio report in the frontend
# Should now work without the "union is not a function" error
```

## Expected Behavior

✅ **Audio upload will succeed**
✅ **No more "union is not a function" error**
✅ **Playback URLs will be generated**
⚠️ **Static image overlay not automatically applied** (can be added separately)

## Files Changed

1. `backend/src/agents/weather-agent.ts` - Removed audio_only_with_image parameter
2. `backend/src/index.ts` - Added enhanced health and debug endpoints
3. `Dockerfile` - Added MCP SDK version pinning
4. `MCP_TROUBLESHOOTING_GUIDE.md` - Comprehensive troubleshooting guide
5. `scripts/diagnose-mcp.sh` - Diagnostic script for production testing
6. `scripts/verify-mcp-fix.sh` - Verification script for Docker builds

## Next Steps

1. **Commit and push** all changes
2. **Redeploy to Digital Ocean**
3. **Test the audio report feature**
4. **Monitor logs** for any new errors
5. **Use debug endpoints** if issues persist

## Long-term Solution

Consider upgrading or replacing `@mux/mcp` when a fixed version is available, or implement direct Mux API integration for more control over the upload parameters.
