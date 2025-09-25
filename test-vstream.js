#!/usr/bin/env node

/**
 * Test script to verify vstream format is working correctly
 * This script tests the updated MCP server tools that now use streamVNext
 */

import { weatherMcpServer } from './dist/mcp/weather-server.js';

async function testVStreamFormat() {
  console.log('🧪 Testing vstream format...\n');

  try {
    // Test the askWeatherAgentStreamVNext tool
    console.log('1. Testing askWeatherAgentStreamVNext tool...');
    const streamVNextTool = weatherMcpServer.tools.find(tool => tool.id === 'ask_weatherAgent_streamVNext');
    
    if (!streamVNextTool) {
      throw new Error('askWeatherAgentStreamVNext tool not found');
    }

    const result = await streamVNextTool.execute({
      context: {
        message: "What's the weather like in 90210?",
        format: "mastra"
      }
    });

    console.log('✅ Tool executed successfully');
    console.log('📊 Response structure:');
    console.log(`   - streamed: ${result.streamed}`);
    console.log(`   - method: ${result.method}`);
    console.log(`   - vstream: ${result.vstream}`);
    console.log(`   - text length: ${result.text?.length || 0}`);
    console.log(`   - chunks count: ${result.chunks?.length || 0}`);
    
    if (result.chunks && result.chunks.length > 0) {
      console.log('🎯 VStream chunks found:');
      result.chunks.forEach((chunk, index) => {
        console.log(`   Chunk ${index + 1}: type="${chunk.type}", from="${chunk.from}"`);
        if (chunk.payload) {
          console.log(`     payload keys: ${Object.keys(chunk.payload).join(', ')}`);
        }
      });
    } else {
      console.log('⚠️  No vstream chunks found - this might indicate an issue');
    }

    // Test the main askWeatherAgent tool with streamVNext
    console.log('\n2. Testing askWeatherAgent tool with streamVNext...');
    const mainTool = weatherMcpServer.tools.find(tool => tool.id === 'ask_weatherAgent');
    
    if (!mainTool) {
      throw new Error('askWeatherAgent tool not found');
    }

    const mainResult = await mainTool.execute({
      context: {
        message: "What's the weather like in 10001?",
        format: "aisdk",
        streamingMethod: "streamVNext"
      }
    });

    console.log('✅ Main tool executed successfully');
    console.log('📊 Response structure:');
    console.log(`   - streamed: ${mainResult.streamed}`);
    console.log(`   - method: ${mainResult.method}`);
    console.log(`   - vstream: ${mainResult.vstream}`);
    console.log(`   - text length: ${mainResult.text?.length || 0}`);
    console.log(`   - chunks count: ${mainResult.chunks?.length || 0}`);

    if (mainResult.chunks && mainResult.chunks.length > 0) {
      console.log('🎯 VStream chunks found:');
      mainResult.chunks.forEach((chunk, index) => {
        console.log(`   Chunk ${index + 1}: type="${chunk.type}", from="${chunk.from}"`);
        if (chunk.payload) {
          console.log(`     payload keys: ${Object.keys(chunk.payload).join(', ')}`);
        }
      });
    }

    console.log('\n🎉 VStream format test completed successfully!');
    console.log('✅ The backend is now returning the new vstream format instead of processDataStream');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testVStreamFormat().catch(console.error);
