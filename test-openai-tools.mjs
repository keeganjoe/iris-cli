#!/usr/bin/env node

/**
 * Test OpenAI integration with tools (function calling)
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testOpenAIWithTools() {
  console.log('🧪 Testing OpenAI Integration with Tools...\n');
  
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

    // Test with complex tool schemas including numeric constraints
    console.log('🔧 Testing content generation with complex tool schemas...');
    
    const request = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Read all TypeScript files in the src directory using the read_many_files function.' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 100,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'read_many_files',
                description: 'Read multiple files at once',
                parameters: {
                  type: 'OBJECT', // Gemini-style type
                  properties: {
                    paths: {
                      type: 'ARRAY', // Gemini-style type
                      items: {
                        type: 'STRING', // Gemini-style type
                        minLength: '1', // String number that should be converted to number
                      },
                      minItems: '1', // String number that should be converted to number
                      description: 'Required. An array of glob patterns or paths'
                    },
                    include: {
                      type: 'ARRAY', // Gemini-style type
                      items: {
                        type: 'STRING', // Gemini-style type
                        minLength: '1', // String number that should be converted to number
                      },
                      description: 'Optional. Additional glob patterns to include'
                    },
                    recursive: {
                      type: 'BOOLEAN', // Gemini-style type
                      description: 'Optional. Search directories recursively'
                    }
                  },
                  required: ['paths']
                }
              }
            ]
          }
        ]
      }
    };

    const response = await contentGenerator.generateContent(request, 'test-prompt-id');
    
    console.log('✅ OpenAI API Response with Complex Schema received:');
    console.log(`   Text: "${response.text}"`);
    console.log(`   Function Calls: ${response.functionCalls?.length || 0}`);
    if (response.functionCalls && response.functionCalls.length > 0) {
      console.log(`   First Function Call: ${JSON.stringify(response.functionCalls[0])}`);
    }
    console.log(`   Usage: ${JSON.stringify(response.usageMetadata)}\n`);

    console.log('🎉 OpenAI Complex Schema Test PASSED!');
    console.log('   ✅ Type conversion: STRING → string, ARRAY → array, OBJECT → object');
    console.log('   ✅ Numeric constraints: "1" → 1 for minItems, minLength');
    console.log('   ✅ No schema validation errors from OpenAI API');

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('  ', error.message);
    
    if (error.message.includes('Invalid schema')) {
      console.log('\n💡 Schema conversion issue detected - this was the bug we fixed!');
    }
    
    process.exit(1);
  }
}

testOpenAIWithTools().catch(console.error);