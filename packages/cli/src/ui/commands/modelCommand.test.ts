/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { CommandContext } from './types.js';
import { MessageType } from '../types.js';
import { AuthType } from 'iris-cli-core';

describe('modelCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          getModel: vi.fn().mockReturnValue('gpt-4o'),
          setModel: vi.fn().mockResolvedValue(undefined),
        },
        settings: {
          merged: {
            selectedAuthType: AuthType.USE_OPENAI,
          },
        },
        git: undefined,
        logger: {} as any,
      },
      ui: {
        addItem: vi.fn(),
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
        pendingItem: null,
        setPendingItem: vi.fn(),
        loadHistory: vi.fn(),
        toggleCorgiMode: vi.fn(),
        toggleVimEnabled: vi.fn().mockResolvedValue(true),
        setGeminiMdFileCount: vi.fn(),
      },
      session: {
        stats: {} as any,
        sessionShellAllowlist: new Set(),
      },
    } as any;
  });

  describe('current command', () => {
    it('should show current model and provider', () => {
      modelCommand.action!(mockContext, 'current');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('**Provider:** OpenAI'),
        }),
        expect.any(Number),
      );

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('**Model:** gpt-4o'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('list command', () => {
    it('should show available OpenAI models', () => {
      modelCommand.action!(mockContext, 'list');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('**Available OpenAI Models:**'),
        }),
        expect.any(Number),
      );

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('gpt-4o'),
        }),
        expect.any(Number),
      );
    });

    it('should show available Gemini models for Gemini auth', () => {
      mockContext.services.settings.merged.selectedAuthType = AuthType.USE_GEMINI;

      modelCommand.action!(mockContext, 'list');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('**Available Gemini API Models:**'),
        }),
        expect.any(Number),
      );

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('gemini-2.5-pro'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('set command', () => {
    it('should set a valid OpenAI model', async () => {
      await modelCommand.action!(mockContext, 'set gpt-4o-mini');

      expect(mockContext.services.config?.setModel).toHaveBeenCalledWith('gpt-4o-mini');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('✅ Model changed to **gpt-4o-mini**'),
        }),
        expect.any(Number),
      );
    });

    it('should reject invalid model for current provider', async () => {
      await modelCommand.action!(mockContext, 'set gemini-2.5-pro');

      expect(mockContext.services.config?.setModel).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Model "gemini-2.5-pro" not available for OpenAI'),
        }),
        expect.any(Number),
      );
    });

    it('should show error for missing model name', async () => {
      await modelCommand.action!(mockContext, 'set');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Usage: /model set <model-name>'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('invalid command', () => {
    it('should show usage for invalid subcommand', async () => {
      await modelCommand.action!(mockContext, 'invalid');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Usage: /model [list|set <model-name>|current]'),
        }),
        expect.any(Number),
      );
    });
  });
});