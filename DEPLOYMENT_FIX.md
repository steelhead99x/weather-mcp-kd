# Deployment Fix - Module Not Found Error

## Problem
The application was failing to start in production with the error:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/backend/src/index.ts'
```

## Root Cause
The deployment was running `npm run start` which executes the development command (`tsx --watch src/index.ts`), but in production Docker containers, only the compiled JavaScript files exist in the `dist/` directory - the TypeScript source files are not copied.

## Solution
We've implemented multiple layers of fixes:

### 1. Smart Start Script (package.json)
The `start` script now checks the `NODE_ENV` and runs the appropriate command:
```json
"start": "if [ \"$NODE_ENV\" = \"production\" ]; then node dist/index.js; else npm run dev; fi"
```

### 2. Startup Shell Script (start.sh)
Added a robust startup script at `backend/start.sh` that:
- Validates the environment
- Checks that required files exist
- Provides detailed error messages
- Runs the correct command based on NODE_ENV

### 3. Updated Dockerfiles
Both `Dockerfile` and `Dockerfile.simple` now:
- Copy the startup script
- Make it executable
- Use it as the entry point: `CMD ["./start.sh"]`

### 4. Digital Ocean App Spec (.do/app.yaml)
Created an explicit app specification that:
- Sets `run_command: npm run start`
- Explicitly sets `NODE_ENV=production`
- Configures health checks
- Defines resource requirements

## Deployment Options

### Option A: Using the App Spec (Recommended)
1. In Digital Ocean, go to your app settings
2. Use the `.do/app.yaml` file to configure your app
3. The app spec ensures consistent configuration

### Option B: Manual Configuration
If you're configuring manually in Digital Ocean:

1. **Run Command**: Set to `npm run start` (not `npm run start:production`)
2. **Environment Variables**: Ensure `NODE_ENV=production` is set
3. **Health Check Path**: Set to `/health`
4. **Port**: 3001

### Option C: Using the Shell Script Directly
You can also set the run command to: `./start.sh`

## Verification

After deploying, check the logs for:
```
Starting application...
NODE_ENV: production
Running in PRODUCTION mode
Starting production server...
```

If you see errors about missing files, the startup script will show exactly what's wrong:
```
ERROR: dist directory not found!
Contents of current directory:
[list of files]
```

## Testing Locally

Test the production build locally:
```bash
cd backend

# Build the application
npm run build

# Test the start script in production mode
NODE_ENV=production npm run start

# Or use the shell script directly
NODE_ENV=production ./start.sh
```

## Rollback

If you need to rollback:
1. In Digital Ocean, change the run command to: `npm run start:production`
2. Redeploy

## Additional Notes

- The `start` script now works in both development and production
- All Dockerfiles set `NODE_ENV=production` by default
- The shell script provides better diagnostics than npm scripts
- Health checks will only pass after the server is fully started

## Related Files
- `backend/package.json` - Contains the smart start script
- `backend/start.sh` - Robust startup script with validation
- `Dockerfile` - Multi-stage production build
- `Dockerfile.simple` - Simple production build
- `.do/app.yaml` - Digital Ocean app specification

