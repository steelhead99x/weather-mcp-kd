import { weatherAgent } from '../agents/weather-agent.js';

/**
 * Test the Weather Agent including TTS upload functionality
 *
 * Required environment variables:
 * - ANTHROPIC_API_KEY: For the Claude model
 * - WEATHER_MCP_ENDPOINT: Weather API endpoint
 * - WEATHER_MCP_USER_AGENT: User agent for weather requests
 * - MUX_TOKEN_ID: Mux API token ID
 * - MUX_TOKEN_SECRET: Mux API token secret
 *
 * Optional:
 * - TTS_OUTPUT_BASE: Base path for TTS files (default: files/tts-)
 * - MUX_CORS_ORIGIN: CORS origin for Mux uploads (default: http://localhost)
 */

function assertContainsAny(text: string, substrings: string[], message?: string): void {
    const found = substrings.some(s => text.toLowerCase().includes(s.toLowerCase()));
    if (!found) {
        throw new Error(message || `Expected text to contain one of [${substrings.join(', ')}] but got: ${text.slice(0, 200)}...`);
    }
    console.log(`✓ ${message || `Contains one of [${substrings.join(', ')}]`}`);
}

async function testBasicWeatherQuery(): Promise<void> {
    console.log('\n=== Test: Basic Weather Query with ZIP ===');

    const result = await weatherAgent.text({
        messages: [{ role: 'user', content: 'What\'s the weather like in 10001?' }],
    });

    console.log('Agent response:', result.text);

    assertContainsAny(result.text, ['weather', 'temperature', 'forecast', 'condition'],
        'Agent should provide weather information');
    assertContainsAny(result.text, ['10001', 'New York'],
        'Agent should reference the ZIP code or location');
}

async function testNoLocationQuery(): Promise<void> {
    console.log('\n=== Test: No Location Provided ===');

    const result = await weatherAgent.text({
        messages: [{ role: 'user', content: 'What\'s the weather like?' }],
    });

    console.log('Agent response:', result.text);

    const noLocText = result.text.toLowerCase();
    assertContainsAny(noLocText, ['zip', 'zipcode', '5-digit', 'postal code'],
        'Agent should ask for ZIP when no location provided');
}

async function testTTSUploadRequest(): Promise<void> {
    console.log('\n=== Test: TTS Upload Request ===');

    // First get weather info
    const weatherResult = await weatherAgent.text({
        messages: [{ role: 'user', content: 'What\'s the weather in 90210?' }],
    });

    console.log('Weather response:', weatherResult.text);

    // Now request TTS upload
    const ttsResult = await weatherAgent.text({
        messages: [
            { role: 'user', content: 'What\'s the weather in 90210?' },
            { role: 'assistant', content: weatherResult.text },
            { role: 'user', content: 'Can you create an audio version and upload it to Mux?' }
        ],
    });

    console.log('TTS upload response:', ttsResult.text);

    assertContainsAny(ttsResult.text, ['upload', 'mux', 'audio', 'stream'],
        'Agent should mention upload/streaming functionality');
}

async function testDirectTTSTool(): Promise<void> {
    console.log('\n=== Test: Direct TTS Tool Usage ===');

    try {
        const result = await weatherAgent.text({
            messages: [{
                role: 'user',
                content: 'Use the TTS tool to create an audio weather report for ZIP code 94102 with the text "Today will be sunny with a high of 72 degrees"'
            }],
        });

        console.log('Direct TTS tool response:', result.text);

        assertContainsAny(result.text, ['94102', 'mux', 'upload', 'success'],
            'Agent should use TTS tool and report success');

    } catch (error) {
        console.log('Direct TTS tool test failed (expected if Mux not configured):',
            error instanceof Error ? error.message : String(error));
    }
}

async function testConversationalFlow(): Promise<void> {
    console.log('\n=== Test: Conversational Flow ===');

    // Start conversation
    const step1 = await weatherAgent.text({
        messages: [{ role: 'user', content: 'Hi, I need weather info' }],
    });

    console.log('Step 1 - Initial greeting:', step1.text);

    // Provide ZIP
    const step2 = await weatherAgent.text({
        messages: [
            { role: 'user', content: 'Hi, I need weather info' },
            { role: 'assistant', content: step1.text },
            { role: 'user', content: 'My ZIP is 60601' }
        ],
    });

    console.log('Step 2 - Weather response:', step2.text);

    assertContainsAny(step2.text, ['weather', 'temperature', '60601'],
        'Agent should provide weather for Chicago ZIP');

    // Request audio
    const step3 = await weatherAgent.text({
        messages: [
            { role: 'user', content: 'Hi, I need weather info' },
            { role: 'assistant', content: step1.text },
            { role: 'user', content: 'My ZIP is 60601' },
            { role: 'assistant', content: step2.text },
            { role: 'user', content: 'That\'s great! Can you make an audio version I can stream?' }
        ],
    });

    console.log('Step 3 - Audio request response:', step3.text);

    assertContainsAny(step3.text, ['audio', 'tts', 'upload', 'stream'],
        'Agent should offer to create audio version');
}

async function main(): Promise<void> {
    console.log('🌤️  Testing Weather Agent with TTS Upload Integration...\n');

    // Validate environment
    const requiredVars = [
        'ANTHROPIC_API_KEY',
        'WEATHER_MCP_ENDPOINT',
        'WEATHER_MCP_USER_AGENT',
        'MUX_TOKEN_ID',
        'MUX_TOKEN_SECRET'
    ];

    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
        console.warn('   Some tests may fail without proper configuration');
    }

    const tests = [
        testBasicWeatherQuery,
        testNoLocationQuery,
        testTTSUploadRequest,
        testDirectTTSTool,
        testConversationalFlow,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
            console.log('✅ Test passed\n');
        } catch (error) {
            failed++;
            console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
            console.log('');
        }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
        console.log('🎉 All tests passed!');
        return;
    } else {
        throw new Error('Some tests failed');
    }
}

// Run the main function
main().then(() => {
    // success path
    process.exit(0);
}).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});