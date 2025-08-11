/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  Tool,
  FunctionCall,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { DEFAULT_OPENAI_EMBEDDING_MODEL } from '../config/models.js';

/**
 * OpenAI provider that implements the ContentGenerator interface
 * Maps OpenAI API calls to Gemini-compatible interface
 */
export class OpenAIProvider implements ContentGenerator {
  private client: OpenAI;
  private model: string;
  private toolCallIdMap: Map<string, string> = new Map(); // functionName -> toolCallId

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.model = model;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    try {
      const contents = this.normalizeContents(request.contents);
      const openaiMessages = this.convertToOpenAIMessages(contents);
      const tools = this.convertToOpenAITools(request.config?.tools || []);
      
      // Check if this is a JSON generation request
      const isJsonRequest = request.config?.responseMimeType === 'application/json' || 
                           request.config?.responseSchema;

      // Build the request parameters
      const requestParams: any = {
        model: this.model,
        messages: openaiMessages,
        temperature: 0.1, // Default conservative temperature
        max_tokens: 4096, // Default max tokens
      };

      // Add tools if present and not a JSON request (avoid conflicts)
      if (tools.length > 0 && !isJsonRequest) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }

      // Handle JSON generation requests
      if (isJsonRequest) {
        if (request.config?.responseSchema) {
          // Use OpenAI's structured outputs with the schema
          requestParams.response_format = {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              strict: true,
              schema: this.convertGeminiSchemaToOpenAI(request.config.responseSchema)
            }
          };
        } else {
          // Fallback to basic JSON mode
          requestParams.response_format = { type: 'json_object' };
          // Add instruction to return JSON
          const lastMessage = requestParams.messages[requestParams.messages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.content += '\n\nPlease respond with valid JSON only.';
          }
        }
      }

      const response = await this.client.chat.completions.create(requestParams);

      return this.convertToGeminiResponse(response);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contents = this.normalizeContents(request.contents);
    const openaiMessages = this.convertToOpenAIMessages(contents);
    const tools = this.convertToOpenAITools(request.config?.tools || []);
    
    // Check if this is a JSON generation request
    const isJsonRequest = request.config?.responseMimeType === 'application/json' || 
                         request.config?.responseSchema;

    // Build the request parameters
    const requestParams: any = {
      model: this.model,
      messages: openaiMessages,
      temperature: 0.1,
      max_tokens: 4096,
      stream: true,
    };

    // Add tools if present and not a JSON request (avoid conflicts)
    if (tools.length > 0 && !isJsonRequest) {
      requestParams.tools = tools;
      requestParams.tool_choice = 'auto';
    }

    // Handle JSON generation requests
    if (isJsonRequest) {
      if (request.config?.responseSchema) {
        // Use OpenAI's structured outputs with the schema
        requestParams.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: this.convertGeminiSchemaToOpenAI(request.config.responseSchema)
          }
        };
      } else {
        // Fallback to basic JSON mode
        requestParams.response_format = { type: 'json_object' };
        // Add instruction to return JSON
        const lastMessage = requestParams.messages[requestParams.messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          lastMessage.content += '\n\nPlease respond with valid JSON only.';
        }
      }
    }

    const stream = await this.client.chat.completions.create(requestParams);

    return this.convertStreamToGeminiFormat(stream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>);
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI doesn't have a direct token counting API like Gemini
    // We'll estimate tokens based on content length
    // In a production implementation, you might use tiktoken library
    const contents = this.normalizeContents(request.contents);
    let estimatedTokens = 0;
    
    for (const content of contents) {
      if (typeof content === 'string') {
        estimatedTokens += Math.ceil(content.length / 4);
      } else if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            // Rough estimation: ~4 characters per token
            estimatedTokens += Math.ceil(part.text.length / 4);
          }
        }
      }
    }

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    const contents = this.normalizeContents(request.contents);
    let text = '';

    for (const content of contents) {
      if (typeof content === 'string') {
        text += content + ' ';
      } else if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            text += part.text + ' ';
          }
        }
      }
    }

    const response = await this.client.embeddings.create({
      model: request.model || DEFAULT_OPENAI_EMBEDDING_MODEL,
      input: text.trim(),
    });

    return {
      embeddings: response.data.map(item => ({
        values: item.embedding,
      })),
    };
  }

  private normalizeContents(contents: any): (Content | string)[] {
    if (!contents) return [];
    if (Array.isArray(contents)) return contents;
    return [contents];
  }

  private convertToOpenAIMessages(contents: (Content | string)[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    for (const content of contents) {
      // Handle string content
      if (typeof content === 'string') {
        messages.push({
          role: 'user',
          content: content,
        });
        continue;
      }

      if (content.role === 'user') {
        const textParts: string[] = [];
        const toolResults: any[] = [];

        if (content.parts) {
          for (const part of content.parts) {
            if ('text' in part && part.text) {
              textParts.push(part.text);
            } else if ('functionResponse' in part && part.functionResponse) {
              // Handle function responses (tool results)
              // Get the tool call ID from our mapping, or use the function name as fallback
              const functionName = part.functionResponse.name || 'unknown';
              const toolCallId = this.toolCallIdMap.get(functionName) || functionName;
              toolResults.push({
                tool_call_id: toolCallId,
                role: 'tool',
                content: JSON.stringify(part.functionResponse.response),
              });
            }
          }
        }

        if (textParts.length > 0) {
          messages.push({
            role: 'user',
            content: textParts.join('\n'),
          });
        }

        // Add tool results as separate messages
        messages.push(...toolResults);

      } else if (content.role === 'model') {
        const textParts: string[] = [];
        const functionCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

        if (content.parts) {
          for (const part of content.parts) {
            if ('text' in part && part.text) {
              textParts.push(part.text);
            } else if ('functionCall' in part && part.functionCall) {
              const toolCallId = `call_${Math.random().toString(36).substr(2, 9)}`;
              const functionName = part.functionCall.name || 'unknown';
              
              // Store the mapping for later use in responses
              this.toolCallIdMap.set(functionName, toolCallId);
              
              functionCalls.push({
                id: toolCallId,
                type: 'function',
                function: {
                  name: functionName,
                  arguments: JSON.stringify(part.functionCall.args || {}),
                },
              });
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: textParts.join('\n') || null,
          tool_calls: functionCalls.length > 0 ? functionCalls : undefined,
        });
      }
    }

    return messages;
  }

  private convertToOpenAITools(tools: any[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.filter(tool => tool && typeof tool === 'object').map(tool => ({
      type: 'function',
      function: {
        name: tool.functionDeclarations?.[0]?.name || 'unknown',
        description: tool.functionDeclarations?.[0]?.description || '',
        parameters: this.convertGeminiSchemaToOpenAI(tool.functionDeclarations?.[0]?.parameters || {}),
      },
    }));
  }

  private convertGeminiSchemaToOpenAI(geminiSchema: any): any {
    if (!geminiSchema || typeof geminiSchema !== 'object') {
      return {};
    }

    const convertType = (type: string): string => {
      switch (type?.toUpperCase()) {
        case 'BOOLEAN': return 'boolean';
        case 'STRING': return 'string'; 
        case 'INTEGER': return 'integer';
        case 'NUMBER': return 'number';
        case 'ARRAY': return 'array';
        case 'OBJECT': return 'object';
        default: return 'string';
      }
    };

    const convertSchema = (schema: any): any => {
      if (!schema || typeof schema !== 'object') {
        return schema;
      }

      const result: any = { ...schema };

      // Convert type field
      if (result.type) {
        result.type = convertType(result.type);
      }

      // For object types, ensure additionalProperties is false for OpenAI strict mode
      if (result.type === 'object') {
        if (result.additionalProperties === undefined) {
          result.additionalProperties = false;
        }
      }

      // Handle properties (for object types)
      if (result.properties && typeof result.properties === 'object') {
        const convertedProperties: any = {};
        for (const [key, value] of Object.entries(result.properties)) {
          convertedProperties[key] = convertSchema(value);
        }
        result.properties = convertedProperties;
      }

      // Handle items (for array types)
      if (result.items) {
        result.items = convertSchema(result.items);
      }

      return result;
    };

    return convertSchema(geminiSchema);
  }

  private convertToGeminiResponse(response: OpenAI.Chat.Completions.ChatCompletion): GenerateContentResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }

    const parts: Part[] = [];

    // Add text content
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Add function calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          // Store the tool call ID mapping for future responses
          this.toolCallIdMap.set(toolCall.function.name, toolCall.id);
          
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}'),
            } as FunctionCall,
          });
        }
      }
    }

    const usage: GenerateContentResponseUsageMetadata = {
      promptTokenCount: response.usage?.prompt_tokens || 0,
      candidatesTokenCount: response.usage?.completion_tokens || 0,
      totalTokenCount: response.usage?.total_tokens || 0,
    };

    return {
      candidates: [
        {
          content: {
            parts,
            role: 'model',
          },
          index: 0,
        },
      ],
      usageMetadata: usage,
      // Add required properties with minimal implementations
      text: parts.find(p => 'text' in p)?.text || '',
      data: null,
      functionCalls: parts.filter(p => 'functionCall' in p).map(p => p.functionCall),
      executableCode: null,
      codeExecutionResult: null,
    } as any;
  }

  private async *convertStreamToGeminiFormat(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  ): AsyncGenerator<GenerateContentResponse> {
    let accumulatedContent = '';
    let accumulatedToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let finished = false;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta.content) {
          accumulatedContent += delta.content;
          
          // Only yield the delta content to prevent repetitive text
          yield {
            candidates: [
              {
                content: {
                  parts: [{ text: delta.content }], // Send only the new delta
                  role: 'model',
                },
                index: 0,
              },
            ],
            text: delta.content, // Send only the new content
            data: null,
            functionCalls: [],
            executableCode: null,
            codeExecutionResult: null,
          } as any;
        }

        // Handle streaming tool calls - they come in chunks
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            if (index !== undefined) {
              const existing = accumulatedToolCalls.get(index) || { id: '', name: '', arguments: '' };
              
              if (toolCallDelta.id) {
                existing.id = toolCallDelta.id;
              }
              
              if (toolCallDelta.function?.name) {
                existing.name = toolCallDelta.function.name;
              }
              
              if (toolCallDelta.function?.arguments) {
                existing.arguments += toolCallDelta.function.arguments;
              }
              
              accumulatedToolCalls.set(index, existing);
            }
          }
        }

        // Check for completion
        if (choice.finish_reason) {
          finished = true;
          
          // If we have complete function calls, yield them
          if (choice.finish_reason === 'tool_calls' && accumulatedToolCalls.size > 0) {
            const parts = [];
            if (accumulatedContent) {
              parts.push({ text: accumulatedContent });
            }

            const functionCallParts = [];
            for (const toolCall of accumulatedToolCalls.values()) {
              if (toolCall.name && toolCall.arguments) {
                // Store the tool call ID mapping for future responses
                this.toolCallIdMap.set(toolCall.name, toolCall.id);
                
                const parsedArgs = this.safeParseJSON(toolCall.arguments);
                functionCallParts.push({
                  functionCall: {
                    name: toolCall.name,
                    args: parsedArgs,
                  },
                });
              }
            }
            
            parts.push(...functionCallParts);

            yield {
              candidates: [
                {
                  content: {
                    parts,
                    role: 'model',
                  },
                  index: 0,
                },
              ],
              text: accumulatedContent,
              data: null,
              functionCalls: functionCallParts.map(fc => fc.functionCall),
              executableCode: null,
              codeExecutionResult: null,
            } as any;
          }
          
          // Exit the loop when we get a finish reason
          break;
        }
      }
    } catch (error) {
      console.error('Error in OpenAI streaming:', error);
      throw error;
    }

    // Final yield only if we haven't already finished and have remaining content
    // This is typically not needed as OpenAI should send finish_reason
    if (!finished && accumulatedContent) {
      yield {
        candidates: [
          {
            content: {
              parts: [{ text: '' }], // Empty since all content was already yielded as deltas
              role: 'model',
            },
            index: 0,
          },
        ],
        text: '',
        data: null,
        functionCalls: [],
        executableCode: null,
        codeExecutionResult: null,
      } as any;
    }
  }

  private safeParseJSON(jsonString: string): any {
    try {
      return JSON.parse(jsonString || '{}');
    } catch (error) {
      console.error('Failed to parse JSON arguments:', jsonString, error);
      return {};
    }
  }
}