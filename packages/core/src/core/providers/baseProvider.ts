/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';

/**
 * Base interface for provider adapters that convert between Gemini format and provider-specific formats
 */
export interface ProviderAdapter {
  /**
   * Provider name identifier
   */
  readonly providerName: string;

  /**
   * Convert Gemini GenerateContentParameters to provider-specific format
   */
  adaptRequest(request: GenerateContentParameters): unknown;

  /**
   * Convert provider-specific response back to Gemini GenerateContentResponse format
   */
  adaptResponse(response: unknown): GenerateContentResponse;

  /**
   * Convert provider-specific streaming response to Gemini format
   */
  adaptStreamResponse(chunk: unknown): GenerateContentResponse;

  /**
   * Convert Gemini Content array to provider-specific message format
   */
  adaptMessages(contents: Content[]): unknown[];

  /**
   * Get provider-specific model identifier from Gemini model name
   */
  mapModel(geminiModel: string): string;

  /**
   * Check if model is supported by this provider
   */
  isModelSupported(model: string): boolean;
}

/**
 * Abstract base class for provider-specific ContentGenerators
 */
export abstract class BaseProviderContentGenerator {
  protected adapter: ProviderAdapter;

  constructor(adapter: ProviderAdapter) {
    this.adapter = adapter;
  }

  abstract generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  abstract generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  abstract countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse>;

  abstract embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse>;

  get providerName(): string {
    return this.adapter.providerName;
  }
}