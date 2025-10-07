# Mux Token Endpoint Fix

## Problem
The Mux video player was getting 404 errors when trying to fetch playback tokens:

**❌ Wrong URL (404):**
```
https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens
```

**✅ Correct URL:**
```
https://streamingportfolio.com/api/tokens
```

## Root Cause
The environment variables and fallback URLs in the code were pointing to an incorrect endpoint path. The `/streamingportfolio-mux-keyserver` prefix doesn't exist on the server.

## Files Fixed

### 1. `frontend/env.example`
Changed line 25:
```env
# OLD:
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens

# NEW:
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/api/tokens
```

### 2. `env.example` (root)
Changed line 103:
```env
# OLD:
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens

# NEW:
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/api/tokens
```

### 3. `frontend/src/components/MuxSignedPlayer.tsx`
Changed line 43 (fallback default):
```typescript
// OLD:
const keyServerUrl = import.meta.env.VITE_MUX_KEY_SERVER_URL || 'https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens'

// NEW:
const keyServerUrl = import.meta.env.VITE_MUX_KEY_SERVER_URL || 'https://streamingportfolio.com/api/tokens'
```

### 4. `PERFORMANCE_OPTIMIZATIONS.md`
Updated documentation line 139 to reflect the correct URL.

## What You Need to Do

### For Local Development

If you have a `.env` file in your `frontend/` directory, update it:

```bash
# Edit frontend/.env
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/api/tokens
```

If you have a `.env` file in your root directory, update it:

```bash
# Edit .env (root)
VITE_MUX_KEY_SERVER_URL=https://streamingportfolio.com/api/tokens
```

### For Production Deployment

Update your environment variables in Digital Ocean:

1. Go to your App → Settings → Environment Variables
2. Find or add `VITE_MUX_KEY_SERVER_URL`
3. Set the value to: `https://streamingportfolio.com/api/tokens`
4. Redeploy the application

## Verification

### Test the Token Endpoint
```bash
curl 'https://streamingportfolio.com/api/tokens' \
  -H 'Content-Type: application/json' \
  --data-raw '{"assetId":"00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw","type":"video"}'
```

You should get a response with:
- `playbackId`
- `token`
- `thumbnailToken`
- Video dimensions

### Test in Browser

1. Rebuild the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Check the browser console when loading a video - you should see:
   ```
   [MuxSignedPlayer] Keyserver URL: https://streamingportfolio.com/api/tokens
   [MuxSignedPlayer] Response status: 200
   ```

## Expected Behavior

After this fix:
- ✅ Token requests go to the correct endpoint
- ✅ Videos load with signed playback tokens
- ✅ No more 404 errors in the console
- ✅ Thumbnails and video metadata load correctly

## Technical Details

### Working curl Example:
```bash
curl 'https://streamingportfolio.com/api/tokens' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ai.streamingportfolio.com' \
  --data-raw '{"assetId":"00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw","type":"video"}'
```

### Response Format:
```json
{
  "playbackId": "...",
  "token": "...",
  "thumbnailToken": "...",
  "width": 1920,
  "height": 1080
}
```

## Related Files
- `frontend/src/components/MuxSignedPlayer.tsx` - Video player component
- `frontend/env.example` - Frontend environment template
- `env.example` - Root environment template
- `.env` (if exists) - Your actual environment configuration

## Commit Message
```
fix: correct Mux token endpoint URL

Remove incorrect /streamingportfolio-mux-keyserver path prefix
from Mux token endpoint URL. The correct endpoint is
https://streamingportfolio.com/api/tokens

Fixes 404 errors when fetching video playback tokens.
```

