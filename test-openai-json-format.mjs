#!/usr/bin/env node

/**
 * Test OpenAI JSON format handling specifically 
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testOpenAIJsonFormat() {
  console.log('🧪 Testing OpenAI JSON Format...\\n');
  
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

    // Test 1: Simple JSON format request
    console.log('🔧 Test 1: Request JSON response with schema...');
    
    const jsonRequest = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Analyze this conversation and tell me who should speak next: user or model?' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        responseSchema: {
          type: 'object',
          properties: {
            next_speaker: {
              type: 'string',
              enum: ['user', 'model'],
              description: 'Who should speak next'
            },
            reasoning: {
              type: 'string',
              description: 'Brief explanation of the decision'
            }
          },
          required: ['next_speaker', 'reasoning']
        },
        responseMimeType: 'application/json'
      }
    };

    const result1 = await contentGenerator.generateContent(jsonRequest, 'test-json-1');
    
    console.log('✅ Test 1 Response received:');
    console.log(`   Raw text: "${result1.text}"`);
    
    // Try to parse as JSON to verify format
    try {
      const parsedJson = JSON.parse(result1.text);
      console.log(`   Parsed JSON: ${JSON.stringify(parsedJson)}`);
      console.log('   ✅ Valid JSON format received');
      
      if (parsedJson.next_speaker && parsedJson.reasoning) {
        console.log('   ✅ Schema validation passed');
      } else {
        console.log('   ❌ Schema validation failed - missing required fields');
      }
    } catch (parseError) {
      console.log('   ❌ JSON parsing failed:', parseError.message);
      console.log('   This indicates OpenAI returned plain text instead of JSON');
    }

    // Test 2: JSON format without explicit schema  
    console.log('\\n🔧 Test 2: Request JSON without explicit schema...');
    
    const jsonRequest2 = {
      model: 'gpt-4o-mini',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Give me a simple greeting in JSON format with a "message" field.' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 100,
        responseMimeType: 'application/json'
      }
    };

    const result2 = await contentGenerator.generateContent(jsonRequest2, 'test-json-2');
    
    console.log('✅ Test 2 Response received:');
    console.log(`   Raw text: "${result2.text}"`);
    
    try {
      const parsedJson2 = JSON.parse(result2.text);
      console.log(`   Parsed JSON: ${JSON.stringify(parsedJson2)}`);
      console.log('   ✅ Valid JSON format received (no schema)');
    } catch (parseError) {
      console.log('   ❌ JSON parsing failed:', parseError.message);
    }

    console.log('\\n🎉 OpenAI JSON Format Test COMPLETED!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('parse')) {
      console.log('\\n💡 JSON parsing issue detected!');
      console.log('   The OpenAI adapter may not be properly requesting JSON format.');
    }
    
    process.exit(1);
  }
}

testOpenAIJsonFormat().catch(console.error);