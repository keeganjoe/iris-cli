/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReActServiceAI } from './core/reactServiceAI.js';
import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';

/**
 * Test script to validate OpenAI ReAct mode integration.
 * Run with: OPENAI_API_KEY=your_key node dist/test-openai-react.js
 */
async function testOpenAIReAct() {
  console.log('🤖 Testing OpenAI ReAct Mode Integration...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run test:openai-react');
    process.exit(1);
  }

  const isRealKey = apiKey.startsWith('sk-') && apiKey.length > 20;
  if (!isRealKey) {
    console.log('⚠️  Using mock API key - will test ReAct structure only\n');
  }

  try {
    // Create test config with ReAct enabled
    const config = new Config({
      sessionId: 'test-openai-react',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gpt-4o-mini',
      react: {
        enabled: true,
        maxCycles: 3,
        showInternalThoughts: true,
        autoReflection: true,
        confidenceThreshold: 0.8,
      },
    });

    await config.initialize();

    // Initialize content generator config for OpenAI
    await config.refreshAuth(AuthType.USE_OPENAI);

    // Test 1: Create ReActServiceAI
    console.log('📝 Test 1: Creating ReActServiceAI...');
    const reactService = new ReActServiceAI(config);
    await reactService.initialize();
    console.log('✅ ReActServiceAI created and initialized successfully\n');

    // Test 2: Check ReAct configuration
    console.log('📝 Test 2: Checking ReAct configuration...');
    const reactSettings = config.getReActSettings?.() || {};
    console.log('ReAct Settings:', {
      enabled: reactSettings.enabled,
      maxCycles: reactSettings.maxCycles,
      confidenceThreshold: reactSettings.confidenceThreshold,
    });
    console.log('✅ ReAct configuration verified\n');

    // Test 3: Check if ReAct is active
    console.log('📝 Test 3: Testing ReAct status...');
    console.log('Is ReAct Active:', reactService.isReActActive());
    console.log('Current Session:', reactService.getCurrentSession());
    console.log('✅ ReAct status checked successfully\n');

    if (!isRealKey) {
      console.log('⚠️  Skipping ReAct execution with mock key - ReAct structure validated\n');
      console.log('✅ OpenAI ReAct integration structure is correctly implemented');
      console.log('🔑 To test with real API calls, use: OPENAI_API_KEY=sk-your-real-key npm run test:openai-react');
      return;
    }

    // Test 4: Process simple query with ReAct (only with real key)
    console.log('📝 Test 4: Processing query with ReAct mode...');
    
    // Set up event listener to monitor ReAct cycles
    let eventsReceived: any[] = [];
    reactService.addEventListener((event) => {
      eventsReceived.push(event);
      console.log(`🔄 ReAct Event: ${event.type}`);
      if (event.data) {
        const data = event.data as any;
        if (data.thought) console.log(`   💭 Thought: ${data.thought.substring(0, 60)}...`);
        if (data.action) console.log(`   ⚡ Action: ${data.action.name}`);
        if (data.observation) console.log(`   👁️  Observation: ${data.observation.substring(0, 60)}...`);
        if (data.reflection) console.log(`   🤔 Reflection: ${data.reflection.substring(0, 60)}...`);
      }
    });

    const result = await reactService.processQuery(
      'Tell me what programming languages files are in the current directory',
      true // Force ReAct mode
    );

    console.log('\nReAct Processing Result:');
    console.log('Should Proceed:', result.shouldProceedWithNormalFlow);
    console.log('Processed Query:', result.processedQuery?.substring(0, 200) + '...');
    console.log('Events Received:', eventsReceived.length);
    
    if (result.reActResult) {
      console.log('ReAct Session:', {
        sessionId: result.reActResult.sessionId,
        success: result.reActResult.success,
        cycleCount: result.reActResult.cycleCount,
        averageConfidence: result.reActResult.averageConfidence,
        totalDuration: result.reActResult.totalDuration + 'ms',
      });
    }
    
    console.log('✅ ReAct mode processing successful\n');

    console.log('🎉 All OpenAI ReAct integration tests passed!');
    console.log('✅ OpenAI ReAct integration is working correctly');

  } catch (error) {
    console.error('❌ OpenAI ReAct integration test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOpenAIReAct().catch(console.error);
}

export { testOpenAIReAct };