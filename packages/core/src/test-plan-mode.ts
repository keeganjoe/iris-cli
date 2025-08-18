/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReActServiceAI } from './core/reactServiceAI.js';
import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';

/**
 * Test script to demonstrate plan mode activation.
 * Plan mode is triggered when asking Iris to create a new application.
 * Run with: OPENAI_API_KEY=your_key node dist/src/test-plan-mode.js
 */
async function testPlanMode() {
  console.log('📋 Testing Plan Mode Activation...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run build && node dist/src/test-plan-mode.js');
    process.exit(1);
  }

  try {
    // Create test config with ReAct enabled
    const config = new Config({
      sessionId: 'test-plan-mode',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gpt-4o-mini',
    });

    await config.initialize();

    // Enable ReAct
    config.setReActSettings({
      enabled: true,
      maxCycles: 3,
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

    // Test queries that should trigger plan mode (new application requests)
    const planModeQueries = [
      "Create a todo app with React and TypeScript",
      "Build a weather application using Node.js and Express",
      "I want to create a simple game using JavaScript and HTML5 Canvas",
      "Develop a blog platform with authentication and database integration",
      "Make a real-time chat application with WebSocket support"
    ];

    console.log('🎯 Testing Plan Mode Queries:');
    console.log('='.repeat(60));

    for (let i = 0; i < planModeQueries.length; i++) {
      const query = planModeQueries[i];
      console.log(`\n📋 Query ${i + 1}: ${query}`);
      console.log('-'.repeat(50));

      const startTime = Date.now();
      const result = await reactService.processQuery(query, true);
      const duration = Date.now() - startTime;

      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`📏 Response Length: ${result.processedQuery?.length || 0} characters`);
      
      if (result.reActResult) {
        console.log(`🔄 Cycles: ${result.reActResult.cycleCount}`);
        console.log(`📊 Confidence: ${Math.round(result.reActResult.averageConfidence * 100)}%`);
      }

      // Check if response contains plan-mode indicators
      const response = result.processedQuery || '';
      const hasProjectStructure = /technologies?|framework|component|feature/i.test(response);
      const hasImplementationPlan = /plan|phase|step|implement/i.test(response);
      const hasUserApproval = /approve|proceed|continue/i.test(response);
      
      console.log(`📋 Plan Mode Indicators:`);
      console.log(`   Technologies/Framework: ${hasProjectStructure ? '✅' : '❌'}`);
      console.log(`   Implementation Plan: ${hasImplementationPlan ? '✅' : '❌'}`);
      console.log(`   User Approval Request: ${hasUserApproval ? '✅' : '❌'}`);

      console.log(`📄 Response Preview:`);
      console.log(response.substring(0, 300) + (response.length > 300 ? '...' : ''));

      // Only test first query for detailed output
      if (i === 0) {
        console.log('\n📄 Full Response for First Query:');
        console.log('='.repeat(50));
        console.log(response);
        console.log('='.repeat(50));
      }
    }

    console.log('\n🎉 Plan mode testing completed!');
    console.log('\n💡 Plan Mode Notes:');
    console.log('   - Plan mode is triggered by requests to create new applications');
    console.log('   - Look for structured plans with technologies, features, and approval requests');
    console.log('   - ReAct enhances plan quality with comprehensive analysis');

  } catch (error) {
    console.error('❌ Plan mode test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testPlanMode().catch(console.error);