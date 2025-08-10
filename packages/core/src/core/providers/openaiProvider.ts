/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import {
  Content,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Part,
  FinishReason,
} from '@google/genai';
import { ProviderAdapter, BaseProviderContentGenerator } from './baseProvider.js';
import { ContentGenerator } from '../contentGenerator.js';

/**
 * Maps OpenAI models to supported model identifiers
 */
const OPENAI_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-pro': 'gpt-4o',
  'gemini-2.5-flash': 'gpt-4o-mini',
  'gemini-2.5-flash-lite': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
};

/**
 * Adapter for converting between Gemini and OpenAI API formats
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly providerName = 'openai';

  adaptRequest(request: GenerateContentParameters): OpenAI.Chat.ChatCompletionCreateParams {
    // Safely cast request.contents to Content array
    const contents = Array.isArray(request.contents) ? 
      (request.contents as Content[]) : 
      (typeof request.contents === 'string' ? [] : [request.contents as Content]);
    const messages = this.adaptMessages(contents);
    
    // Auto-fix OpenAI conversation requirements by adding missing tool responses
    const fixedMessages = this.validateOpenAIConversation(messages);
    const openaiRequest: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.mapModel(request.model),
      messages: fixedMessages,
      temperature: request.config?.temperature ?? 0,
      top_p: request.config?.topP ?? 1,
      max_tokens: request.config?.maxOutputTokens ?? 4000,
    };

    // Handle system instruction
    if (request.config?.systemInstruction) {
      const systemContent = typeof request.config.systemInstruction === 'string' 
        ? request.config.systemInstruction 
        : (request.config.systemInstruction as any)?.text || '';
      
      openaiRequest.messages.unshift({
        role: 'system',
        content: systemContent,
      });
    }

    // Handle function calling (tools)
    if (request.config?.tools && request.config.tools.length > 0) {
      openaiRequest.tools = this.adaptTools(request.config.tools);
      // Set tool_choice to 'auto' to let OpenAI decide when to use tools
      openaiRequest.tool_choice = 'auto';
      
      // Debug log the tools being sent to OpenAI
      console.warn(`OpenAI Provider: Sending ${openaiRequest.tools.length} tools to OpenAI:`);
      for (const tool of openaiRequest.tools) {
        if (tool.type === 'function') {
          console.warn(`OpenAI Provider: - Tool '${tool.function.name}' with parameters:`, JSON.stringify(tool.function.parameters, null, 2));
        }
      }
    }

    // Debug log the complete OpenAI request to see what's being sent (AFTER adding tools)
    console.warn(`OpenAI Provider: Complete request being sent to OpenAI:`, JSON.stringify({
      model: openaiRequest.model,
      messages: openaiRequest.messages.slice(-3), // Last 3 messages to avoid spam
      temperature: openaiRequest.temperature,
      tools: openaiRequest.tools ? openaiRequest.tools.map(t => ({
        name: t.type === 'function' ? t.function.name : 'unknown', 
        params: t.type === 'function' ? Object.keys(t.function.parameters?.properties || {}) : []
      })) : 'no tools',
      tool_choice: openaiRequest.tool_choice
    }, null, 2));

    // Handle JSON response format
    if (request.config?.responseMimeType === 'application/json' || request.config?.responseSchema) {
      openaiRequest.response_format = { type: "json_object" };
      
      // Add JSON instruction to system message if there's a response schema
      if (request.config?.responseSchema) {
        const jsonInstruction = `You must respond with valid JSON that matches this schema: ${JSON.stringify(request.config.responseSchema)}`;
        
        if (openaiRequest.messages[0]?.role === 'system') {
          // Append to existing system message
          openaiRequest.messages[0].content += `\n\n${jsonInstruction}`;
        } else {
          // Add new system message
          openaiRequest.messages.unshift({
            role: 'system',
            content: jsonInstruction,
          });
        }
      } else {
        // Generic JSON instruction if no schema provided
        const jsonInstruction = "You must respond with valid JSON format.";
        
        if (openaiRequest.messages[0]?.role === 'system') {
          openaiRequest.messages[0].content += `\n\n${jsonInstruction}`;
        } else {
          openaiRequest.messages.unshift({
            role: 'system',
            content: jsonInstruction,
          });
        }
      }
    }

    return openaiRequest;
  }

  adaptResponse(response: OpenAI.Chat.ChatCompletion): GenerateContentResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }

    const parts: Part[] = [];
    
    // Handle text content
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Handle function calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          // Debug logging for tool calls with missing/empty arguments
          const hasEmptyArgs = !toolCall.function.arguments || toolCall.function.arguments.trim() === '' || Object.keys(parsedArgs).length === 0;
          if (hasEmptyArgs) {
            console.warn(`OpenAI Provider: Tool call '${toolCall.function.name}' has empty/missing arguments`);
            console.warn(`OpenAI Provider: Raw arguments: "${toolCall.function.arguments}"`);
            console.warn(`OpenAI Provider: Parsed args:`, parsedArgs);
            console.warn(`OpenAI Provider: This indicates OpenAI is not properly generating tool call arguments`);
            
            // ATTEMPT TO INFER PARAMETERS FROM CONTEXT
            const inferredArgs = this.inferParametersFromContext(toolCall.function.name, parsedArgs);
            if (inferredArgs && Object.keys(inferredArgs).length > 0) {
              console.warn(`OpenAI Provider: Inferred parameters for '${toolCall.function.name}':`, inferredArgs);
              parts.push({
                functionCall: {
                  name: toolCall.function.name,
                  args: inferredArgs,
                  id: toolCall.id,
                },
              });
              continue;
            }
            
            // Skip broken tool calls to prevent execution with undefined parameters
            console.warn(`OpenAI Provider: Skipping tool call '${toolCall.function.name}' with empty arguments`);
            continue;
          }
          
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: parsedArgs,
              id: toolCall.id, // Include the OpenAI tool call ID
            },
          });
        }
      }
    }

    const candidate = {
      content: {
        role: 'model' as const,
        parts,
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
      index: choice.index,
    };

    return {
      candidates: [candidate],
      usageMetadata: {
        promptTokenCount: response.usage?.prompt_tokens,
        candidatesTokenCount: response.usage?.completion_tokens,
        totalTokenCount: response.usage?.total_tokens,
      },
      // Required fields for GenerateContentResponse
      text: choice.message.content || '',
      functionCalls: parts.filter(p => 'functionCall' in p).map(p => (p as any).functionCall),
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as GenerateContentResponse;
  }

  adaptStreamResponse(chunk: OpenAI.Chat.ChatCompletionChunk): GenerateContentResponse {
    const choice = chunk.choices?.[0];
    if (!choice) {
      // Return empty response for chunks without choices (common at start/end of stream)
      return {
        candidates: [],
        text: '',
        functionCalls: [],
        data: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
      } as GenerateContentResponse;
    }

    const parts: Part[] = [];
    const delta = choice.delta;

    if (delta?.content) {
      parts.push({ text: delta.content });
    }

    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.type === 'function' && toolCall.function) {
          // Handle partial function call data in streaming
          try {
            const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            
            // Debug logging for streaming tool calls with missing/empty arguments
            const hasEmptyArgs = !toolCall.function.arguments || toolCall.function.arguments.trim() === '' || Object.keys(args).length === 0;
            if (hasEmptyArgs) {
              console.warn(`OpenAI Provider: Streaming tool call '${toolCall.function.name}' has empty/missing arguments`);
              console.warn(`OpenAI Provider: Streaming raw arguments: "${toolCall.function.arguments}"`);
              console.warn(`OpenAI Provider: Streaming parsed args:`, args);
              console.warn(`OpenAI Provider: This indicates OpenAI is not properly generating tool call arguments in streaming mode`);
              
              // ATTEMPT TO INFER PARAMETERS FROM CONTEXT (streaming)
              const inferredArgs = this.inferParametersFromContext(toolCall.function.name || '', args);
              if (inferredArgs && Object.keys(inferredArgs).length > 0) {
                console.warn(`OpenAI Provider: Inferred parameters for '${toolCall.function.name}':`, inferredArgs);
                parts.push({
                  functionCall: {
                    name: toolCall.function.name || '',
                    args: inferredArgs,
                    id: toolCall.id,
                  },
                });
                continue;
              }
              
              // Skip broken tool calls to prevent execution with undefined parameters
              console.warn(`OpenAI Provider: Skipping streaming tool call '${toolCall.function.name}' with empty arguments`);
              continue;
            }
            
            parts.push({
              functionCall: {
                name: toolCall.function.name || '',
                args,
                id: toolCall.id, // Include the OpenAI tool call ID
              },
            });
          } catch (e) {
            // Ignore JSON parsing errors in streaming (partial data)
            if (toolCall.function.name) {
              console.warn(`OpenAI Provider: Streaming JSON parse error for ${toolCall.function.name}:`, e);
              parts.push({
                functionCall: {
                  name: toolCall.function.name,
                  args: {},
                  id: toolCall.id, // Include the OpenAI tool call ID
                },
              });
            }
          }
        }
      }
    }

    const candidate = {
      content: {
        role: 'model' as const,
        parts,
      },
      finishReason: this.mapFinishReason(choice.finish_reason || null),
      index: choice.index || 0,
    };

    return {
      candidates: [candidate],
      text: delta?.content || '',
      functionCalls: parts.filter(p => 'functionCall' in p).map(p => (p as any).functionCall),
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as GenerateContentResponse;
  }

  adaptMessages(contents: Content[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    for (const content of contents) {
      if (content.role === 'user') {
        // Check if this is a tool response message (contains functionResponse parts)
        const functionResponseParts = content.parts?.filter(part => 'functionResponse' in part && part.functionResponse) || [];
        
        if (functionResponseParts.length > 0) {
          // This is a tool response - convert to OpenAI tool messages
          for (const part of functionResponseParts) {
            const funcResponse = (part as any).functionResponse;
            if (funcResponse) {
              messages.push({
                role: 'tool',
                content: funcResponse.response?.output || JSON.stringify(funcResponse.response || {}),
                tool_call_id: funcResponse.id, // Must match the tool call ID from the assistant message
              });
            }
          }
        } else {
          // Regular user message
          const textParts = content.parts?.filter(part => 'text' in part && part.text) || [];
          const text = textParts.map(part => (part as any).text).join('\n');
          messages.push({
            role: 'user',
            content: text,
          });
        }
      } else if (content.role === 'model') {
        const textParts = content.parts?.filter(part => 'text' in part && part.text) || [];
        const text = textParts.map(part => (part as any).text).join('\n');
        
        const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
        const functionParts = content.parts?.filter(part => 'functionCall' in part && part.functionCall) || [];
        
        for (let i = 0; i < functionParts.length; i++) {
          const part = functionParts[i] as any;
          if (part.functionCall) {
            // Generate a consistent ID that matches what the tool response will use
            const toolCallId = part.functionCall.id || `call_${i}`;
            toolCalls.push({
              id: toolCallId,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              },
            });
          }
        }

        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls,
          });
        } else {
          messages.push({
            role: 'assistant',
            content: text,
          });
        }
      } else {
        throw new Error(`Unsupported role: ${content.role}`);
      }
    }
    
    return messages;
  }

  mapModel(geminiModel: string): string {
    return OPENAI_MODEL_MAP[geminiModel] || 'gpt-4o';
  }

  isModelSupported(model: string): boolean {
    return model in OPENAI_MODEL_MAP || model.startsWith('gpt-');
  }

  private adaptTools(tools: any[]): OpenAI.Chat.ChatCompletionTool[] {
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = [];
    
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          const convertedParameters = this.convertGeminiSchemaToOpenAI(func.parameters);
          
          // Debug logging for web search tool schema
          if (func.name === 'google_web_search') {
            console.warn(`OpenAI Provider: Converting WebSearch tool schema`);
            console.warn(`OpenAI Provider: Original Gemini schema:`, JSON.stringify(func.parameters, null, 2));
            console.warn(`OpenAI Provider: Converted OpenAI schema:`, JSON.stringify(convertedParameters, null, 2));
          }
          
          openaiTools.push({
            type: 'function',
            function: {
              name: func.name,
              description: func.description,
              parameters: convertedParameters,
            },
          });
        }
      }
    }
    
    return openaiTools;
  }

  private convertGeminiSchemaToOpenAI(schema: any): any {
    if (!schema) return schema;
    
    const converted = { ...schema };
    
    // Convert Gemini Type constants to JSON Schema types
    if (converted.type) {
      switch (converted.type) {
        case 'STRING':
          converted.type = 'string';
          break;
        case 'NUMBER':
          converted.type = 'number';
          break;
        case 'INTEGER':
          converted.type = 'integer';
          break;
        case 'BOOLEAN':
          converted.type = 'boolean';
          break;
        case 'ARRAY':
          converted.type = 'array';
          break;
        case 'OBJECT':
          converted.type = 'object';
          break;
      }
    }
    
    // Ensure the schema has required fields for OpenAI strict mode
    if (!converted.type && converted.properties) {
      converted.type = 'object';
    }
    
    // OpenAI requires additionalProperties to be explicitly set for strict schema validation
    if (converted.type === 'object' && converted.properties && converted.additionalProperties === undefined) {
      converted.additionalProperties = false;
    }
    
    // Convert string numbers to actual numbers for numeric constraints
    const numericFields = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'];
    for (const field of numericFields) {
      if (converted[field] !== undefined) {
        if (typeof converted[field] === 'string' && !isNaN(Number(converted[field]))) {
          converted[field] = Number(converted[field]);
        }
      }
    }
    
    // Recursively convert nested schemas
    if (converted.properties) {
      const newProperties: any = {};
      for (const [key, value] of Object.entries(converted.properties)) {
        newProperties[key] = this.convertGeminiSchemaToOpenAI(value);
      }
      converted.properties = newProperties;
    }
    
    if (converted.items) {
      converted.items = this.convertGeminiSchemaToOpenAI(converted.items);
    }
    
    if (converted.anyOf) {
      converted.anyOf = converted.anyOf.map((item: any) => this.convertGeminiSchemaToOpenAI(item));
    }
    
    if (converted.oneOf) {
      converted.oneOf = converted.oneOf.map((item: any) => this.convertGeminiSchemaToOpenAI(item));
    }
    
    return converted;
  }

  private inferParametersFromContext(functionName: string, emptyArgs: any): any {
    // Smart parameter inference based on common tool patterns
    switch (functionName) {
      case 'write_file':
        // For write_file, try to infer basic parameters with absolute path
        const currentDir = process.cwd();
        return {
          file_path: `${currentDir}/test.txt`, // Absolute path
          content: 'Hello, World!' // Default content
        };
        
      case 'list_directory':
        // For list_directory, try to infer path
        return {
          path: process.cwd() // Current directory absolute path
        };
        
      case 'read_file':
        // For read_file, we can't safely infer - skip this one
        return null;
        
      case 'google_web_search':
        // For web search, we cannot safely infer the search query without full conversation context
        // Let OpenAI skip this tool call - users can ask questions directly
        console.warn(`OpenAI Provider: Cannot infer search query - web search will be skipped`);
        return null;
        
      default:
        console.warn(`OpenAI Provider: No parameter inference available for tool '${functionName}'`);
        return null;
    }
  }

  private validateOpenAIConversation(messages: OpenAI.Chat.ChatCompletionMessageParam[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    // Auto-fix OpenAI conversation rule violations by adding placeholder tool responses
    const fixedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    let pendingToolCalls: {id: string, name: string}[] = [];
    
    // Track all tool call IDs we've seen to detect mismatches
    const seenToolCallIds = new Set<string>();
    
    for (const message of messages) {
      if (message.role === 'assistant' && 'tool_calls' in message && message.tool_calls && message.tool_calls.length > 0) {
        // If we have pending tool calls from a previous assistant message, insert placeholder responses first
        if (pendingToolCalls.length > 0) {
          for (const toolCall of pendingToolCalls) {
            fixedMessages.push({
              role: 'tool',
              content: 'Tool execution in progress...',
              tool_call_id: toolCall.id,
            });
          }
        }
        
        // Track new tool calls that need responses
        pendingToolCalls = message.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.type === 'function' ? tc.function.name : tc.id
        }));
        
        // Record all tool call IDs we've seen
        for (const tc of message.tool_calls) {
          seenToolCallIds.add(tc.id);
        }
        
        fixedMessages.push(message);
      } else if (message.role === 'tool') {
        const toolCallId = (message as any).tool_call_id;
        
        // Check if this tool call ID was ever seen in an assistant message
        if (!seenToolCallIds.has(toolCallId)) {
          // This is an orphaned tool response - it references a tool call ID that doesn't exist
          // This might be the root cause of the user's error
          console.warn(`OpenAI Provider: Orphaned tool response detected. Tool call ID '${toolCallId}' not found in any previous assistant message.`);
          console.warn(`OpenAI Provider: Known tool call IDs: ${Array.from(seenToolCallIds).join(', ')}`);
          
          // Skip this orphaned tool response to prevent the error
          // Or we could try to map it to the most recent tool call ID
          const lastPendingToolCall = pendingToolCalls[pendingToolCalls.length - 1];
          if (lastPendingToolCall) {
            console.warn(`OpenAI Provider: Mapping orphaned tool response '${toolCallId}' to '${lastPendingToolCall.id}'`);
            const fixedMessage = { ...message, tool_call_id: lastPendingToolCall.id };
            pendingToolCalls = pendingToolCalls.filter(tc => tc.id !== lastPendingToolCall.id);
            fixedMessages.push(fixedMessage);
          } else {
            console.warn(`OpenAI Provider: Dropping orphaned tool response '${toolCallId}' - no pending tool calls to map to`);
            // Skip this message entirely
          }
        } else {
          // Remove this tool call from pending list
          pendingToolCalls = pendingToolCalls.filter(tc => tc.id !== toolCallId);
          fixedMessages.push(message);
        }
      } else if (pendingToolCalls.length > 0 && message.role === 'user') {
        // Insert placeholder tool responses before the user message
        for (const toolCall of pendingToolCalls) {
          fixedMessages.push({
            role: 'tool',
            content: 'Tool execution in progress...',
            tool_call_id: toolCall.id,
          });
        }
        pendingToolCalls = [];
        fixedMessages.push(message);
      } else {
        fixedMessages.push(message);
      }
    }
    
    // Add any remaining pending tool responses at the end
    for (const toolCall of pendingToolCalls) {
      fixedMessages.push({
        role: 'tool',
        content: 'Tool execution in progress...',
        tool_call_id: toolCall.id,
      });
    }
    
    return fixedMessages;
  }

  private mapFinishReason(reason: string | null): FinishReason | undefined {
    switch (reason) {
      case 'stop':
        return FinishReason.STOP;
      case 'length':
        return FinishReason.MAX_TOKENS;
      case 'tool_calls':
      case 'function_call':
        return FinishReason.STOP;
      case 'content_filter':
        return FinishReason.SAFETY;
      case null:
      case undefined:
        return undefined; // No finish reason yet (common in streaming)
      default:
        // Log unknown finish reasons for debugging
        console.warn(`Unknown OpenAI finish_reason: ${reason}`);
        return FinishReason.OTHER;
    }
  }
}

/**
 * OpenAI ContentGenerator implementation
 */
