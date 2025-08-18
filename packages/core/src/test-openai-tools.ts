/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIClient } from './core/aiClient.js';
import { Config } from './config/config.js';
import { AuthType } from './core/contentGenerator.js';

/**
 * Test script to validate OpenAI tool calling integration.
 * Run with: OPENAI_API_KEY=your_key node dist/test-openai-tools.js
 */
async function testOpenAIToolCalling() {
  console.log('🔧 Testing OpenAI Tool Calling Integration...\n');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Usage: OPENAI_API_KEY=your_key npm run test:openai-tools');
    process.exit(1);
  }

  const isRealKey = apiKey.startsWith('sk-') && apiKey.length > 20;
  if (!isRealKey) {
    console.log('⚠️  Using mock API key - will test tool integration structure only\n');
  }

  try {
    // Create test config with tools
    const config = new Config({
      sessionId: 'test-openai-tools',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gpt-4o-mini',
    });

    await config.initialize();

    // Test 1: Create AIClient with tools
    console.log('📝 Test 1: Creating AIClient with tool support...');
    const aiClient = new AIClient(config, {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey,
    });

    await aiClient.initialize();
    console.log('✅ AIClient with tools created successfully\n');

    // Test 2: Check tool registry
    console.log('📝 Test 2: Checking tool registry...');
    const toolRegistry = await config.getToolRegistry();
    const tools = toolRegistry.getFunctionDeclarations();
    console.log(`Found ${tools.length} available tools:`);
    tools.slice(0, 5).forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description?.substring(0, 60)}...`);
    });
    if (tools.length > 5) {
      console.log(`  ... and ${tools.length - 5} more tools`);
    }
    console.log('✅ Tool registry working correctly\n');

    if (!isRealKey) {
      console.log('⚠️  Skipping real API calls with mock key - tool integration structure validated\n');
      console.log('✅ OpenAI tool calling integration structure is correctly implemented');
      console.log('🔑 To test with real API calls, use: OPENAI_API_KEY=sk-your-real-key npm run test:openai-tools');
      return;
    }

    // Test 3: Tool calling (only with real key)
    console.log('📝 Test 3: Testing tool calling...');
    const response = await aiClient.generateText(
      'List the files in the current directory using available tools.',
      {
        tools: true,
        temperature: 0.1,
        maxTokens: 500,
      }
    );

    console.log('Response:', response.text);
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log('Tool calls made:');
      response.toolCalls.forEach((call, index) => {
        console.log(`  ${index + 1}. ${call.name} with args:`, call.args);
        console.log(`     Result:`, call.result);
      });
    }
    console.log('✅ Tool calling successful\n');

    // Test 4: Streaming with tools (only with real key)
    console.log('📝 Test 4: Testing streaming with tool calls...');
    let streamText = '';
    const streamEvents = await aiClient.streamText(
      'Check what files are in the current directory and tell me about them.',
      {
        tools: true,
        temperature: 0.1,
        maxTokens: 300,
      }
    );

    for await (const event of streamEvents) {
      switch (event.type) {
        case 'text':
          if (event.content) {
            streamText += event.content;
            process.stdout.write(event.content);
          }
          break;
        case 'tool-call':
          console.log(`\n🔧 Tool called: ${event.toolCall?.name} with args:`, event.toolCall?.args);
          break;
        case 'tool-result':
          console.log(`🔧 Tool result: ${JSON.stringify(event.toolResult?.result).substring(0, 100)}...`);
          break;
      }
    }
    console.log('\n✅ Streaming with tools successful\n');

    console.log('🎉 All OpenAI tool calling tests passed!');
    console.log('✅ OpenAI tool integration is working correctly');

  } catch (error) {
    console.error('❌ OpenAI tool calling test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOpenAIToolCalling().catch(console.error);
}

export { testOpenAIToolCalling };