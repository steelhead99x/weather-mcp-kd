# CRITICAL FIX: Empty Objects Trigger MCP Validation Bug

## Issue Found

The `@mux/mcp@12.8.0` package has a critical validation bug where **EVEN EMPTY OBJECTS** trigger the "needle.evaluatedProperties.union is not a function" error.

## What Was Failing

```javascript
// This FAILS with union error:
const createArgs = {
    cors_origin: 'https://example.com',
    new_asset_settings: {}  // ❌ Empty object triggers validation!
};
```

## Root Cause

The Mux MCP package attempts to validate ALL parameter structures, even empty ones. When it encounters ANY object parameter (even `{}`), it tries to use a `union()` schema validation function that doesn't exist in its dependency version.

## The Fix

**Remove ALL object parameters that are empty:**

```javascript
// This WORKS:
const createArgs = {
    cors_origin: 'https://example.com'
    // ✅ No new_asset_settings at all!
};
```

## Files Changed

### 1. `backend/src/agents/weather-agent.ts`
- Removed `new_asset_settings` completely
- Using only `cors_origin` parameter

### 2. `backend/src/mcp/mux-upload-client.ts`
- Added check to remove `new_asset_settings` if it's empty
- Only includes `new_asset_settings` if it has actual content (playback_policy, etc.)

## Testing

```bash
# Quick typecheck
cd backend && npm run typecheck

# Full test
bash scripts/test-mcp-fix-local.sh

# Deploy and verify
git add .
git commit -m "Critical fix: Remove empty objects causing MCP validation error"
git push
```

## What to Expect After Deployment

✅ **Audio uploads will work**
✅ **No more "union is not a function" error**  
⚠️ **Playback policy defaults to Mux account settings**
⚠️ **No automatic image overlay** (audio-only upload)

## Affected Parameters

These parameters ALL trigger the validation bug if included:
- ❌ `audio_only_with_image` - Complex object
- ❌ `new_asset_settings: {}` - Empty object  
- ❌ `new_asset_settings: { playback_policy: 'signed' }` - May also fail
- ✅ `cors_origin` - Simple string (SAFE)
- ✅ `test: true` - Simple boolean (SAFE)

## Workaround Strategy

**Use only primitive types (strings, booleans, numbers) in createArgs.**
**Avoid ALL object/array parameters until @mux/mcp is fixed.**

## Long-term Solutions

1. **Wait for @mux/mcp update** with fixed schema validation
2. **Use Mux REST API directly** instead of MCP
3. **Set playback policies** via Mux dashboard as defaults
4. **Add image overlays** as post-processing step via Mux API
