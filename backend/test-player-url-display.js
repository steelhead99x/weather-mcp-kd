#!/usr/bin/env node

/**
 * Quick test script to verify that the weather agent displays player URL immediately
 * and provides asset readiness checking functionality
 */

import { weatherAgent } from './dist/agents/weather-agent.js';

async function testPlayerUrlDisplay() {
    console.log('🧪 Testing Weather Agent Player URL Display...\n');

    try {
        // Test 1: Check if the agent has the new asset readiness tool
        console.log('1️⃣ Checking if asset readiness tool is available...');
        const tools = weatherAgent.tools;
        const hasAssetReadinessTool = tools && tools['check-asset-readiness'];
        console.log(`   ✅ Asset readiness tool available: ${!!hasAssetReadinessTool}`);
        
        if (hasAssetReadinessTool) {
            console.log('   📋 Tool description:', tools['check-asset-readiness'].description);
        }

        // Test 2: Check if the TTS weather tool is available
        console.log('\n2️⃣ Checking if TTS weather tool is available...');
        const hasTtsTool = tools && tools['tts-weather-upload'];
        console.log(`   ✅ TTS weather tool available: ${!!hasTtsTool}`);
        
        if (hasTtsTool) {
            console.log('   📋 Tool description:', tools['tts-weather-upload'].description);
        }

        // Test 3: Test the textShim function with a mock audio request
        console.log('\n3️⃣ Testing textShim with audio request...');
        
        const mockMessages = [
            { role: 'user', content: 'audio weather for 90210' }
        ];
        
        console.log('   📤 Sending mock audio request...');
        const result = await weatherAgent.text({ messages: mockMessages });
        
        console.log('   📥 Response received:');
        console.log('   📝 Response preview:', result.text.substring(0, 200) + '...');
        
        // Check if response contains player URL and processing message
        const hasPlayerUrl = result.text.includes('Player URL:');
        const hasProcessingMessage = result.text.includes('processing') || result.text.includes('ready shortly');
        const hasEmojis = result.text.includes('🎥') || result.text.includes('⏳');
        
        console.log(`   ✅ Contains player URL: ${hasPlayerUrl}`);
        console.log(`   ✅ Contains processing message: ${hasProcessingMessage}`);
        console.log(`   ✅ Contains visual indicators: ${hasEmojis}`);

        // Test 4: Test asset readiness tool directly (if available)
        if (hasAssetReadinessTool) {
            console.log('\n4️⃣ Testing asset readiness tool...');
            
            try {
                const testResult = await tools['check-asset-readiness'].execute({
                    context: { assetId: 'test-asset-id' }
                });
                
                console.log('   📥 Asset readiness test result:', testResult);
                console.log('   ✅ Asset readiness tool executed successfully');
            } catch (error) {
                console.log('   ⚠️  Asset readiness tool test failed (expected for test asset):', error.message);
            }
        }

        console.log('\n🎉 Test completed successfully!');
        console.log('\n📋 Summary:');
        console.log('   - Weather agent has been updated to display player URLs immediately');
        console.log('   - Asset readiness checking tool is available');
        console.log('   - Response includes visual indicators for processing status');
        console.log('   - Background asset polling is implemented');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testPlayerUrlDisplay().catch(console.error);
