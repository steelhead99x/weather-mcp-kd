import 'dotenv/config';
import { weatherAgent, weatherAgentTestWrapper } from '../agents/weather-agent';

async function debugAgent() {
    console.log('🔍 Debugging Weather Agent...\n');

    // Test 1: Direct agent call (Mastra way)
    console.log('=== Test 1: Direct Agent ===');
    try {
        const result = await weatherAgent.generate([
            { role: 'user', content: 'What\'s the weather in 10001?' }
        ]);
        console.log('Direct agent result:', result);
    } catch (error) {
        console.error('Direct agent error:', error);
    }

    // Test 2: Test wrapper shim
    console.log('\n=== Test 2: Test Wrapper ===');
    try {
        const result = await weatherAgentTestWrapper.text({
            messages: [{ role: 'user', content: 'What\'s the weather in 10001?' }]
        });
        console.log('Test wrapper result:', result);
    } catch (error) {
        console.error('Test wrapper error:', error);
    }

    // Test 3: Tool direct call
    console.log('\n=== Test 3: Direct Tool Call ===');
    try {
        const { weatherTool } = await import('../tools/weather');
        const result = await weatherTool.execute({ context: { zipCode: '10001' } } as any);
        console.log('Direct tool result:', result);
    } catch (error) {
        console.error('Direct tool error:', error);
    }
}

debugAgent().catch(console.error);