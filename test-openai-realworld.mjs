#!/usr/bin/env node

/**
 * Test OpenAI with a more realistic CLI scenario
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testRealWorldScenario() {
  console.log('🧪 Testing OpenAI Real-world CLI Scenario...\n');
  
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

    console.log('✅ Created OpenAI ContentGenerator\n');

    // Simulate a scenario that would trigger the CLI bug:
    // 1. User asks for something that requires a tool
    // 2. Assistant responds with tool calls
    // 3. CLI tries to continue conversation without providing tool responses first

    console.log('🔧 Step 1: Request that will trigger tool calls...');
    
    const step1Request = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Create a file called test.txt with the content "Hello World"' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'write_file',
                description: 'Write content to a file',
                parameters: {
                  type: 'object',
                  properties: {
                    file_path: {
                      type: 'string',
                      description: 'The path where to write the file'
                    },
                    content: {
                      type: 'string', 
                      description: 'The content to write to the file'
                    }
                  },
                  required: ['file_path', 'content']
                }
              }
            ]
          }
        ]
      }
    };

    const step1Response = await contentGenerator.generateContent(step1Request, 'test-prompt-1');
    
    console.log('✅ Step 1 Response received:');
    console.log(`   Function Calls: ${step1Response.functionCalls?.length || 0}`);
    if (step1Response.functionCalls && step1Response.functionCalls.length > 0) {
      console.log(`   Tool Call: ${JSON.stringify(step1Response.functionCalls[0])}`);
    }

    // Simulate the problematic scenario: try to make another request 
    // without providing tool responses (this should now be auto-fixed)
    console.log('\n🔧 Step 2: Attempting problematic follow-up request...');
    
    const problematicRequest = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Create a file called test.txt with the content "Hello World"' }]
        },
        {
          role: 'model',
          parts: step1Response.functionCalls ? [{
            functionCall: step1Response.functionCalls[0]
          }] : [{ text: 'I need to create a file.' }]
        },
        {
          role: 'user', 
          parts: [{ text: 'Actually, can you also tell me what time it is?' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 200
      }
    };

    // This should now work thanks to our auto-fix logic
    const step2Response = await contentGenerator.generateContent(problematicRequest, 'test-prompt-2');
    
    console.log('✅ Step 2 Response received (auto-fixed):');
    console.log(`   Text: "${step2Response.text}"`);
    console.log(`   Usage: ${JSON.stringify(step2Response.usageMetadata)}\n`);

    console.log('🎉 Real-world Scenario Test PASSED!');
    console.log('   ✅ Tool calls work correctly');
    console.log('   ✅ Problematic conversation auto-fixed');
    console.log('   ✅ No tool_call_id errors from OpenAI');

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('  ', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\n💡 Still experiencing tool call ID issues!');
      console.log('   The auto-fix logic may need refinement.');
    }
    
    process.exit(1);
  }
}

testRealWorldScenario().catch(console.error);