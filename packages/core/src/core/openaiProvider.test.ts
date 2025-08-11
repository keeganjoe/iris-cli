/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './openaiProvider.js';
import OpenAI from 'openai';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      embeddings: {
        create: vi.fn(),
      },
    })),
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockOpenAI: any;

  beforeEach(() => {
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      embeddings: {
        create: vi.fn(),
      },
    };
    (OpenAI as any).mockImplementation(() => mockOpenAI);
    provider = new OpenAIProvider('test-api-key', 'gpt-4o');
  });

  describe('generateContent', () => {
    it('should convert Gemini request to OpenAI format', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello world',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const request = {
        model: 'gpt-4o',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const result = await provider.generateContent(request, 'test-id');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        tools: undefined,
        tool_choice: undefined,
        temperature: 0.1,
        max_tokens: 4096,
      });

      expect(result).toMatchObject({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
              role: 'model',
            },
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        text: 'Hello world',
      });
    });

    it('should handle string content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const request = {
        model: 'gpt-4o',
        contents: 'Hello world',
      };

      const result = await provider.generateContent(request, 'test-id');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: 'Hello world',
          },
        ],
        tools: undefined,
        tool_choice: undefined,
        temperature: 0.1,
        max_tokens: 4096,
      });

      // Use type assertions since we control the mock response
      expect(result.candidates).toBeTruthy();
      expect((result as any).candidates[0].content.parts[0]).toEqual({ text: 'Response' });
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens for text content', async () => {
      const request = {
        model: 'gpt-4o',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello world this is a test message' }],
          },
        ],
      };

      const result = await provider.countTokens(request);

      // Should estimate ~9 tokens for "Hello world this is a test message" (35 chars / 4)
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThan(20);
    });

    it('should handle string content', async () => {
      const request = {
        model: 'gpt-4o',
        contents: 'Hello world',
      };

      const result = await provider.countTokens(request);

      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('embedContent', () => {
    it('should create embeddings for text content', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const request = {
        model: 'text-embedding-3-small',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello world' }],
          },
        ],
      };

      const result = await provider.embedContent(request);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Hello world',
      });

      expect(result).toEqual({
        embeddings: [
          {
            values: [0.1, 0.2, 0.3],
          },
        ],
      });
    });
  });
});