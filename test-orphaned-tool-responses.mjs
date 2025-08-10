#!/usr/bin/env node

/**
 * Test orphaned tool response handling - the specific fix for the user's issue
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testOrphanedToolResponses() {
  console.log('🧪 Testing Orphaned Tool Response Handling...\\n');
  
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

    // Test 1: Orphaned tool response with no matching tool call ID
    console.log('🔧 Test 1: Orphaned tool response scenario...');
    
    const orphanedResponse = [
      {
        role: 'user',
        parts: [{ text: 'Create a file' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'test.txt', content: 'Hello' },
            id: 'call_REAL_ID'  // This is the real tool call ID
          }
        }]
      },
      {
        role: 'user',
        parts: [{
          functionResponse: {
            id: 'call_ORPHANED_ID',  // This ID doesn't match the tool call above!
            name: 'write_file',
            response: { error: 'Tool execution failed' }
          }
        }]
      },
      {
        role: 'user',
        parts: [{ text: 'What happened?' }]
      }
    ];

    console.log('   Conversation with orphaned tool response:');
    orphanedResponse.forEach((content, i) => {
      const roleLabel = content.role === 'user' ? '👤 User' : '🤖 Model';
      const partInfo = content.parts?.[0];
      if (partInfo && 'text' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: "${partInfo.text}"`);
      } else if (partInfo && 'functionCall' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool call ${partInfo.functionCall.name} (ID: ${partInfo.functionCall.id})`);
      } else if (partInfo && 'functionResponse' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool response for ${partInfo.functionResponse.name} (ID: ${partInfo.functionResponse.id})`);
        if (partInfo.functionResponse.id !== 'call_REAL_ID') {
          console.log(`        ⚠️  ID MISMATCH: Response ID '${partInfo.functionResponse.id}' != Call ID 'call_REAL_ID'`);
        }
      }
    });

    const request1 = {
      model: 'gpt-4o-mini',
      contents: orphanedResponse,
      config: { temperature: 0, maxOutputTokens: 100 }
    };

    console.log('\\n   Sending request with orphaned tool response...');
    
    const result1 = await contentGenerator.generateContent(request1, 'test-orphaned');
    
    console.log('✅ Test 1 PASSED - Orphaned tool response handled');
    console.log(`   Response: "${result1.text}"`);
    console.log('   ✅ No tool_call_id errors from OpenAI');

    // Test 2: Multiple orphaned responses  
    console.log('\\n🔧 Test 2: Multiple orphaned tool responses...');
    
    const multipleOrphaned = [
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
            id: 'call_REAL_1'
          }
        }]
      },
      {
        role: 'model',  // Another tool call
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'file2.txt', content: 'Content 2' },
            id: 'call_REAL_2'
          }
        }]
      },
      {
        role: 'user',  // Response with wrong ID
        parts: [{
          functionResponse: {
            id: 'call_WRONG_1',  // Doesn't match any real call
            name: 'write_file',
            response: { output: 'File created' }
          }
        }]
      },
      {
        role: 'user',  // Another response with wrong ID
        parts: [{
          functionResponse: {
            id: 'call_WRONG_2',  // Also doesn't match
            name: 'write_file', 
            response: { output: 'File created' }
          }
        }]
      },
      {
        role: 'user',
        parts: [{ text: 'Are the files created?' }]
      }
    ];

    const request2 = {
      model: 'gpt-4o-mini',
      contents: multipleOrphaned,
      config: { temperature: 0, maxOutputTokens: 100 }
    };

    console.log('   Testing multiple orphaned responses...');
    
    const result2 = await contentGenerator.generateContent(request2, 'test-multi-orphaned');
    
    console.log('✅ Test 2 PASSED - Multiple orphaned responses handled');
    console.log(`   Response: "${result2.text}"`);

    console.log('\\n🎉 Orphaned Tool Response Tests COMPLETED!');
    console.log('   ✅ Single orphaned response handled correctly');
    console.log('   ✅ Multiple orphaned responses handled correctly');
    console.log('   ✅ No tool_call_id errors from OpenAI');
    console.log('\\n💡 This fix should resolve the user\'s streaming error!');

  } catch (error) {
    console.error('❌ Orphaned tool response test FAILED:', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 Still experiencing tool_call_id issues!');
      console.log('   The orphaned response detection may need refinement.');
    }
    
    process.exit(1);
  }
}

testOrphanedToolResponses().catch(console.error);