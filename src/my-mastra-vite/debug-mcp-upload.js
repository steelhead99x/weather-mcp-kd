#!/usr/bin/env node

/**
 * MCP Upload Debug Script
 * 
 * This script helps debug Mux MCP upload issues by:
 * 1. Testing server connectivity
 * 2. Validating environment variables
 * 3. Testing MCP tool calls
 * 4. Checking CORS proxy functionality
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const CONFIG = {
  corsProxyUrl: 'http://localhost:3001',
  mcpServerUrl: 'https://stage-weather-mcp-kd.streamingportfolio.com',
  muxKeyserverUrl: 'https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens',
  testAssetId: '00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message, error) {
  log(`❌ ${message}`, 'red');
  if (error) {
    log(`   Error: ${error.message}`, 'red');
    if (error.stack) {
      log(`   Stack: ${error.stack}`, 'red');
    }
  }
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Utility function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MCP-Debug-Script/1.0',
        ...options.headers
      },
      timeout: options.timeout || 10000
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData,
            rawData: data
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            rawData: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Test functions
async function testCorsProxy() {
  logInfo('Testing CORS Proxy connectivity...');
  
  try {
    const response = await makeRequest(`${CONFIG.corsProxyUrl}/health`);
    
    if (response.statusCode === 200) {
      logSuccess('CORS Proxy is running and accessible');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'cyan');
      return true;
    } else {
      logError(`CORS Proxy returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logError('CORS Proxy is not accessible', error);
    return false;
  }
}

async function testMCPServerDirect() {
  logInfo('Testing MCP Server direct connectivity...');
  
  try {
    const response = await makeRequest(`${CONFIG.mcpServerUrl}/health`);
    
    if (response.statusCode === 200) {
      logSuccess('MCP Server is accessible directly');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'cyan');
      return true;
    } else {
      logError(`MCP Server returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logError('MCP Server is not accessible directly', error);
    return false;
  }
}

async function testMCPThroughProxy() {
  logInfo('Testing MCP Server through CORS proxy...');
  
  try {
    const response = await makeRequest(`${CONFIG.corsProxyUrl}/api/health`);
    
    if (response.statusCode === 200) {
      logSuccess('MCP Server is accessible through CORS proxy');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'cyan');
      return true;
    } else {
      logError(`MCP Server through proxy returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logError('MCP Server is not accessible through CORS proxy', error);
    return false;
  }
}

async function testMuxKeyserver() {
  logInfo('Testing Mux Keyserver connectivity...');
  
  try {
    const response = await makeRequest(CONFIG.muxKeyserverUrl, {
      method: 'POST',
      body: {
        assetId: CONFIG.testAssetId,
        type: 'video'
      }
    });
    
    if (response.statusCode === 200) {
      logSuccess('Mux Keyserver is accessible');
      log(`   Response keys: ${Object.keys(response.data).join(', ')}`, 'cyan');
      
      // Check for required fields
      const requiredFields = ['playbackId', 'token'];
      const missingFields = requiredFields.filter(field => !response.data[field]);
      
      if (missingFields.length === 0) {
        logSuccess('Mux Keyserver response contains all required fields');
      } else {
        logWarning(`Mux Keyserver response missing fields: ${missingFields.join(', ')}`);
      }
      
      return true;
    } else {
      logError(`Mux Keyserver returned status ${response.statusCode}`);
      log(`   Response: ${response.rawData}`, 'red');
      return false;
    }
  } catch (error) {
    logError('Mux Keyserver is not accessible', error);
    return false;
  }
}

async function testAgentStreaming() {
  logInfo('Testing agent streaming endpoint...');
  
  try {
    const response = await makeRequest(`${CONFIG.corsProxyUrl}/api/agents/weatherAgent/stream/vnext`, {
      method: 'POST',
      body: {
        message: 'Test message for debugging',
        stream: true
      }
    });
    
    if (response.statusCode === 200) {
      logSuccess('Agent streaming endpoint is accessible');
      return true;
    } else {
      logError(`Agent streaming endpoint returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logError('Agent streaming endpoint is not accessible', error);
    return false;
  }
}

function checkEnvironmentVariables() {
  logInfo('Checking environment variables...');
  
  const envVars = {
    'VITE_MASTRA_API_HOST': process.env.VITE_MASTRA_API_HOST,
    'VITE_WEATHER_AGENT_ID': process.env.VITE_WEATHER_AGENT_ID,
    'NODE_ENV': process.env.NODE_ENV
  };
  
  let allPresent = true;
  
  Object.entries(envVars).forEach(([key, value]) => {
    if (value) {
      logSuccess(`${key} is set: ${value}`);
    } else {
      logWarning(`${key} is not set`);
      allPresent = false;
    }
  });
  
  return allPresent;
}

async function runDiagnostics() {
  log('🔍 Starting MCP Upload Diagnostics', 'magenta');
  log('=====================================', 'magenta');
  
  const results = {
    corsProxy: await testCorsProxy(),
    mcpServerDirect: await testMCPServerDirect(),
    mcpServerThroughProxy: await testMCPThroughProxy(),
    muxKeyserver: await testMuxKeyserver(),
    agentStreaming: await testAgentStreaming(),
    environmentVars: checkEnvironmentVariables()
  };
  
  log('\n📊 Diagnostic Summary', 'magenta');
  log('====================', 'magenta');
  
  Object.entries(results).forEach(([test, passed]) => {
    if (passed) {
      logSuccess(`${test}: PASSED`);
    } else {
      logError(`${test}: FAILED`);
    }
  });
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  log(`\nOverall: ${passedTests}/${totalTests} tests passed`, passedTests === totalTests ? 'green' : 'yellow');
  
  if (passedTests < totalTests) {
    log('\n🔧 Troubleshooting Suggestions:', 'yellow');
    log('1. Ensure CORS proxy is running: npm run dev:proxy', 'yellow');
    log('2. Check environment variables in .env file', 'yellow');
    log('3. Verify MCP server is accessible and running', 'yellow');
    log('4. Check network connectivity and firewall settings', 'yellow');
    log('5. Review server logs for detailed error messages', 'yellow');
  }
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics().catch(error => {
    logError('Diagnostic script failed', error);
    process.exit(1);
  });
}

module.exports = {
  runDiagnostics,
  testCorsProxy,
  testMCPServerDirect,
  testMCPThroughProxy,
  testMuxKeyserver,
  testAgentStreaming,
  checkEnvironmentVariables
};
