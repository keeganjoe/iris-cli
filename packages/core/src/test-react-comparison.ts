/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';
import { GeminiClient } from './core/client.js';
import { ReActServiceAI } from './core/reactServiceAI.js';

/**
 * Test script to compare ReAct enabled vs disabled output quality.
 * Run with: OPENAI_API_KEY=your_key node dist/src/test-react-comparison.js
 */
async function testReActComparison() {
  console.log('🔬 Testing ReAct Mode Comparison...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run test:react-compare');
    process.exit(1);
  }

  const testQuery = "I want to create an interactive video app using generative AI capabilities. Create a comprehensive implementation plan.";

  try {
    // Create config
    const config = new Config({
      sessionId: 'test-react-comparison',
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: 'gpt-4o-mini',
    });
    await config.refreshAuth(AuthType.USE_OPENAI);

    console.log('🎯 Test Query:', testQuery);
    console.log('\n' + '='.repeat(80));

    // Test 1: Normal mode (ReAct disabled)
    console.log('\n📋 TEST 1: NORMAL MODE (ReAct Disabled)');
    console.log('='.repeat(50));

    // Disable ReAct
    config.setReActSettings({
      ...config.getReActSettings(),
      enabled: false,
    });

    const client1 = new GeminiClient(config);
    const startTime1 = Date.now();
    
    // Simulate the normal flow by calling generateContent directly
    const response1 = await client1.getContentGenerator().generateContent(
      {
        model: config.getModel(),
        config: {
          systemInstruction: 'You are a helpful AI assistant.',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: testQuery }]
          }
        ],
      },
      'test-normal-mode'
    );

    const duration1 = Date.now() - startTime1;
    const normalResponse = response1.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    console.log(`⏱️  Duration: ${duration1}ms`);
    console.log(`📏 Length: ${normalResponse.length} characters`);
    console.log(`📄 Response Preview:\n${normalResponse.substring(0, 500)}${normalResponse.length > 500 ? '...' : ''}\n`);

    // Test 2: ReAct mode (ReAct enabled)
    console.log('\n🤖 TEST 2: REACT MODE (ReAct Enabled)');
    console.log('='.repeat(50));

    // Enable ReAct
    config.setReActSettings({
      ...config.getReActSettings(),
      enabled: true,
      maxCycles: 3, // Limit cycles for faster testing
    });

    const reactService = new ReActServiceAI(config);
    await reactService.initialize();

    const startTime2 = Date.now();
    const result2 = await reactService.processQuery(testQuery, true);
    const duration2 = Date.now() - startTime2;
    
    const reactResponse = result2.processedQuery || 'No response';

    console.log(`⏱️  Duration: ${duration2}ms`);
    console.log(`📏 Length: ${reactResponse.length} characters`);
    console.log(`🔄 Cycles: ${result2.reActResult?.cycleCount || 0}`);
    console.log(`📊 Confidence: ${Math.round((result2.reActResult?.averageConfidence || 0) * 100)}%`);
    console.log(`📄 Response Preview:\n${reactResponse.substring(0, 500)}${reactResponse.length > 500 ? '...' : ''}\n`);

    // Comparison Analysis
    console.log('\n📊 COMPARISON ANALYSIS');
    console.log('='.repeat(50));
    
    const lengthDiff = reactResponse.length - normalResponse.length;
    const timeDiff = duration2 - duration1;
    
    console.log(`📏 Length Comparison:`);
    console.log(`   Normal: ${normalResponse.length} chars`);
    console.log(`   ReAct:  ${reactResponse.length} chars`);
    console.log(`   Diff:   ${lengthDiff > 0 ? '+' : ''}${lengthDiff} chars (${lengthDiff > 0 ? 'ReAct longer' : 'Normal longer'})`);
    
    console.log(`\n⏱️  Time Comparison:`);
    console.log(`   Normal: ${duration1}ms`);
    console.log(`   ReAct:  ${duration2}ms`);
    console.log(`   Diff:   ${timeDiff > 0 ? '+' : ''}${timeDiff}ms (${timeDiff > 0 ? 'ReAct slower' : 'ReAct faster'})`);

    // Content Analysis
    console.log(`\n📄 Content Analysis:`);
    const normalHasHeaders = /^##\s/.test(normalResponse);
    const reactHasHeaders = /^##\s/.test(reactResponse);
    const normalHasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(normalResponse);
    const reactHasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(reactResponse);
    const normalHasTables = /\|.*\|/.test(normalResponse);
    const reactHasTables = /\|.*\|/.test(reactResponse);
    const normalHasCode = /```/.test(normalResponse);
    const reactHasCode = /```/.test(reactResponse);

    console.log(`   Headers:    Normal=${normalHasHeaders ? '✅' : '❌'}, ReAct=${reactHasHeaders ? '✅' : '❌'}`);
    console.log(`   Emojis:     Normal=${normalHasEmojis ? '✅' : '❌'}, ReAct=${reactHasEmojis ? '✅' : '❌'}`);
    console.log(`   Tables:     Normal=${normalHasTables ? '✅' : '❌'}, ReAct=${reactHasTables ? '✅' : '❌'}`);
    console.log(`   Code:       Normal=${normalHasCode ? '✅' : '❌'}, ReAct=${reactHasCode ? '✅' : '❌'}`);

    // Save full outputs for detailed comparison
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fs = await import('node:fs');
    
    await fs.promises.writeFile(
      `/tmp/normal-mode-${timestamp}.md`,
      `# Normal Mode Output\n\nQuery: ${testQuery}\n\nDuration: ${duration1}ms\nLength: ${normalResponse.length} chars\n\n---\n\n${normalResponse}`
    );
    
    await fs.promises.writeFile(
      `/tmp/react-mode-${timestamp}.md`,
      `# ReAct Mode Output\n\nQuery: ${testQuery}\n\nDuration: ${duration2}ms\nLength: ${reactResponse.length} chars\nCycles: ${result2.reActResult?.cycleCount || 0}\nConfidence: ${Math.round((result2.reActResult?.averageConfidence || 0) * 100)}%\n\n---\n\n${reactResponse}`
    );

    console.log(`\n📁 Full outputs saved to:`);
    console.log(`   Normal: /tmp/normal-mode-${timestamp}.md`);
    console.log(`   ReAct:  /tmp/react-mode-${timestamp}.md`);

    console.log('\n🎉 Comparison test completed!');
    console.log('\n💡 To analyze the differences:');
    console.log(`   diff /tmp/normal-mode-${timestamp}.md /tmp/react-mode-${timestamp}.md`);

  } catch (error) {
    console.error('❌ Comparison test failed:', error);
    process.exit(1);
  }
}

// Run the test
testReActComparison().catch(console.error);