/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIClient, AIStreamEvent } from './aiClient.js';
import { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';
import { 
  Content,
  GenerateContentResponse,
  Tool,
  Part,
  FunctionCall,
  FunctionResponse,
  FinishReason,
} from '@google/genai';
import { UserTierId } from '../code_assist/types.js';
import { 
  ServerGeminiStreamEvent, 
  GeminiEventType, 
  StructuredError,
  ToolCallRequestInfo,
} from './turn.js';

/**
 * Adapter that bridges the AI SDK with the existing GeminiClient interface.
 * This allows gradual migration from Gemini-centric architecture to AI SDK.
 */
export class AIClientAdapter {
  private aiClient: AIClient;
  private config: Config;
  private history: Content[] = [];
  private tools: Tool[] = [];

  constructor(config: Config) {
    this.config = config;
    this.aiClient = this.createAIClient();
  }

  private createAIClient(): AIClient {
    const model = this.config.getModel();
    const contentGeneratorConfig = this.config.getContentGeneratorConfig();
    
    // Determine provider from config
    let provider: 'openai' | 'anthropic' | 'openrouter' | 'litellm' = 'openai';
    let apiKey = '';
    let baseURL: string | undefined;

    // Map AuthType to provider
    switch (contentGeneratorConfig?.authType) {
      case AuthType.USE_ANTHROPIC:
        provider = 'anthropic';
        apiKey = process.env.ANTHROPIC_API_KEY || contentGeneratorConfig.apiKey || '';
        break;
      case AuthType.USE_OPENROUTER:
        provider = 'openrouter';
        apiKey = process.env.OPENROUTER_API_KEY || contentGeneratorConfig.apiKey || '';
        baseURL = contentGeneratorConfig.baseURL || 'https://openrouter.ai/api/v1';
        break;
      case AuthType.USE_LITELLM:
        provider = 'litellm';
        apiKey = process.env.LITELLM_API_KEY || contentGeneratorConfig.apiKey || '';
        baseURL = contentGeneratorConfig.baseURL || 'http://localhost:4000';
        break;
      default:
        // Default to OpenAI for AI SDK modes
        provider = 'openai';
        apiKey = process.env.OPENAI_API_KEY || contentGeneratorConfig.apiKey || '';
    }

    return new AIClient(this.config, {
      provider,
      model,
      apiKey,
      baseURL,
    });
  }

  async initialize(): Promise<void> {
    await this.aiClient.initialize();
  }

  getUserTier(): UserTierId | undefined {
    return this.aiClient.getUserTier();
  }

  /**
   * Add content to the conversation history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }

  /**
   * Get the conversation history.
   */
  getHistory(): Content[] {
    return [...this.history];
  }

  /**
   * Set the conversation history.
   */
  setHistory(history: Content[]): void {
    this.history = [...history];
  }

  /**
   * Set the available tools.
   */
  setTools(tools: Tool[]): void {
    this.tools = [...tools];
  }

  /**
   * Check if the adapter is initialized.
   */
  isInitialized(): boolean {
    return true; // AI client handles its own initialization
  }

  /**
   * Generate content using AI SDK.
   */
  async generateContent(prompt: string, config?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<GenerateContentResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const conversationContext = this.buildConversationContext();

    try {
      const result = await this.aiClient.generateText(
        `${conversationContext}\n\nUser: ${prompt}`,
        {
          system: systemPrompt,
          tools: this.tools.length > 0,
          temperature: config?.temperature || 0,
          maxTokens: config?.maxTokens,
        }
      );

      // For now, we'll create a minimal response that satisfies the interface
      // In a full migration, this would be replaced by direct AI SDK usage
      const response: Partial<GenerateContentResponse> = {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: result.text }]
          },
          finishReason: 'STOP' as FinishReason,
          safetyRatings: [],
        }],
        usageMetadata: result.usage ? {
          promptTokenCount: result.usage.promptTokens,
          candidatesTokenCount: result.usage.completionTokens,
          totalTokenCount: result.usage.totalTokens,
        } : undefined,
        text: result.text, // Required by interface
        functionCalls: [], // Required by interface
        data: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
      };

      // Add tool calls if present
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolParts: Part[] = result.toolCalls.map(call => ({
          functionCall: {
            name: call.name,
            args: call.args,
          } as FunctionCall
        }));

        const candidate = response.candidates?.[0];
        if (candidate?.content) {
          candidate.content.parts = [...toolParts, { text: result.text }];
        }
      }

      // Add to history
      this.addHistory({
        role: 'user',
        parts: [{ text: prompt }]
      });
      
      const candidate = response.candidates?.[0];
      if (candidate?.content) {
        this.addHistory(candidate.content);
      }

      return response as GenerateContentResponse;
    } catch (error) {
      throw new Error(`AI SDK generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate streaming content using AI SDK.
   */
  async *generateContentStream(prompt: string, config?: {
    temperature?: number;
    maxTokens?: number;
    onEvent?: (event: ServerGeminiStreamEvent) => void;
  }): AsyncGenerator<GenerateContentResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const conversationContext = this.buildConversationContext();

    try {
      const eventStream = await this.aiClient.streamText(
        `${conversationContext}\n\nUser: ${prompt}`,
        {
          system: systemPrompt,
          tools: this.tools.length > 0,
          temperature: config?.temperature || 0,
          maxTokens: config?.maxTokens,
          onEvent: (event: AIStreamEvent) => {
            // Convert AI SDK events to Gemini stream events
            if (config?.onEvent) {
              const geminiEvent = this.convertToGeminiStreamEvent(event);
              if (geminiEvent) {
                config.onEvent(geminiEvent);
              }
            }
          }
        }
      );

      let accumulatedText = '';
      let toolCalls: any[] = [];

      for await (const event of eventStream) {
        switch (event.type) {
          case 'text':
            if (event.content) {
              accumulatedText += event.content;
              yield {
                candidates: [{
                  content: {
                    role: 'model',
                    parts: [{ text: accumulatedText }]
                  },
                  finishReason: 'STOP' as FinishReason,
                  safetyRatings: [],
                }],
                text: accumulatedText,
                functionCalls: [],
                data: undefined,
                executableCode: undefined,
                codeExecutionResult: undefined,
              } as GenerateContentResponse;
            }
            break;

          case 'tool-call':
            if (event.toolCall) {
              toolCalls.push(event.toolCall);
            }
            break;

          case 'finish':
            // Add final response to history
            this.addHistory({
              role: 'user',
              parts: [{ text: prompt }]
            });

            const finalParts: Part[] = [];
            if (toolCalls.length > 0) {
              finalParts.push(...toolCalls.map(call => ({
                functionCall: {
                  name: call.name,
                  args: call.args,
                } as FunctionCall
              })));
            }
            if (accumulatedText) {
              finalParts.push({ text: accumulatedText });
            }

            this.addHistory({
              role: 'model',
              parts: finalParts
            });
            break;
        }
      }
    } catch (error) {
      throw new Error(`AI SDK streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build system prompt from configuration.
   */
  private buildSystemPrompt(): string {
    // This would integrate with the existing system prompt logic
    return 'You are Claude Code, an AI assistant that helps with software development tasks.';
  }

  /**
   * Build conversation context from history.
   */
  private buildConversationContext(): string {
    return this.history
      .map(content => {
        const role = content.role === 'user' ? 'Human' : 'Assistant';
        const text = (content.parts || [])
          .filter(part => 'text' in part)
          .map(part => (part as any).text)
          .join('\n');
        return `${role}: ${text}`;
      })
      .join('\n\n');
  }

  /**
   * Convert AI SDK stream event to Gemini stream event format.
   */
  private convertToGeminiStreamEvent(event: AIStreamEvent): ServerGeminiStreamEvent | null {
    switch (event.type) {
      case 'text':
        return {
          type: GeminiEventType.Content,
          value: event.content || ''
        };

      case 'tool-call':
        return {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: event.toolCall?.id || '',
            name: event.toolCall?.name || '',
            args: event.toolCall?.args || {},
            isClientInitiated: false,
            prompt_id: 'ai-sdk-call',
          } as ToolCallRequestInfo
        };

      case 'error':
        return {
          type: GeminiEventType.Error,
          value: {
            error: {
              message: event.error || 'Unknown error',
              status: 500,
            } as StructuredError
          }
        };

      default:
        return null;
    }
  }

  /**
   * Get provider information.
   */
  getProviderInfo(): { provider: string; model: string } {
    return this.aiClient.getProviderInfo();
  }
}