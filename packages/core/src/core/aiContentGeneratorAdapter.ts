/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  FunctionCall,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { AIClient, AIStreamEvent } from './aiClient.js';
import { ContentGenerator } from './contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import { z } from 'zod';

/**
 * Adapter that implements the legacy ContentGenerator interface using the modern AIClient.
 * This allows us to replace the old OpenAI/Gemini providers with the unified AI SDK.
 */
export class AIContentGeneratorAdapter implements ContentGenerator {
  private aiClient: AIClient;
  public userTier?: UserTierId;

  constructor(aiClient: AIClient, userTier?: UserTierId) {
    this.aiClient = aiClient;
    this.userTier = userTier;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Check if this is a JSON generation request
    const isJsonRequest = request.config?.responseMimeType === 'application/json' || 
                         request.config?.responseSchema;

    if (isJsonRequest && request.config?.responseSchema) {
      return this.handleJsonGeneration(request, userPromptId);
    }

    const { prompt, system, tools } = this.convertGeminiRequestToAISDK(request);

    const result = await this.aiClient.generateText(prompt, {
      system,
      tools: tools.length > 0,
      temperature: 0.1, // Default conservative temperature
      maxTokens: 4096, // Default max tokens
    });

    return this.convertAISDKResponseToGemini(result, request);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const { prompt, system, tools } = this.convertGeminiRequestToAISDK(request);

    const stream = await this.aiClient.streamText(prompt, {
      system,
      tools: tools.length > 0,
      temperature: 0.1,
      maxTokens: 4096,
    });

    return this.convertAISDKStreamToGemini(stream);
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // AI SDK doesn't have direct token counting, so we estimate
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
    // Note: AI SDK doesn't have direct embedding support yet
    // This would need to be implemented with provider-specific embedding endpoints
    // For now, return empty embeddings
    return {
      embeddings: [{ values: [] }],
    };
  }

