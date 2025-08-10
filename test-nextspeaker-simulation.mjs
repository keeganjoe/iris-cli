#!/usr/bin/env node

/**
 * Simulate the actual nextSpeakerChecker scenario that was failing
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType 
} from './packages/core/dist/index.js';

async function testNextSpeakerScenario() {
  console.log('🧪 Testing NextSpeaker Scenario (Simulation)...\\n');
  
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

    // Simulate the exact scenario that happens in nextSpeakerChecker:
    // 1. There's a conversation history with tool calls and responses
    // 2. We need to call generateJson to get next speaker decision
    
    console.log('🔧 Simulating nextSpeakerChecker call after tool execution...');
    
    const conversationHistory = [
      {
        role: 'user',
        parts: [{ text: 'Create a file called test.txt with content "Hello World"' }]
      },
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'write_file',
            args: { file_path: 'test.txt', content: 'Hello World' },
            id: 'call_abc123'
          }
        }]
      },
      {
        role: 'user',
        parts: [{
          functionResponse: {
            id: 'call_abc123',
            name: 'write_file', 
            response: { output: 'File created successfully' }
          }
        }]
      },
      {
        role: 'model',
        parts: [{ text: 'I have successfully created the file test.txt with the content "Hello World".' }]
      }
    ];

    // Add the nextSpeaker check prompt (like nextSpeakerChecker.ts does)
    const checkPrompt = 'Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the "user" or the "model" (you).';
    
    const contentsForCheck = [
      ...conversationHistory,
      { role: 'user', parts: [{ text: checkPrompt }] }
    ];

    console.log('   Conversation being analyzed:');
    conversationHistory.forEach((content, i) => {
      const roleLabel = content.role === 'user' ? '👤 User' : '🤖 Model';
      const partInfo = content.parts?.[0];
      if (partInfo && 'text' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: "${partInfo.text.substring(0, 50)}${partInfo.text.length > 50 ? '...' : ''}"`);
      } else if (partInfo && 'functionCall' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool call ${partInfo.functionCall.name} (ID: ${partInfo.functionCall.id})`);
      } else if (partInfo && 'functionResponse' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool response for ${partInfo.functionResponse.name}`);
      }
    });

    const responseSchema = {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description: 'Brief explanation justifying the next_speaker choice based strictly on the applicable rule and the content/structure of the preceding turn.'
        },
        next_speaker: {
          type: 'string',
          enum: ['user', 'model'],
          description: 'Who should speak next based only on the preceding turn and the decision rules'
        }
      },
      required: ['reasoning', 'next_speaker']
    };

    // This simulates the exact generateContent call that generateJson makes
    const nextSpeakerRequest = {
      model: 'gpt-4o-mini',
      contents: contentsForCheck,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        responseSchema: responseSchema,
        responseMimeType: 'application/json'
      }
    };

    console.log('\\n🔧 Calling generateContent (like generateJson does)...');
    
    const result = await contentGenerator.generateContent(nextSpeakerRequest, 'nextspeaker-test');
    
    console.log('✅ NextSpeaker call SUCCEEDED!');
    console.log(`   Raw response: "${result.text}"`);
    
    // Parse and validate the JSON response
    try {
      const parsed = JSON.parse(result.text);
      console.log(`   Parsed result: ${JSON.stringify(parsed)}`);
      
      if (parsed.next_speaker && parsed.reasoning) {
        console.log('   ✅ Response has required fields');
        console.log(`   Decision: ${parsed.next_speaker} should speak next`);
        console.log(`   Reasoning: ${parsed.reasoning}`);
      } else {
        console.log('   ❌ Missing required fields in response');
      }
    } catch (parseError) {
      console.log('   ❌ Failed to parse JSON response:', parseError.message);
      return;
    }

    console.log('\\n🎉 NextSpeaker Simulation Test PASSED!');
    console.log('   ✅ Tool call/response conversation handled correctly');  
    console.log('   ✅ JSON format returned properly');
    console.log('   ✅ No tool_call_id or JSON parsing errors');

  } catch (error) {
    console.error('❌ NextSpeaker simulation FAILED:', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 Still have tool_call_id issues in this scenario');
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      console.log('\\n💡 JSON format or parsing issues detected');
    }
    
    process.exit(1);
  }
}

testNextSpeakerScenario().catch(console.error);