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
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_OPENAI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { AIClient, SupportedProvider } from './aiClient.js';
import { AIContentGeneratorAdapter } from './aiContentGeneratorAdapter.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI = 'openai-api-key',
  USE_ANTHROPIC = 'anthropic-api-key',
  USE_OPENROUTER = 'openrouter-api-key',
  USE_LITELLM = 'litellm-api-key',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  provider?: string;
  baseURL?: string;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;
  const openaiApiKey = process.env.OPENAI_API_KEY || undefined;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY || undefined;
  const litellmApiKey = process.env.LITELLM_API_KEY || undefined;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || 
    (authType === AuthType.USE_OPENAI ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL);

  // Determine provider and base URL from auth type
  let provider = 'gemini';
  let baseURL: string | undefined;

  switch (authType) {
    case AuthType.USE_OPENAI:
      provider = 'openai';
      break;
    case AuthType.USE_ANTHROPIC:
      provider = 'anthropic';
      break;
    case AuthType.USE_OPENROUTER:
      provider = 'openrouter';
      baseURL = 'https://openrouter.ai/api/v1';
      break;
    case AuthType.USE_LITELLM:
      provider = 'litellm';
      baseURL = process.env.LITELLM_BASE_URL || 'http://localhost:4000';
      break;
    default:
      provider = 'gemini';
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
    provider,
    baseURL,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
      contentGeneratorConfig.proxy,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_ANTHROPIC && anthropicApiKey) {
    contentGeneratorConfig.apiKey = anthropicApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENROUTER && openrouterApiKey) {
    contentGeneratorConfig.apiKey = openrouterApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_LITELLM && litellmApiKey) {
    contentGeneratorConfig.apiKey = litellmApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `IrisCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  // Use modern AI SDK for supported providers
  if (
    config.authType === AuthType.USE_OPENAI ||
    config.authType === AuthType.USE_ANTHROPIC ||
    config.authType === AuthType.USE_OPENROUTER ||
    config.authType === AuthType.USE_LITELLM
  ) {
    if (!config.apiKey) {
      throw new Error(`API key is required for ${config.authType}`);
    }

    // Map AuthType to SupportedProvider
    let provider: SupportedProvider;
    let baseURL: string | undefined;

    switch (config.authType) {
      case AuthType.USE_OPENAI:
        provider = 'openai';
        break;
      case AuthType.USE_ANTHROPIC:
        provider = 'anthropic';
        break;
      case AuthType.USE_OPENROUTER:
        provider = 'openrouter';
        baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
        break;
      case AuthType.USE_LITELLM:
        provider = 'litellm';
        baseURL = config.baseURL || 'http://localhost:4000';
        break;
      default:
        throw new Error(`Unsupported provider: ${config.authType}`);
    }

    // Create modern AI client
    const aiClient = new AIClient(gcConfig, {
      provider,
      model: config.model,
      apiKey: config.apiKey,
      baseURL,
    });
    
    await aiClient.initialize();

    // Wrap with adapter to maintain ContentGenerator interface
    const adapter = new AIContentGeneratorAdapter(aiClient);
    return new LoggingContentGenerator(adapter, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
