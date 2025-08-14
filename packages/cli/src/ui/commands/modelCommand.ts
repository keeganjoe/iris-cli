/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { AuthType } from 'iris-cli-core';

// Model definitions per provider
const GEMINI_MODELS = [
  { name: 'gemini-2.5-pro', description: 'Most capable model' },
  { name: 'gemini-2.5-flash', description: 'Fast and efficient' },
  { name: 'gemini-2.5-flash-lite', description: 'Lightweight version' },
];

const OPENAI_MODELS = [
  { name: 'gpt-4o', description: 'Latest GPT-4 Optimized (default)' },
  { name: 'gpt-4o-mini', description: 'Smaller, faster GPT-4' },
  { name: 'o1-preview', description: 'Reasoning-focused model' },
  { name: 'o1-mini', description: 'Smaller reasoning model' },
];

function getProviderFromAuthType(authType: string | undefined): string {
  switch (authType) {
    case AuthType.USE_OPENAI:
      return 'OpenAI';
    case AuthType.USE_GEMINI:
      return 'Gemini API';
    case AuthType.USE_VERTEX_AI:
      return 'Vertex AI';
    case AuthType.LOGIN_WITH_GOOGLE:
    case AuthType.CLOUD_SHELL:
      return 'Google Cloud';
    default:
      return 'Unknown';
  }
}

function getAvailableModels(authType: string | undefined) {
  switch (authType) {
    case AuthType.USE_OPENAI:
      return OPENAI_MODELS;
    case AuthType.USE_GEMINI:
    case AuthType.USE_VERTEX_AI:
    case AuthType.LOGIN_WITH_GOOGLE:
    case AuthType.CLOUD_SHELL:
    default:
      return GEMINI_MODELS;
  }
}

export const modelCommand: SlashCommand = {
  name: 'model',
  altNames: ['models'],
  description: 'manage AI models. Usage: /model [list|set <model-name>|current]',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string) => {
    const subCommand = args.trim().split(' ')[0];
    const modelName = args.trim().split(' ').slice(1).join(' ');

    switch (subCommand) {
      case 'list':
        showAvailableModels(context);
        break;
      case 'set':
        if (modelName) {
          await setModel(context, modelName);
        } else {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: 'Usage: /model set <model-name>',
            },
            Date.now(),
          );
        }
        break;
      case 'current':
      case '':
        showCurrentModel(context);
        break;
      default:
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Usage: /model [list|set <model-name>|current]',
          },
          Date.now(),
        );
    }
  },
  subCommands: [
    {
      name: 'list',
      description: 'Show available models for current provider',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext) => {
        showAvailableModels(context);
      },
    },
    {
      name: 'current',
      description: 'Show current model and provider',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext) => {
        showCurrentModel(context);
      },
    },
  ],
};

function showCurrentModel(context: CommandContext) {
  const currentModel = context.services.config?.getModel() || 'default';
  const authType = context.services.settings.merged.selectedAuthType;
  const provider = getProviderFromAuthType(authType);

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `**Current Configuration:**
- **Provider:** ${provider}
- **Model:** ${currentModel}
- **Auth Type:** ${authType || 'Not set'}

Use \`/model list\` to see available models or \`/model set <model-name>\` to change.`,
    },
    Date.now(),
  );
}

function showAvailableModels(context: CommandContext) {
  const authType = context.services.settings.merged.selectedAuthType;
  const provider = getProviderFromAuthType(authType);
  const models = getAvailableModels(authType);
  const currentModel = context.services.config?.getModel();

  let modelList = `**Available ${provider} Models:**\n\n`;
  
  models.forEach((model) => {
    const isCurrent = model.name === currentModel;
    const marker = isCurrent ? '→ ' : '  ';
    modelList += `${marker}**${model.name}** - ${model.description}${isCurrent ? ' (current)' : ''}\n`;
  });

  modelList += `\nUse \`/model set <model-name>\` to switch models.`;

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: modelList,
    },
    Date.now(),
  );
}

async function setModel(context: CommandContext, modelName: string) {
  // Determine which provider and auth type this model belongs to
  let targetAuthType: string | undefined;
  let targetModel: { name: string; description: string } | undefined;
  
  // Check OpenAI models first
  const openaiModel = OPENAI_MODELS.find(m => m.name === modelName);
  if (openaiModel) {
    targetAuthType = AuthType.USE_OPENAI;
    targetModel = openaiModel;
  } else {
    // Check Gemini models
    const geminiModel = GEMINI_MODELS.find(m => m.name === modelName);
    if (geminiModel) {
      // Use current auth type if it's a Gemini-compatible auth type, otherwise default to USE_GEMINI
      const currentAuthType = context.services.settings.merged.selectedAuthType;
      if (currentAuthType && [AuthType.USE_GEMINI, AuthType.USE_VERTEX_AI, AuthType.LOGIN_WITH_GOOGLE, AuthType.CLOUD_SHELL].includes(currentAuthType as AuthType)) {
        targetAuthType = currentAuthType;
      } else {
        targetAuthType = AuthType.USE_GEMINI;
      }
      targetModel = geminiModel;
    }
  }
  
  if (!targetModel) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Model "${modelName}" not found. Use \`/model list\` to see available models.`,
      },
      Date.now(),
    );
    return;
  }

  const currentAuthType = context.services.settings.merged.selectedAuthType;
  const needsAuthTypeChange = currentAuthType !== targetAuthType;

  try {
    // Change auth type if needed
    if (needsAuthTypeChange && targetAuthType) {
      // Validate that the target auth type has the necessary environment variables
      const { validateAuthMethod } = await import('../../config/auth.js');
      const authError = validateAuthMethod(targetAuthType);
      if (authError) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Cannot switch to ${getProviderFromAuthType(targetAuthType)} provider: ${authError}`,
          },
          Date.now(),
        );
        return;
      }

      // Update the auth type
      const { SettingScope } = await import('../../config/settings.js');
      context.services.settings.setValue(SettingScope.User, 'selectedAuthType', targetAuthType as any);
      
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `🔄 Switched to ${getProviderFromAuthType(targetAuthType)} provider`,
        },
        Date.now(),
      );
    }

    await context.services.config?.setModel(modelName);
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `✅ Model changed to **${modelName}** (${targetModel.description})${needsAuthTypeChange ? ` using ${getProviderFromAuthType(targetAuthType)}` : ''}`,
      },
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to set model: ${error}`,
      },
      Date.now(),
    );
  }
}