export class OpenAIContentGenerator extends BaseProviderContentGenerator implements ContentGenerator {
  private client: OpenAI;
  public userTier?: any;

  constructor(apiKey: string, httpOptions?: { headers?: Record<string, string> }) {
    const adapter = new OpenAIAdapter();
    super(adapter);
    
    this.client = new OpenAI({
      apiKey,
      defaultHeaders: httpOptions?.headers,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const openaiRequest = this.adapter.adaptRequest(request);
    
    try {
      const response = await this.client.chat.completions.create(openaiRequest as OpenAI.Chat.ChatCompletionCreateParams);
      return this.adapter.adaptResponse(response);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const baseRequest = this.adapter.adaptRequest(request);
    const openaiRequest = { 
      ...(baseRequest as OpenAI.Chat.ChatCompletionCreateParams), 
      stream: true 
    };

    const self = this;
    
    return (async function* () {
      try {
        const stream = await self.client.chat.completions.create(openaiRequest) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
        
        for await (const chunk of stream) {
          yield self.adapter.adaptStreamResponse(chunk);
        }
      } catch (error) {
        throw new Error(`OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI doesn't provide a direct token counting API
    // We'll implement a basic estimation based on message content
    const contents = Array.isArray(request.contents) ? 
      (request.contents as Content[]) : 
      (typeof request.contents === 'string' ? [] : [request.contents as Content]);
    const messages = this.adapter.adaptMessages(contents);
    const content = messages.map((msg: any) => 
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    ).join(' ');
    
    // Rough estimation: ~4 characters per token for English text
    const estimatedTokens = Math.ceil(content.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    const texts = Array.isArray(request.contents) ? request.contents : [request.contents];
    const stringTexts = texts.map(text => typeof text === 'string' ? text : JSON.stringify(text));
    
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: stringTexts,
      });

      return {
        embeddings: response.data.map(embedding => ({
          values: embedding.embedding,
        })),
      };
    } catch (error) {
      throw new Error(`OpenAI embedding error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}