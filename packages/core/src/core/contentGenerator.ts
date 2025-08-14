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
import { OpenAIProvider } from './openaiProvider.js';
import { AzureProvider } from './azureProvider.js';

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
  LOGIN_WITH_AZURE = 'azure-oauth',
  USE_AZURE = 'azure-api-key',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  provider?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
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
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY || undefined;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || undefined;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || 
    (authType === AuthType.USE_OPENAI || authType === AuthType.USE_AZURE || authType === AuthType.LOGIN_WITH_AZURE 
      ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL);

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
    provider: 
      authType === AuthType.USE_OPENAI ? 'openai' :
      authType === AuthType.USE_AZURE || authType === AuthType.LOGIN_WITH_AZURE ? 'azure' :
      'gemini',
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

  if (authType === AuthType.USE_AZURE && azureApiKey && azureEndpoint) {
    contentGeneratorConfig.apiKey = azureApiKey;
    contentGeneratorConfig.azureEndpoint = azureEndpoint;
    contentGeneratorConfig.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

    return contentGeneratorConfig;
  }

  if (authType === AuthType.LOGIN_WITH_AZURE) {
    // For Azure OAuth, we'll handle token acquisition in the provider
    contentGeneratorConfig.azureEndpoint = azureEndpoint;
    contentGeneratorConfig.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

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

  if (config.authType === AuthType.USE_OPENAI) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    const openaiProvider = new OpenAIProvider(config.apiKey, config.model);
    return new LoggingContentGenerator(openaiProvider, gcConfig);
  }

  if (config.authType === AuthType.USE_AZURE) {
    if (!config.apiKey) {
      throw new Error('Azure OpenAI API key is required');
    }
    if (!config.azureEndpoint) {
      throw new Error('Azure OpenAI endpoint is required');
    }
    const azureProvider = new AzureProvider(
      config.apiKey, 
      config.model, 
      config.azureEndpoint, 
      config.azureApiVersion || '2024-06-01'
    );
    return new LoggingContentGenerator(azureProvider, gcConfig);
  }

  if (config.authType === AuthType.LOGIN_WITH_AZURE) {
    if (!config.azureEndpoint) {
      throw new Error('Azure OpenAI endpoint is required');
    }
    // For Azure OAuth, we'll get the token dynamically
    // For now, we'll create the provider with a placeholder token
    // The actual token will be acquired by the Azure auth provider
    const azureProvider = new AzureProvider(
      'placeholder', // Token will be set dynamically
      config.model, 
      config.azureEndpoint, 
      config.azureApiVersion || '2024-06-01'
    );
    return new LoggingContentGenerator(azureProvider, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
