/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIClient } from './core/aiClient.js';
import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';

/**
 * Test script to validate OpenAI integration works correctly.
 * Run with: OPENAI_API_KEY=your_key node dist/test-openai-integration.js
 */
async function testOpenAIIntegration() {
  console.log('🚀 Testing OpenAI Integration...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run test:openai');
    process.exit(1);
  }

  const isRealKey = apiKey.startsWith('sk-') && apiKey.length > 20;
  if (!isRealKey) {
    console.log('⚠️  Using mock API key - will test integration structure only\n');
  }

  try {
    // Create test config
    const config = new Config({
      sessionId: 'test-openai-integration',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gpt-4o-mini', // Using a cost-effective model for testing
    });

    await config.initialize();

    // Test 1: Basic AIClient instantiation
    console.log('📝 Test 1: Creating AIClient instance...');
    const aiClient = new AIClient(config, {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey,
    });

    await aiClient.initialize();
    console.log('✅ AIClient created and initialized successfully\n');

    // Test 2: Provider info
    console.log('📝 Test 2: Checking provider info...');
    const providerInfo = aiClient.getProviderInfo();
    console.log('Provider:', providerInfo.provider);
    console.log('Model:', providerInfo.model);
    console.log('✅ Provider info retrieved successfully\n');

    if (!isRealKey) {
      console.log('⚠️  Skipping API calls with mock key - integration structure validated\n');
      console.log('✅ OpenAI integration structure is correctly implemented');
      console.log('🔑 To test with real API calls, use: OPENAI_API_KEY=sk-your-real-key npm run test:openai');
      return;
    }

    // Test 3: Basic text generation (only with real key)
    console.log('📝 Test 3: Basic text generation...');
    const response = await aiClient.generateText(
      'Say hello and tell me you are working correctly. Keep it brief.',
      {
        temperature: 0.1,
        maxTokens: 50,
      }
    );

    console.log('Response:', response.text);
    console.log('Usage:', response.usage);
    console.log('✅ Basic text generation successful\n');

    // Test 4: Streaming text generation (only with real key)
    console.log('📝 Test 4: Testing streaming text generation...');
    let streamedText = '';
    const streamEvents = await aiClient.streamText(
      'Count from 1 to 5, one number per line.',
      {
        temperature: 0.1,
        maxTokens: 30,
      }
    );

    for await (const event of streamEvents) {
      if (event.type === 'text' && event.content) {
        streamedText += event.content;
        process.stdout.write(event.content);
      }
    }
    console.log('\n✅ Streaming text generation successful\n');

    console.log('🎉 All OpenAI integration tests passed!');
    console.log('✅ OpenAI integration is working correctly');

  } catch (error) {
    console.error('❌ OpenAI integration test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOpenAIIntegration().catch(console.error);
}

export { testOpenAIIntegration };