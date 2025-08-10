#!/usr/bin/env node

/**
 * Test OpenAI edge cases that might slip through our auto-fix logic
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testOpenAIEdgeCases() {
  console.log('🧪 Testing OpenAI Edge Cases...\\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not found!');
    process.exit(1);
  }

  try {
    const mockConfig = {
      getModel: () => 'gpt-4o-mini',
      getProxy: () => undefined,
      getUsageStatisticsEnabled: () => false,
      getDebugMode: () => false,
      getSessionId: () => 'test-session-id',
    };

    const contentGeneratorConfig = createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_OPENAI
    );

    const contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      mockConfig
    );

    console.log('✅ Created OpenAI ContentGenerator\\n');

    // Edge Case 1: Multiple consecutive tool calls without responses
    console.log('🔧 Edge Case 1: Multiple consecutive tool calls...');
    
    const edgeCase1Contents = [
      {
        role: 'user',
        parts: [{ text: 'Create multiple files' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'file1.txt', content: 'Content 1' },
            id: 'call_first'
          }
        }]
      },
      {
        role: 'model',  // Another model message with tool call (unusual but possible)
        parts: [{
          functionCall: {
            name: 'write_file', 
            args: { file_path: 'file2.txt', content: 'Content 2' },
            id: 'call_second'
          }
        }]
      },
      {
        role: 'user',
        parts: [{ text: 'What should happen next?' }]
      }
    ];

    const request1 = {
      model: 'gpt-4o-mini',
      contents: edgeCase1Contents,
      config: { temperature: 0, maxOutputTokens: 100 }
    };

    try {
      const result1 = await contentGenerator.generateContent(request1, 'edge-case-1');
      console.log('✅ Edge Case 1 PASSED - Multiple tool calls handled');
    } catch (error) {
      console.log('❌ Edge Case 1 FAILED:', error.message);
      if (error.message.includes('tool_call_id')) {
        console.log('   Found tool_call_id issue in multiple consecutive calls!');
      }
    }

    // Edge Case 2: Tool call with missing/null ID
    console.log('\\n🔧 Edge Case 2: Tool call with missing ID...');
    
    const edgeCase2Contents = [
      {
        role: 'user',
        parts: [{ text: 'Create a file' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'file.txt', content: 'Content' },
            // id: undefined/missing - this might cause issues
          }
        }]
      },
      {
        role: 'user',
        parts: [{ text: 'Continue' }]
      }
    ];

    const request2 = {
      model: 'gpt-4o-mini',
      contents: edgeCase2Contents,
      config: { temperature: 0, maxOutputTokens: 100 }
    };

    try {
      const result2 = await contentGenerator.generateContent(request2, 'edge-case-2');
      console.log('✅ Edge Case 2 PASSED - Missing ID handled');
    } catch (error) {
      console.log('❌ Edge Case 2 FAILED:', error.message);
      if (error.message.includes('tool_call_id')) {
        console.log('   Found tool_call_id issue with missing ID!');
        console.log('   This might be the root cause of the user\'s issue.');
      }
    }

    // Edge Case 3: Tool call at the very end of conversation (no user message after)
    console.log('\\n🔧 Edge Case 3: Tool call at conversation end...');
    
    const edgeCase3Contents = [
      {
        role: 'user',
        parts: [{ text: 'Create a file' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'final.txt', content: 'Final content' },
            id: 'call_final'
          }
        }]
      }
      // No user message after - conversation ends with tool call
    ];

    const request3 = {
      model: 'gpt-4o-mini',
      contents: edgeCase3Contents,
      config: { temperature: 0, maxOutputTokens: 100 }
    };

    try {
      const result3 = await contentGenerator.generateContent(request3, 'edge-case-3');
      console.log('✅ Edge Case 3 PASSED - End-of-conversation tool call handled');
    } catch (error) {
      console.log('❌ Edge Case 3 FAILED:', error.message);
      if (error.message.includes('tool_call_id')) {
        console.log('   Found tool_call_id issue at conversation end!');
        console.log('   Our auto-fix should add placeholders at the end.');
      }
    }

    console.log('\\n🎯 Edge case testing completed');

  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    process.exit(1);
  }
}

testOpenAIEdgeCases().catch(console.error);