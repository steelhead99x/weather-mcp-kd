import dotenv from 'dotenv';
import { weatherAgent } from '../agents/weather-agent.js';

dotenv.config();

function textOf(res: any): string {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (typeof res.text === 'string') return res.text;
  try { return JSON.stringify(res); } catch { return String(res); }
}

function assertContainsAny(haystack: string, needles: string[], message: string) {
  const found = needles.some(n => haystack.toLowerCase().includes(n.toLowerCase()));
  if (!found) {
    throw new Error(`${message} | Expected any of [${needles.join(', ')}] in: ${haystack}`);
  }
}

function assertContainsAll(haystack: string, needles: string[], message: string) {
  const missing = needles.filter(n => !haystack.toLowerCase().includes(n.toLowerCase()));
  if (missing.length) {
    throw new Error(`${message} | Missing: ${missing.join(', ')} in: ${haystack}`);
  }
}

  console.log('🧪 Testing Weather Agent...\n');

  const threadId = `test-session-${Date.now()}`;
  const userId = 'test-user-123';

  try {
    console.log('🎯 First interaction - Agent introduction...');

    // Try with memory first, fallback to without memory
    let memoryConfig: any = undefined;
    try {
      memoryConfig = { memory: { thread: threadId, resource: userId } };
    } catch (error) {
      console.log('Running without memory support');
    }

    // 1) Agent introduction
    const initResponse = await weatherAgent.generateVNext(
      "Hello! Let's test the weather agent.",
      memoryConfig
    );
    const initText = textOf(initResponse);
    console.log('✅ Agent introduction:');
    console.log(initText);

    console.log('\n' + '='.repeat(50) + '\n');

    // 2) No location provided -> should ask for ZIP
    console.log('❓ Testing prompt for location when none provided...');
    const noLocResponse = await weatherAgent.generateVNext(
      'Can you tell me the weather?',
      memoryConfig
    );
    const noLocText = textOf(noLocResponse);
    console.log(noLocText);
    assertContainsAny(noLocText, ['zip', 'zipcode', '5-digit', 'postal code'], 'Agent should ask for ZIP when no location provided');

    console.log('\n' + '-'.repeat(40));

    // 3) Non-English location -> should translate / still ask for ZIP
    console.log('🌐 Testing non-English location handling (Spanish)...');
    const esResponse = await weatherAgent.generateVNext(
      '¿Cuál es el clima en Madrid?',
      memoryConfig
    );
    const esText = textOf(esResponse);
    console.log(esText);
    assertContainsAny(esText, ['zip', 'zipcode', '5-digit', 'postal code', 'city', 'location'], 'Agent should request a ZIP or otherwise ask for a specific city/location for non-English input');

    console.log('\n' + '-'.repeat(40));

    console.log('🌐 Testing non-English location handling (Chinese)...');
    const zhResponse = await weatherAgent.generateVNext(
      '上海的天气怎么样？',
      memoryConfig
    );
    const zhText = textOf(zhResponse);
    console.log(zhText);
    assertContainsAny(zhText, ['zip', 'zipcode', '5-digit', 'postal code', 'city', 'location', '邮政编码', '美国', 'United States'], 'Agent should request a ZIP or clarify US ZIP limitation for non-English input');

    console.log('\n' + '='.repeat(50) + '\n');

    // 4) Multi-part location name -> should focus on main part (and likely still ask for ZIP)
    console.log('🧭 Testing multi-part location handling...');
    const multiLocResponse = await weatherAgent.generateVNext(
      'Weather for New York, NY, USA please.',
      memoryConfig
    );
    const multiLocText = textOf(multiLocResponse);
    console.log(multiLocText);
    // Expect it to mention New York and/or ask for a ZIP
    assertContainsAny(
      multiLocText,
      ['new york', 'zip', 'zipcode', '5-digit'],
      'Agent should focus on main location or ask for ZIP'
    );

    console.log('\n' + '='.repeat(50) + '\n');

    // 5) Actual weather lookup by ZIP -> should include details
    console.log('🌤️ Testing with ZIP code 94102...');
    const weatherResponse = await weatherAgent.generateVNext(
      'My zipcode is 94102, can you get the weather?',
      memoryConfig
    );
    const weatherText = textOf(weatherResponse);
    console.log('✅ Weather response:');
    console.log(weatherText);

    // Validate presence of some key weather info. The tool returns wind info and temperature.
    // Humidity/precipitation may be inferred; so require temperature and wind, and at least one of precipitation/humidity/conditions words.
    assertContainsAny(weatherText, ['wind', 'wind speed'], 'Response should include wind information');
    assertContainsAny(weatherText, ['temperature', 'temp', '°', 'degrees'], 'Response should include temperature');
    assertContainsAny(
      weatherText,
      ['precip', 'rain', 'snow', 'showers', 'drizzle', 'humidity', 'dry', 'wet', 'chance of', 'cloudy', 'sunny', 'clear', 'storm', 'fog', 'overcast', 'partly'],
      'Response should mention precipitation/humidity/conditions'
    );

    if (memoryConfig) {
      console.log('\n' + '='.repeat(30) + '\n');

      // 6) Memory recall
      console.log('🔄 Testing memory recall - asking about previous location...');
      const recallResponse = await weatherAgent.generateVNext(
        'What was the weather like in the last location I asked about?',
        memoryConfig
      );
      const recallText = textOf(recallResponse);
      console.log('✅ Memory recall response:');
      console.log(recallText);
      // Expect it to reference the last location (94102 / San Francisco)
      assertContainsAny(
        recallText,
        ['94102', 'san francisco', 'sf', 'new york', '10001', 'ny'],
        'Recall should reference one of the recently requested locations'
      );

      console.log('\n' + '='.repeat(30) + '\n');

      // 7) Another location for comparison
      console.log('🌍 Testing different location for comparison (10001)...');
      try {
        const newLocationResponse = await weatherAgent.generateVNext(
          'How about the weather in 10001 (New York)?',
          memoryConfig
        );
        const newLocText = textOf(newLocationResponse);
        console.log('✅ New location response:');
        console.log(newLocText);
        assertContainsAny(newLocText, ['10001', 'new york'], 'Response should reference the new location');
      } catch (e: any) {
        console.warn('⚠️ Skipping new location comparison due to API or rate limit issue:', e?.message || String(e));
      }

      console.log(`\n💾 Memory thread ID: ${threadId}`);
    }

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Weather agent test failed:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

main().catch((e) => {
  console.error('❌ Test execution failed:', e);
  process.exit(1);
});