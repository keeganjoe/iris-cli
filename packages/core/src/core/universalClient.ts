/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
} from '@google/genai';
import { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';

/**
 * Universal client interface that can work with any provider
 * while maintaining the same API as GeminiClient
 */
export interface UniversalClientInterface {
  generateContent(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<AsyncGenerator<GenerateContentResponse>>;
}

/**
 * Provider capability detection
 */
export const PROVIDER_CAPABILITIES = {
  gemini: {
    supportsNativeWebSearch: true,
    supportsNativeCodeExecution: true,
    supportsStreamingWithTools: true,
    toolCallReliability: 'high' as const,
  },
  openai: {
    supportsNativeWebSearch: false,
    supportsNativeCodeExecution: false,
    supportsStreamingWithTools: false, // Known issue
    toolCallReliability: 'medium' as const,
  },
} as const;

/**
 * Universal client that routes requests to the appropriate provider
 * while maintaining backward compatibility with GeminiClient interface
 */
export class UniversalClient implements UniversalClientInterface {
  constructor(private config: Config) {}

  async generateContent(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<GenerateContentResponse> {
    const authType = this.config.getContentGeneratorConfig()?.authType;
    
    if (authType === AuthType.USE_OPENAI) {
      return this.executeWithOpenAI(contents, config, signal);
    } else {
      // Default to Gemini for all non-OpenAI providers
      return this.executeWithGemini(contents, config, signal);
    }
  }

  async generateContentStream(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For now, convert streaming requests to non-streaming to avoid type compatibility issues
    // TODO: Implement proper streaming support
    console.warn('UniversalClient: Streaming not yet implemented, converting to non-streaming');
    const response = await this.generateContent(contents, config, signal);
    return this.convertToStreamingResponse(response);
  }

  private async executeWithOpenAI(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<GenerateContentResponse> {
    // For now, just use the gemini client for OpenAI until we have proper OpenAI integration
    // TODO: Implement proper OpenAI client usage
    console.warn('UniversalClient: OpenAI provider not yet implemented, falling back to Gemini');
    return this.executeWithGemini(contents, config, signal);
  }

  private async executeWithGemini(
    contents: Content[],
    config?: GenerateContentConfig,
    signal?: AbortSignal
  ): Promise<GenerateContentResponse> {
    const geminiClient = this.config.getGeminiClient();
    return geminiClient.generateContent(
      contents, 
      config || {}, 
      signal || new AbortController().signal
    );
  }


  private async *convertToStreamingResponse(response: GenerateContentResponse): AsyncGenerator<GenerateContentResponse> {
    yield response;
  }

  /**
   * Helper methods for provider capability detection
   */
  getCurrentProvider(): 'gemini' | 'openai' {
    const authType = this.config.getContentGeneratorConfig()?.authType;
    return authType === AuthType.USE_OPENAI ? 'openai' : 'gemini';
  }

  supportsNativeWebSearch(): boolean {
    return PROVIDER_CAPABILITIES[this.getCurrentProvider()].supportsNativeWebSearch;
  }

  supportsNativeCodeExecution(): boolean {
    return PROVIDER_CAPABILITIES[this.getCurrentProvider()].supportsNativeCodeExecution;
  }

  supportsStreamingWithTools(): boolean {
    return PROVIDER_CAPABILITIES[this.getCurrentProvider()].supportsStreamingWithTools;
  }
}