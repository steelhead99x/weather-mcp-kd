#!/usr/bin/env node

/**
 * Simple CORS test script to verify that the Mastra server
 * is properly configured to allow requests from ai.streamingportfolio.com
 */

import https from 'https';
import http from 'http';

const testUrl = 'https://weather-mcp-kd.streamingportfolio.com/api/agents/weatherAgent/stream/vnext';
const origin = 'https://ai.streamingportfolio.com';

console.log('🧪 Testing CORS configuration...');
console.log(`📍 Testing URL: ${testUrl}`);
console.log(`🌐 Origin: ${origin}`);
console.log('');

// Create a simple OPTIONS request to test CORS preflight
const url = new URL(testUrl);
const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'OPTIONS',
    headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
        'User-Agent': 'CORS-Test-Script/1.0'
    }
};

const client = url.protocol === 'https:' ? https : http;

const req = client.request(options, (res) => {
    console.log(`📊 Status: ${res.statusCode}`);
    console.log('📋 Response Headers:');
    
    // Check for CORS headers
    const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-methods', 
        'access-control-allow-headers',
        'access-control-allow-credentials',
        'access-control-expose-headers'
    ];
    
    corsHeaders.forEach(header => {
        const value = res.headers[header];
        if (value) {
            console.log(`  ✅ ${header}: ${value}`);
        } else {
            console.log(`  ❌ ${header}: not found`);
        }
    });
    
    console.log('');
    
    // Check if the origin is allowed
    const allowedOrigin = res.headers['access-control-allow-origin'];
    if (allowedOrigin === origin || allowedOrigin === '*') {
        console.log('🎉 CORS test PASSED - Origin is allowed');
    } else {
        console.log('❌ CORS test FAILED - Origin not allowed');
        console.log(`   Expected: ${origin}`);
        console.log(`   Got: ${allowedOrigin || 'none'}`);
    }
    
    res.on('data', () => {}); // Consume response body
    res.on('end', () => {
        console.log('');
        console.log('🏁 CORS test completed');
    });
});

req.on('error', (err) => {
    console.error('❌ Request failed:', err.message);
    console.log('');
    console.log('💡 Make sure the server is running and accessible');
});

req.end();
