#!/usr/bin/env node

/**
 * End-to-End Test Script for Weather Agent
 * 
 * This script tests the actual running system to ensure:
 * 1. Backend processes ZIP codes correctly
 * 2. Weather agent responds with relevant information
 * 3. Tool calls work and return data
 * 4. Message format fixes are working
 */

import fetch from 'node-fetch'
import { performance } from 'perf_hooks'

const BACKEND_URL = 'http://localhost:3000'
const TIMEOUT = 30000 // 30 seconds

// ANSI color codes for pretty output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

function log(color, ...args) {
  console.log(color, ...args, colors.reset)
}

async function testHealthEndpoint() {
  log(colors.blue, '🔍 Testing health endpoint...')
  
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      timeout: 5000
    })
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }
    
    const data = await response.json()
    log(colors.green, '✅ Health endpoint working:', data.service)
    return true
  } catch (error) {
    log(colors.red, '❌ Health endpoint failed:', error.message)
    return false
  }
}

async function testZipCodeResponse(zipCode, expectedFormat = 'mastra') {
  log(colors.blue, `🌤️  Testing ZIP code ${zipCode} with ${expectedFormat} format...`)
  
  const startTime = performance.now()
  
  try {
    // Test different message formats
    const payloads = {
      mastra: { messages: zipCode, format: 'mastra' },
      standard: { messages: [{ role: 'user', content: zipCode }] },
      fallback: { message: zipCode }
    }
    
    const payload = payloads[expectedFormat] || payloads.mastra
    
    const response = await fetch(`${BACKEND_URL}/api/agents/weather/stream/vnext`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: TIMEOUT
    })
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    
    // Read the streaming response (node-fetch compatible)
    let fullResponse = ''
    
    if (response.body) {
      let timeoutId = setTimeout(() => {
        log(colors.yellow, '⚠️  Response taking longer than expected...')
      }, 10000)
      
      try {
        // For node-fetch, we can read the body as text
        fullResponse = await response.text()
        clearTimeout(timeoutId)
      } catch (error) {
        clearTimeout(timeoutId)
        throw new Error(`Failed to read response: ${error.message}`)
      }
    } else {
      throw new Error('No response body available')
    }
    
    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)
    
    // Analyze the response
    const stats = {
      length: fullResponse.length,
      responseTime,
      hasWeatherTerms: /weather|temperature|forecast|sunny|cloudy|rain|wind/i.test(fullResponse),
      hasAgricultureTerms: /farm|crop|plant|irrigation|livestock|agriculture|harvest/i.test(fullResponse),
      hasLocationInfo: new RegExp(zipCode, 'i').test(fullResponse) || /location|area|region/i.test(fullResponse),
      containsZipCode: fullResponse.includes(zipCode)
    }
    
    // Log results
    log(colors.green, `✅ ZIP ${zipCode} response received`)
    log(colors.reset, `   📊 Length: ${stats.length} chars`)
    log(colors.reset, `   ⏱️  Time: ${stats.responseTime}ms`)
    log(colors.reset, `   🌤️  Weather terms: ${stats.hasWeatherTerms ? '✅' : '❌'}`)
    log(colors.reset, `   🚜 Agriculture terms: ${stats.hasAgricultureTerms ? '✅' : '❌'}`)
    log(colors.reset, `   📍 Location info: ${stats.hasLocationInfo ? '✅' : '❌'}`)
    
    // Show preview of response
    const preview = fullResponse.substring(0, 200).replace(/\n/g, ' ')
    log(colors.reset, `   📝 Preview: "${preview}${fullResponse.length > 200 ? '...' : ''}"`)
    
    // Validation
    const isValid = stats.length > 50 && 
                   stats.hasWeatherTerms && 
                   stats.responseTime < TIMEOUT
    
    if (isValid) {
      log(colors.green, `✅ ZIP ${zipCode} test PASSED`)
    } else {
      log(colors.red, `❌ ZIP ${zipCode} test FAILED - insufficient response quality`)
    }
    
    return { success: isValid, stats, fullResponse }
    
  } catch (error) {
    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)
    
    log(colors.red, `❌ ZIP ${zipCode} test FAILED:`, error.message)
    log(colors.reset, `   ⏱️  Time: ${responseTime}ms`)
    
    return { success: false, error: error.message, responseTime }
  }
}

async function testMessageFormats() {
  log(colors.blue, '📋 Testing different message formats...')
  
  const zipCode = '85001'
  const formats = ['mastra', 'standard', 'fallback']
  
  for (const format of formats) {
    const result = await testZipCodeResponse(zipCode, format)
    if (!result.success) {
      log(colors.red, `❌ Format ${format} failed`)
      return false
    }
  }
  
  log(colors.green, '✅ All message formats working')
  return true
}

async function runAllTests() {
  log(colors.bold + colors.blue, '🧪 Starting Weather Agent E2E Tests')
  log(colors.reset, '='.repeat(50))
  
  const results = {
    health: false,
    formats: false,
    zipCodes: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  }
  
  // Test 1: Health check
  results.health = await testHealthEndpoint()
  
  if (!results.health) {
    log(colors.red, '❌ Backend not available, skipping other tests')
    return results
  }
  
  // Test 2: Message formats
  results.formats = await testMessageFormats()
  
  // Test 3: Multiple ZIP codes
  const testZipCodes = ['96062', '85001', '90210', '33101', '10001']
  
  log(colors.blue, '📮 Testing multiple ZIP codes...')
  
  for (const zip of testZipCodes) {
    const result = await testZipCodeResponse(zip)
    results.zipCodes.push({ zip, ...result })
    results.summary.total++
    
    if (result.success) {
      results.summary.passed++
    } else {
      results.summary.failed++
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // Summary
  log(colors.reset, '='.repeat(50))
  log(colors.bold + colors.blue, '📊 Test Summary')
  log(colors.reset, `Total tests: ${results.summary.total + 2}`) // +2 for health and formats
  log(colors.green, `Passed: ${results.summary.passed + (results.health ? 1 : 0) + (results.formats ? 1 : 0)}`)
  log(colors.red, `Failed: ${results.summary.failed + (results.health ? 0 : 1) + (results.formats ? 0 : 1)}`)
  
  const allPassed = results.health && 
                   results.formats && 
                   results.summary.failed === 0
  
  if (allPassed) {
    log(colors.bold + colors.green, '🎉 All tests PASSED!')
  } else {
    log(colors.bold + colors.red, '❌ Some tests FAILED!')
  }
  
  return results
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(results => {
      const exitCode = (results.health && results.formats && results.summary.failed === 0) ? 0 : 1
      process.exit(exitCode)
    })
    .catch(error => {
      log(colors.red, '💥 Test runner crashed:', error.message)
      process.exit(1)
    })
}

export { runAllTests, testZipCodeResponse, testHealthEndpoint }
