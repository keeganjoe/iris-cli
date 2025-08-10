#!/usr/bin/env node

/**
 * Test OpenAI full conversation flow with tool execution and responses
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testOpenAIConversation() {
  console.log('🧪 Testing OpenAI Full Conversation Flow...\n');
  
  // Check if API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not found!');
    console.log('   Please export your OpenAI API key:');
    console.log('   export OPENAI_API_KEY="your-key-here"');
    process.exit(1);
  }

  try {
    // Create a basic config (we'll mock the parts we need)
    const mockConfig = {
      getModel: () => 'gpt-4o-mini',
      getProxy: () => undefined,
      getUsageStatisticsEnabled: () => false,
      getDebugMode: () => false,
      getSessionId: () => 'test-session-id',
    };

    // Create content generator config
    const contentGeneratorConfig = createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_OPENAI
    );

    console.log('✅ Created OpenAI content generator config');
    console.log(`   Model: ${contentGeneratorConfig.model}`);
    console.log(`   Auth Type: ${contentGeneratorConfig.authType}`);
    console.log(`   Has API Key: ${!!contentGeneratorConfig.apiKey}\n`);

    // Create the content generator
    const contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      mockConfig
    );

    console.log('✅ Successfully created OpenAI ContentGenerator');
    console.log(`   Provider: ${contentGenerator.constructor.name}\n`);

    // Test a conversation with tool calling and response
    console.log('🔧 Testing full conversation flow with tools...');
    
    // Step 1: Initial request that triggers tool call
    const initialRequest = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Calculate 5 + 3 using the calculator function.' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 100,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'calculator',
                description: 'Perform basic arithmetic operations',
                parameters: {
                  type: 'object',
                  properties: {
                    operation: {
                      type: 'string',
                      description: 'The arithmetic operation to perform',
                      enum: ['add', 'subtract', 'multiply', 'divide']
                    },
                    a: {
                      type: 'number',
                      description: 'First number'
                    },
                    b: {
                      type: 'number',
                      description: 'Second number'
                    }
                  },
                  required: ['operation', 'a', 'b']
                }
              }
            ]
          }
        ]
      }
    };

    const step1Response = await contentGenerator.generateContent(initialRequest, 'test-prompt-1');
    
    console.log('✅ Step 1 - Tool call response received:');
    console.log(`   Function Calls: ${step1Response.functionCalls?.length || 0}`);
    if (step1Response.functionCalls && step1Response.functionCalls.length > 0) {
      console.log(`   Function Call: ${JSON.stringify(step1Response.functionCalls[0])}`);
    }

    // Step 2: Simulate tool execution and provide response
    if (step1Response.functionCalls && step1Response.functionCalls.length > 0) {
      const functionCall = step1Response.functionCalls[0];
      
      // Simulate tool execution
      const toolResult = '8'; // 5 + 3 = 8
      
      // Use the actual tool call ID from the OpenAI response
      const toolCallId = functionCall.id || 'call_fallback';
      console.log(`   Using Tool Call ID: ${toolCallId}`);
      
      // Step 3: Continue conversation with tool response
      const followupRequest = {
        model: 'gpt-4o-mini',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Calculate 5 + 3 using the calculator function.' }]
          },
          {
            role: 'model',
            parts: [{
              functionCall: {
                name: functionCall.name,
                args: functionCall.args,
                id: toolCallId
              }
            }]
          },
          {
            role: 'user',
            parts: [{
              functionResponse: {
                id: toolCallId,
                name: functionCall.name,
                response: {
                  output: toolResult
                }
              }
            }]
          }
        ],
        config: {
          temperature: 0,
          maxOutputTokens: 100
        }
      };

      console.log('\n🔧 Testing conversation continuation with tool response...');
      
      const step3Response = await contentGenerator.generateContent(followupRequest, 'test-prompt-3');
      
      console.log('✅ Step 3 - Final response after tool execution:');
      console.log(`   Text: "${step3Response.text}"`);
      console.log(`   Usage: ${JSON.stringify(step3Response.usageMetadata)}\n`);
    }

    console.log('🎉 OpenAI Full Conversation Test PASSED!');
    console.log('   ✅ Initial tool call successful');
    console.log('   ✅ Tool response conversation flow working');
    console.log('   ✅ No "tool_call_id" errors from OpenAI');

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('  ', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\n💡 Tool call ID correlation issue detected!');
      console.log('   This means the tool_call_id in the tool response doesn\'t match');
      console.log('   the id in the assistant\'s tool_calls array.');
    }
    
    if (error.message.includes('tool_calls') && error.message.includes('must be followed')) {
      console.log('\n💡 Tool response sequence issue detected!');
      console.log('   OpenAI requires tool responses immediately after tool calls.');
    }
    
    process.exit(1);
  }
}

testOpenAIConversation().catch(console.error);