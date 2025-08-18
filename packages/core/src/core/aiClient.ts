/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { 
  generateText, 
  streamText, 
  tool,
  LanguageModel,
  StreamTextResult,
  generateObject
} from 'ai';
import { z } from 'zod';
import { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { ToolRegistry } from '../tools/tool-registry.js';

export type SupportedProvider = 'openai' | 'anthropic' | 'openrouter' | 'litellm';

export interface AIClientConfig {
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIStreamEvent {
  type: 'text' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    args: any;
  };
  toolResult?: {
    id: string;
    result: any;
  };
  error?: string;
}

/**
 * Unified AI client that abstracts different AI providers using Vercel AI SDK.
 * Replaces the Gemini-centric GeminiClient with provider-agnostic implementation.
 */
export class AIClient {
  private model: LanguageModel;
  private config: Config;
  private currentProvider: SupportedProvider;
  private toolRegistry: ToolRegistry | null = null;

  constructor(config: Config, clientConfig: AIClientConfig) {
    this.config = config;
    this.currentProvider = clientConfig.provider;
    this.model = this.createModel(clientConfig);
  }

  private createModel(clientConfig: AIClientConfig): LanguageModel {
    const { provider, model, apiKey, baseURL } = clientConfig;

    switch (provider) {
      case 'openai':
        // Create OpenAI provider instance and get model
        const openaiProvider = createOpenAI({
          apiKey,
          baseURL,
        });
        return openaiProvider(model);

      case 'anthropic':
        // Create Anthropic provider instance and get model
        const anthropicProvider = createAnthropic({
          apiKey,
          baseURL,
        });
        return anthropicProvider(model);

      case 'openrouter':
        // OpenRouter uses OpenAI-compatible interface
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: baseURL || 'https://openrouter.ai/api/v1',
        });
        return openrouterProvider(model);

      case 'litellm':
        // LiteLLM uses OpenAI-compatible interface
        const litellmProvider = createOpenAI({
          apiKey,
          baseURL: baseURL || 'http://localhost:4000',
        });
        return litellmProvider(model);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Initialize the AI client with tool registry.
   */
  async initialize(): Promise<void> {
    this.toolRegistry = await this.config.getToolRegistry();
  }

  /**
   * Generate text response with optional tools.
   */
  async generateText(
    prompt: string,
    options: {
      system?: string;
      tools?: boolean;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{
    text: string;
    toolCalls?: Array<{ name: string; args: any; result: any }>;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    const tools = options.tools ? await this.getAISDKTools() : undefined;

    const result = await generateText({
      model: this.model,
      system: options.system,
      prompt,
      tools,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    return {
      text: result.text,
      toolCalls: result.toolCalls?.map(call => ({
        name: call.toolName,
        args: call.args,
        result: (call as any).result, // Tool results are available after execution
      })),
      usage: result.usage ? {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      } : undefined,
    };
  }

  /**
   * Generate streaming text response with real-time tool execution.
   */
  async streamText(
    prompt: string,
    options: {
      system?: string;
      tools?: boolean;
      temperature?: number;
      maxTokens?: number;
      onEvent?: (event: AIStreamEvent) => void;
    } = {}
  ): Promise<AsyncIterable<AIStreamEvent>> {
    const tools = options.tools ? await this.getAISDKTools() : undefined;

    const result = await streamText({
      model: this.model,
      system: options.system,
      prompt,
      tools,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    return this.createEventStream(result, options.onEvent);
  }

  /**
   * Generate structured JSON response.
   */
  async generateJSON<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: {
      system?: string;
      temperature?: number;
    } = {}
  ): Promise<T> {
    const result = await generateObject({
      model: this.model,
      system: options.system,
      prompt,
      schema,
      temperature: options.temperature,
    });

    return result.object;
  }

  /**
   * Get current provider information.
   */
  getProviderInfo(): { provider: SupportedProvider; model: string } {
    return {
      provider: this.currentProvider,
      model: this.model.modelId || 'unknown',
    };
  }

  /**
   * Switch to a different provider/model.
   */
  switchProvider(clientConfig: AIClientConfig): void {
    this.currentProvider = clientConfig.provider;
    this.model = this.createModel(clientConfig);
  }

  /**
   * Convert tool registry to AI SDK tool format.
   */
  private async getAISDKTools(): Promise<Record<string, any>> {
    if (!this.toolRegistry) {
      await this.initialize();
    }

    const tools: Record<string, any> = {};
    const toolDeclarations = this.toolRegistry!.getFunctionDeclarations();

    for (const toolDecl of toolDeclarations) {
      if (!toolDecl.name) continue;

      // Convert Gemini tool schema to Zod schema for AI SDK
      const zodSchema = this.convertToZodSchema(toolDecl.parameters);

      tools[toolDecl.name] = tool({
        description: toolDecl.description || '',
        parameters: zodSchema,
        execute: async (args: any) => {
          const toolInstance = this.toolRegistry!.getTool(toolDecl.name!);
          if (!toolInstance) {
            throw new Error(`Tool not found: ${toolDecl.name}`);
          }

          try {
            // Use the tool's buildAndExecute method with an AbortController
            const abortController = new AbortController();
            const result = await toolInstance.buildAndExecute(args, abortController.signal);

            return {
              success: !result.error,
              content: result.llmContent || result.returnDisplay || '',
              error: result.error?.message,
            };
          } catch (error) {
            return {
              success: false,
              content: '',
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      });
    }

    return tools;
  }

  /**
   * Convert Gemini tool parameters to Zod schema.
   */
  private convertToZodSchema(parameters: any): z.ZodSchema {
    if (!parameters || typeof parameters !== 'object') {
      return z.object({});
    }

    if (parameters.type === 'object' && parameters.properties) {
      const shape: Record<string, z.ZodSchema> = {};

      for (const [key, prop] of Object.entries(parameters.properties as any)) {
        if (typeof prop === 'object' && prop !== null) {
          shape[key] = this.convertPropertyToZod(prop as any);
        }
      }

      let schema = z.object(shape);

      // Handle required fields
      if (Array.isArray(parameters.required)) {
        // Zod objects are required by default, so we need to make non-required fields optional
        const requiredFields = new Set(parameters.required);
        const newShape: Record<string, z.ZodSchema> = {};

        for (const [key, zodSchema] of Object.entries(shape)) {
          newShape[key] = requiredFields.has(key) ? zodSchema : zodSchema.optional();
        }

        schema = z.object(newShape);
      }

      return schema;
    }

    return z.object({});
  }

  private convertPropertyToZod(prop: any): z.ZodSchema {
    switch (prop.type?.toLowerCase()) {
      case 'string':
        let stringSchema = z.string();
        if (prop.description) {
          stringSchema = stringSchema.describe(prop.description);
        }
        return stringSchema;

      case 'number':
      case 'integer':
        let numberSchema = prop.type?.toLowerCase() === 'integer' ? z.number().int() : z.number();
        if (prop.description) {
          numberSchema = numberSchema.describe(prop.description);
        }
        return numberSchema;

      case 'boolean':
        let boolSchema = z.boolean();
        if (prop.description) {
          boolSchema = boolSchema.describe(prop.description);
        }
        return boolSchema;

      case 'array':
        if (prop.items) {
          const itemSchema = this.convertPropertyToZod(prop.items);
          return z.array(itemSchema);
        }
        return z.array(z.any());

      case 'object':
        return this.convertToZodSchema(prop);

      default:
        return z.string(); // Default fallback
    }
  }

  /**
   * Create event stream from AI SDK stream result.
   */
  private async *createEventStream(
    result: StreamTextResult<any, any>,
    onEvent?: (event: AIStreamEvent) => void
  ): AsyncIterable<AIStreamEvent> {
    try {
      for await (const part of result.fullStream) {
        let event: AIStreamEvent;

        switch (part.type) {
          case 'text-delta':
            event = {
              type: 'text',
              content: part.textDelta,
            };
            break;

          case 'tool-call':
            event = {
              type: 'tool-call',
              toolCall: {
                id: part.toolCallId,
                name: part.toolName,
                args: part.args,
              },
            };
            break;

          case 'tool-result':
            event = {
              type: 'tool-result',
              toolResult: {
                id: part.toolCallId,
                result: part.result,
              },
            };
            break;

          case 'finish':
            event = {
              type: 'finish',
            };
            break;

          case 'error':
            event = {
              type: 'error',
              error: part.error instanceof Error ? part.error.message : String(part.error),
            };
            break;

          default:
            continue; // Skip unknown event types
        }

        if (onEvent) {
          onEvent(event);
        }

        yield event;
      }
    } catch (error) {
      const errorEvent: AIStreamEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };

      if (onEvent) {
        onEvent(errorEvent);
      }

      yield errorEvent;
    }
  }

  /**
   * Get user tier (compatibility with existing code).
   */
  getUserTier(): UserTierId | undefined {
    // For now, return undefined as AI SDK doesn't have built-in tier support
    // This can be extended based on provider-specific logic
    return undefined;
  }
}