  private convertGeminiRequestToAISDK(request: GenerateContentParameters): {
    prompt: string;
    system?: string;
    tools: any[];
  } {
    const contents = this.normalizeContents(request.contents);
    let prompt = '';
    let system = '';
    const tools: any[] = [];

    // Extract system message and user content
    for (const content of contents) {
      if (typeof content === 'string') {
        prompt += content + '\n';
      } else if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            if (content.role === 'user') {
              prompt += part.text + '\n';
            } else if (content.role === 'system') {
              system += part.text + '\n';
            }
          }
        }
      }
    }

    // Extract tools
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        if ('functionDeclarations' in tool && tool.functionDeclarations) {
          tools.push(...tool.functionDeclarations);
        }
      }
    }

    return {
      prompt: prompt.trim(),
      system: system.trim() || undefined,
      tools,
    };
  }

  private convertAISDKResponseToGemini(
    result: {
      text: string;
      toolCalls?: Array<{ name: string; args: any; result: any }>;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    },
    request: GenerateContentParameters
  ): GenerateContentResponse {
    const parts: Part[] = [];

    // Add text content
    if (result.text) {
      parts.push({ text: result.text });
    }

    // Add function calls
    if (result.toolCalls) {
      for (const toolCall of result.toolCalls) {
        parts.push({
          functionCall: {
            name: toolCall.name,
            args: toolCall.args,
          } as FunctionCall,
        });
      }
    }

    const usage: GenerateContentResponseUsageMetadata = {
      promptTokenCount: result.usage?.promptTokens || 0,
      candidatesTokenCount: result.usage?.completionTokens || 0,
      totalTokenCount: result.usage?.totalTokens || 0,
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
      text: result.text,
      data: null,
      functionCalls: parts.filter(p => 'functionCall' in p).map(p => p.functionCall),
      executableCode: null,
      codeExecutionResult: null,
    } as any;
  }

  private async *convertAISDKStreamToGemini(
    stream: AsyncIterable<AIStreamEvent>
  ): AsyncGenerator<GenerateContentResponse> {
    let accumulatedText = '';
    const accumulatedToolCalls: Array<{ name: string; args: any }> = [];

    for await (const event of stream) {
      switch (event.type) {
        case 'text':
          if (event.content) {
            accumulatedText += event.content;
            
            // Yield incremental text response
            yield {
              candidates: [
                {
                  content: {
                    parts: [{ text: event.content }],
                    role: 'model',
                  },
                  index: 0,
                },
              ],
              text: event.content,
              data: null,
              functionCalls: [],
              executableCode: null,
              codeExecutionResult: null,
            } as any;
          }
          break;

        case 'tool-call':
          if (event.toolCall) {
            accumulatedToolCalls.push({
              name: event.toolCall.name,
              args: event.toolCall.args,
            });
          }
          break;

        case 'tool-result':
          // Tool results are handled internally by AI SDK
          break;

        case 'finish':
          // Final response with any accumulated tool calls
          if (accumulatedToolCalls.length > 0) {
            const parts: Part[] = [];
            
            if (accumulatedText) {
              parts.push({ text: accumulatedText });
            }

            for (const toolCall of accumulatedToolCalls) {
              parts.push({
                functionCall: {
                  name: toolCall.name,
                  args: toolCall.args,
                } as FunctionCall,
              });
            }

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
              text: accumulatedText,
              data: null,
              functionCalls: parts.filter(p => 'functionCall' in p).map(p => p.functionCall),
              executableCode: null,
              codeExecutionResult: null,
            } as any;
          }
          break;

        case 'error':
          throw new Error(`AI SDK error: ${event.error}`);
      }
    }
  }

  private normalizeContents(contents: any): (Content | string)[] {
    if (!contents) return [];
    if (Array.isArray(contents)) return contents;
    return [contents];
  }

  private async handleJsonGeneration(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const { prompt, system } = this.convertGeminiRequestToAISDK(request);
    const schema = this.convertGeminiSchemaToZod(request.config?.responseSchema);

    try {
      // Use AI SDK's generateJSON method for structured output
      const jsonResult = await this.aiClient.generateJSON(prompt, schema, {
        system,
        temperature: 0.1,
      });

      // Convert the JSON result back to Gemini format
      const jsonText = JSON.stringify(jsonResult, null, 2);
      
      const parts: Part[] = [{ text: jsonText }];

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
        usageMetadata: {
          promptTokenCount: 0, // AI SDK doesn't provide token counts for JSON generation
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        },
        text: jsonText,
        data: null,
        functionCalls: [],
        executableCode: null,
        codeExecutionResult: null,
      } as any;
    } catch (error) {
      throw new Error(`JSON generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertGeminiSchemaToZod(geminiSchema: any): z.ZodSchema {
    if (!geminiSchema || typeof geminiSchema !== 'object') {
      return z.object({});
    }

    const convertType = (schema: any): z.ZodSchema => {
      if (!schema || typeof schema !== 'object') {
        return z.string();
      }

      switch (schema.type?.toLowerCase()) {
        case 'object':
          if (schema.properties) {
            const shape: Record<string, z.ZodSchema> = {};
            for (const [key, prop] of Object.entries(schema.properties)) {
              shape[key] = convertType(prop);
            }
            
            let objectSchema = z.object(shape);
            
            // Handle required fields
            if (Array.isArray(schema.required)) {
              const requiredFields = new Set(schema.required);
              const newShape: Record<string, z.ZodSchema> = {};
              
              for (const [key, zodSchema] of Object.entries(shape)) {
                newShape[key] = requiredFields.has(key) ? zodSchema : zodSchema.optional();
              }
              
              objectSchema = z.object(newShape);
            }
            
            return objectSchema;
          }
          return z.object({});

        case 'array':
          if (schema.items) {
            return z.array(convertType(schema.items));
          }
          return z.array(z.any());

        case 'string':
          let stringSchema = z.string();
          if (schema.description) {
            stringSchema = stringSchema.describe(schema.description);
          }
          return stringSchema;

        case 'number':
        case 'integer':
          let numberSchema = schema.type?.toLowerCase() === 'integer' ? z.number().int() : z.number();
          if (schema.description) {
            numberSchema = numberSchema.describe(schema.description);
          }
          return numberSchema;

        case 'boolean':
          let boolSchema = z.boolean();
          if (schema.description) {
            boolSchema = boolSchema.describe(schema.description);
          }
          return boolSchema;

        default:
          return z.string();
      }
    };

    return convertType(geminiSchema);
  }
}