#!/usr/bin/env node

/**
 * Test OpenAI generateJson method specifically to reproduce tool_call_id errors
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testGenerateJsonWithToolCalls() {
  console.log('🧪 Testing OpenAI generateJson with Tool Calls...\\n');
  
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

    // Create a conversation history that has a tool call but no response
    // This simulates what happens when generateJson gets conversation history
    const problematicContents = [
      {
        role: 'user',
        parts: [{ text: 'Create a file called hello.txt' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'hello.txt', content: 'Hello World' },
            id: 'call_test123'
          }
        }]
      },
      {
        role: 'user',
        parts: [{ text: 'Analyze the conversation and determine who should speak next.' }]
      }
    ];

    // This should trigger the same generateJson call as nextSpeakerChecker
    console.log('🔧 Testing generateJson with problematic conversation history...');
    
    const responseSchema = {
      type: 'OBJECT',
      properties: {
        next_speaker: {
          type: 'STRING',
          enum: ['user', 'model'],
          description: 'Who should speak next'
        },
        reasoning: {
          type: 'STRING',
          description: 'Why this speaker should go next'
        }
      },
      required: ['next_speaker', 'reasoning']
    };

    // This simulates the generateContent call that generateJson makes internally
    const request = {
      model: 'gpt-4o-mini',
      contents: problematicContents,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        responseSchema: responseSchema,
        responseMimeType: 'application/json'
      }
    };

    console.log('   Conversation history:');
    problematicContents.forEach((content, i) => {
      const roleLabel = content.role === 'user' ? '👤 User' : '🤖 Model';
      const partInfo = content.parts[0];
      if ('text' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: "${partInfo.text}"`);
      } else if ('functionCall' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool call ${partInfo.functionCall.name} (ID: ${partInfo.functionCall.id})`);
      }
    });

    const result = await contentGenerator.generateContent(request, 'test-generatejson');
    
    console.log('✅ generateJson test PASSED!');
    console.log(`   Response: ${result.text}`);
    console.log('   ✅ Auto-fix logic handled missing tool responses correctly');

  } catch (error) {
    console.error('❌ generateJson test FAILED:');
    console.error('  ', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 This confirms the tool_call_id issue in generateJson!');
      console.log('   The conversation history contains tool calls without responses.');
      console.log('   Our auto-fix logic should handle this case.');
    }
    
    process.exit(1);
  }
}

testGenerateJsonWithToolCalls().catch(console.error);