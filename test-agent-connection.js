#!/usr/bin/env node

/**
 * Simple test script to verify the weather agent is working
 * Run with: node test-agent-connection.js
 */

import { weatherAgent } from './dist/agents/weather-agent.js';

async function testAgent() {
    console.log('🧪 Testing Weather Agent Connection...\n');
    
    try {
        // Test basic weather query
        console.log('📡 Testing basic weather query...');
        const result = await weatherAgent.text({
            messages: [{ role: 'user', content: 'What\'s the weather like in 10001?' }],
        });
        
        console.log('✅ Agent Response:', result.text);
        console.log('\n🎉 Agent is working correctly!');
        
    } catch (error) {
        console.error('❌ Agent test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the test
testAgent().catch(console.error);
