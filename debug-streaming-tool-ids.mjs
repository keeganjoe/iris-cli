#!/usr/bin/env node

/**
 * Debug streaming tool call ID handling
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function debugStreamingToolIds() {
  console.log('🐛 Debugging Streaming Tool IDs...\\n');
  
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

    console.log('🔧 Testing streaming tool calls...');
    
    const streamRequest = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Create a simple file called hello.txt with content "Hello World"' }]
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

    console.log('   Making streaming request...');
    
    // Use streaming version to see if IDs are handled correctly
    const streamGenerator = await contentGenerator.generateContentStream(streamRequest, 'debug-stream');
    
    const collectedFunctionCalls = [];
    let textContent = '';
    
    console.log('   Processing stream chunks:');
    
    for await (const chunk of streamGenerator) {
      if (chunk.text) {
        textContent += chunk.text;
        console.log(`   📝 Text chunk: "${chunk.text}"`);
      }
      
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        for (const fnCall of chunk.functionCalls) {
          console.log(`   🔧 Function call chunk: ${fnCall.name} (ID: ${fnCall.id})`);
          console.log(`       Args: ${JSON.stringify(fnCall.args)}`);
          collectedFunctionCalls.push(fnCall);
        }
      }
    }
    
    console.log('\\n✅ Streaming completed');
    console.log(`   Total function calls collected: ${collectedFunctionCalls.length}`);
    
    if (collectedFunctionCalls.length > 0) {
      console.log('   Function call details:');
      collectedFunctionCalls.forEach((fnCall, i) => {
        console.log(`   ${i + 1}. Name: ${fnCall.name}, ID: ${fnCall.id}`);
      });
      
      // Check for duplicate or changing IDs
      const uniqueIds = new Set(collectedFunctionCalls.map(fc => fc.id));
      if (uniqueIds.size !== collectedFunctionCalls.length) {
        console.log('\\n⚠️  DUPLICATE OR INCONSISTENT TOOL CALL IDs DETECTED!');
        console.log('   This could be causing the ID mismatch issues.');
      } else {
        console.log('\\n✅ All tool call IDs are unique and consistent');
      }
    }

    console.log('\\n🎯 Streaming debug test completed');

  } catch (error) {
    console.error('❌ Streaming debug test failed:', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 Reproduced tool_call_id error in streaming!');
    }
    
    process.exit(1);
  }
}

debugStreamingToolIds().catch(console.error);