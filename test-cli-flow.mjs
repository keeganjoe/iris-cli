#!/usr/bin/env node

/**
 * Test CLI flow to reproduce the specific error seen in nextSpeakerChecker
 */

import { 
  createContentGenerator, 
  createContentGeneratorConfig,
  AuthType,
  GeminiClient
} from './packages/core/dist/index.js';

async function testCliFlowWithNextSpeaker() {
  console.log('🧪 Testing CLI Flow with nextSpeakerChecker...\\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not found!');
    process.exit(1);
  }

  try {
    // Create a mock config that matches what the CLI would use
    const mockConfig = {
      getModel: () => 'gpt-4o-mini',
      getEmbeddingModel: () => 'text-embedding-ada-002',
      getProxy: () => undefined,
      getUsageStatisticsEnabled: () => false,
      getDebugMode: () => false,
      getSessionId: () => 'test-session-id',
      getToolRegistry: async () => ({
        getFunctionDeclarations: () => [
          {
            name: 'write_file',
            description: 'Write content to a file',
            parameters: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'File content' }
              },
              required: ['file_path', 'content']
            }
          }
        ]
      }),
      getUserMemory: () => undefined,
      getContentGeneratorConfig: () => ({
        authType: AuthType.USE_OPENAI,
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY
      }),
      getMaxSessionTurns: () => 100,
      getQuotaErrorOccurred: () => false,
      setQuotaErrorOccurred: () => {},
      setModel: () => {},
      setFallbackMode: () => {},
      flashFallbackHandler: null
    };

    // Create a GeminiClient (which handles both Gemini and OpenAI)
    const contentGeneratorConfig = createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_OPENAI
    );

    const geminiClient = new GeminiClient(mockConfig);
    await geminiClient.initialize(contentGeneratorConfig);

    console.log('✅ Created GeminiClient with OpenAI backend\\n');

    // Simulate a conversation that would trigger the nextSpeakerChecker error
    // 1. Add initial conversation to history
    geminiClient.addHistory({
      role: 'user',
      parts: [{ text: 'Create a file called test.txt' }]
    });

    // 2. Add a model response with a tool call (but no response yet)
    geminiClient.addHistory({
      role: 'model', 
      parts: [{
        functionCall: {
          name: 'write_file',
          args: { file_path: 'test.txt', content: 'Hello World' },
          id: 'call_test123'  // This tool call has no response
        }
      }]
    });

    console.log('🔧 Added conversation history with pending tool call');
    console.log('   History length:', geminiClient.getHistory().length);

    // 3. Now try to call generateJson like nextSpeakerChecker does
    // This should trigger the same error the user saw
    console.log('🔧 Calling generateJson (like nextSpeakerChecker does)...');
    
    const responseSchema = {
      type: 'OBJECT',
      properties: {
        next_speaker: { type: 'STRING', enum: ['user', 'model'] },
        reasoning: { type: 'STRING' }
      },
      required: ['next_speaker', 'reasoning']
    };

    const checkContents = [
      ...geminiClient.getHistory(/* curated */ true),
      { role: 'user', parts: [{ text: 'Who should speak next?' }] }
    ];

    console.log('   Contents being sent to generateJson:');
    checkContents.forEach((content, i) => {
      const roleLabel = content.role === 'user' ? '👤 User' : '🤖 Model';
      const partInfo = content.parts?.[0];
      if (partInfo && 'text' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: "${partInfo.text}"`);
      } else if (partInfo && 'functionCall' in partInfo) {
        console.log(`   ${i+1}. ${roleLabel}: Tool call ${partInfo.functionCall.name} (ID: ${partInfo.functionCall.id})`);
      }
    });

    const abortController = new AbortController();
    const result = await geminiClient.generateJson(
      checkContents,
      responseSchema,
      abortController.signal
    );

    console.log('✅ generateJson call SUCCEEDED!');
    console.log(`   Result: ${JSON.stringify(result)}`);
    console.log('   ✅ Auto-fix handled the pending tool call correctly');

  } catch (error) {
    console.error('❌ Test FAILED with error:');
    console.error('  ', error.message);
    
    if (error.message.includes('tool_call_id')) {
      console.log('\\n💡 REPRODUCED the tool_call_id error!');
      console.log('   This error occurs when generateJson gets conversation history');
      console.log('   that contains assistant messages with tool_calls but no responses.');
      console.log('\\n🔧 The fix needs to be applied in the generateJson code path.');
    }
    
    process.exit(1);
  }
}

testCliFlowWithNextSpeaker().catch(console.error);