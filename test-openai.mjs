#!/usr/bin/env node

/**
 * Simple test script to verify OpenAI integration works
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';
import { Config } from './packages/core/dist/index.js';

async function testOpenAI() {
  console.log('🧪 Testing OpenAI Integration...\n');
  
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
      getModel: () => 'gpt-4o-mini', // Test with a different model
      getProxy: () => undefined,
      getUsageStatisticsEnabled: () => false, // Disable telemetry for testing
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

    // Test a simple generation
    console.log('🤖 Testing content generation...');
    
    const request = {
      model: 'gpt-4o-mini', // Use the same model as config
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Say "Hello from OpenAI integration!" and nothing else.' }]
        }
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 50
      }
    };

    const response = await contentGenerator.generateContent(request, 'test-prompt-id');
    
    console.log('✅ OpenAI API Response received:');
    console.log(`   Text: "${response.text}"`);
    console.log(`   Candidates: ${response.candidates?.length || 0}`);
    console.log(`   Usage: ${JSON.stringify(response.usageMetadata)}\n`);

    console.log('🎉 OpenAI Integration Test PASSED!');
    console.log('   The CLI can now use OpenAI models when OPENAI_API_KEY is set.');

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('  ', error.message);
    
    if (error.message.includes('API key')) {
      console.log('\n💡 Make sure your OPENAI_API_KEY is valid and has sufficient credits.');
    }
    
    process.exit(1);
  }
}

testOpenAI().catch(console.error);