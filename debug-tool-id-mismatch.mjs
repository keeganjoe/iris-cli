#!/usr/bin/env node

/**
 * Debug the exact tool ID mismatch scenario from the error log
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function debugToolIdMismatch() {
  console.log('🐛 Debugging Tool ID Mismatch...\\n');
  
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

    // Simulate the exact failing scenario: a tool call that fails with empty args
    console.log('🔧 Step 1: Make a tool call that will fail (like in the log)...');
    
    const step1Request = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'create markdown file with user management requirements' }]
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

    const step1Response = await contentGenerator.generateContent(step1Request, 'debug-step-1');
    
    console.log('✅ Step 1 Response:');
    console.log(`   Function Calls: ${step1Response.functionCalls?.length || 0}`);
    
    if (step1Response.functionCalls && step1Response.functionCalls.length > 0) {
      const firstCall = step1Response.functionCalls[0];
      console.log(`   First Call ID: ${firstCall.id}`);
      console.log(`   First Call Name: ${firstCall.name}`);
      console.log(`   First Call Args: ${JSON.stringify(firstCall.args)}`);
      
      // Step 2: Simulate the failure response (like in the error log)
      console.log('\\n🔧 Step 2: Simulate tool failure and retry...');
      
      const conversationWithFailure = [
        {
          role: 'user',
          parts: [{ text: 'create markdown file with user management requirements' }]
        },
        {
          role: 'model',
          parts: [{
            functionCall: {
              name: firstCall.name,
              args: firstCall.args,
              id: firstCall.id
            }
          }]
        },
        {
          role: 'user',
          parts: [{
            functionResponse: {
              id: firstCall.id,
              name: firstCall.name,
              response: {
                error: "params must have required property 'file_path'"
              }
            }
          }]
        }
      ];

      console.log(`   Simulating failure for tool call ID: ${firstCall.id}`);
      
      const step2Request = {
        model: 'gpt-4o-mini',
        contents: conversationWithFailure,
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

      const step2Response = await contentGenerator.generateContent(step2Request, 'debug-step-2');
      
      console.log('✅ Step 2 Response (retry after failure):');
      console.log(`   Function Calls: ${step2Response.functionCalls?.length || 0}`);
      
      if (step2Response.functionCalls && step2Response.functionCalls.length > 0) {
        const retryCall = step2Response.functionCalls[0];
        console.log(`   Retry Call ID: ${retryCall.id}`);
        console.log(`   Retry Call Name: ${retryCall.name}`);
        console.log(`   Retry Call Args: ${JSON.stringify(retryCall.args)}`);
        
        // Check if IDs are different (this might be the issue)
        if (firstCall.id !== retryCall.id) {
          console.log('\\n⚠️  TOOL ID MISMATCH DETECTED!');
          console.log(`   Original ID: ${firstCall.id}`);
          console.log(`   Retry ID: ${retryCall.id}`);
          console.log('   This could cause the tool_call_id error we are seeing.');
        } else {
          console.log('\\n✅ Tool IDs are consistent');
        }
      }
    }

    console.log('\\n🎯 Debug test completed');

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 REPRODUCED the tool_call_id error!');
      console.log('   This confirms the ID mismatch issue in the real scenario.');
    }
    
    process.exit(1);
  }
}

debugToolIdMismatch().catch(console.error);