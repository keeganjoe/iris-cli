/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReActServiceAI } from './core/reactServiceAI.js';
import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';

/**
 * Test script to reproduce the user's business plan query issue.
 * Run with: OPENAI_API_KEY=your_key node dist/test-business-plan.js
 */
async function testBusinessPlanQuery() {
  console.log('🏢 Testing Business Plan Query with ReAct Mode...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run build && node dist/src/test-business-plan.js');
    process.exit(1);
  }

  try {
    // Create test config with ReAct enabled (same as user's setup)
    const config = new Config({
      sessionId: 'test-business-plan',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gpt-4o-mini',
    });

    await config.initialize();

    // Enable ReAct with user's settings
    config.setReActSettings({
      enabled: true,
      maxCycles: 5,
      showInternalThoughts: true,
      autoReflection: true,
      confidenceThreshold: 0.8,
    });

    // Initialize content generator config for OpenAI
    await config.refreshAuth(AuthType.USE_OPENAI);

    console.log('📝 Creating ReActServiceAI...');
    const reactService = new ReActServiceAI(config);
    await reactService.initialize();
    console.log('✅ ReActServiceAI created and initialized successfully\n');

    // Test with the exact business plan query the user was using
    const businessPlanQuery = "I want to start a business but I am not sure about what business to start. Can you help me with coming up with business plan";
    
    console.log('🎯 Business Plan Query:', businessPlanQuery);
    console.log('\n' + '='.repeat(80));
    console.log('🤖 Processing with ReAct Mode...');
    console.log('='.repeat(80) + '\n');

    const startTime = Date.now();
    const result = await reactService.processQuery(businessPlanQuery, true);
    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80));

    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📏 Response Length: ${result.processedQuery?.length || 0} characters`);
    console.log(`🔄 Should Proceed: ${result.shouldProceedWithNormalFlow}`);
    
    if (result.reActResult) {
      console.log(`📈 ReAct Session:`);
      console.log(`   Session ID: ${result.reActResult.sessionId}`);
      console.log(`   Success: ${result.reActResult.success}`);
      console.log(`   Cycles: ${result.reActResult.cycleCount}`);
      console.log(`   Confidence: ${Math.round(result.reActResult.averageConfidence * 100)}%`);
      console.log(`   Duration: ${result.reActResult.totalDuration}ms`);
    }

    console.log('\n📄 Response Preview:');
    console.log('='.repeat(50));
    if (result.processedQuery) {
      console.log(result.processedQuery.substring(0, 1000));
      if (result.processedQuery.length > 1000) {
        console.log('\n... (truncated for display) ...');
        console.log(`\nTotal length: ${result.processedQuery.length} characters`);
      }
    } else {
      console.log('❌ No response generated');
    }

    console.log('\n🎉 Business plan query test completed!');

  } catch (error) {
    console.error('❌ Business plan query test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testBusinessPlanQuery().catch(console.error);