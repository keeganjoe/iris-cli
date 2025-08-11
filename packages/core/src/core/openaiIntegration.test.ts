/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContentGenerator, createContentGeneratorConfig, AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';

describe('OpenAI Integration', () => {
  let mockConfig: Config;
  const originalEnv = process.env;

  beforeEach(() => {
    // Mock environment variables
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
    };

    mockConfig = {
      getModel: vi.fn().mockReturnValue(undefined),
      getProxy: vi.fn().mockReturnValue(undefined),
    } as any;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createContentGeneratorConfig', () => {
    it('should create OpenAI configuration', () => {
      const config = createContentGeneratorConfig(mockConfig, AuthType.USE_OPENAI);

      expect(config).toEqual({
        model: 'gpt-4o',
        authType: AuthType.USE_OPENAI,
        proxy: undefined,
        provider: 'openai',
        apiKey: 'test-openai-key',
        vertexai: false,
      });
    });

    it('should fallback to default model for OpenAI', () => {
      mockConfig.getModel = vi.fn().mockReturnValue('custom-model');
      
      const config = createContentGeneratorConfig(mockConfig, AuthType.USE_OPENAI);

      expect(config.model).toBe('custom-model');
      expect(config.provider).toBe('openai');
    });
  });

  describe('createContentGenerator', () => {
    it('should create OpenAI provider', async () => {
      const config = {
        model: 'gpt-4o',
        apiKey: 'test-key',
        authType: AuthType.USE_OPENAI,
        provider: 'openai',
      };

      const generator = await createContentGenerator(config, mockConfig);

      expect(generator).toBeDefined();
      // The generator should be wrapped in LoggingContentGenerator
      expect(generator.constructor.name).toBe('LoggingContentGenerator');
    });

    it('should throw error if no API key provided', async () => {
      const config = {
        model: 'gpt-4o',
        authType: AuthType.USE_OPENAI,
        provider: 'openai',
      };

      await expect(createContentGenerator(config, mockConfig)).rejects.toThrow(
        'OpenAI API key is required'
      );
    });
  });
});