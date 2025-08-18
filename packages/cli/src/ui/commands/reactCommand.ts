/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  CommandContext,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';

/**
 * Command for ReAct (Reasoning and Acting) mode operations.
 */
export const reactCommand: SlashCommand = {
  name: 'react',
  altNames: ['reasoning', 'think'],
  description: 'Enable ReAct (Reasoning and Acting) mode for step-by-step problem solving',
  kind: CommandKind.BUILT_IN,
  
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const { services } = context;
    
    if (!services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const trimmedArgs = args.trim();
    
    // If no arguments, show ReAct status and help
    if (!trimmedArgs) {
      const reActSettings = services.config.getReActSettings();
      const isEnabled = services.config.getReActEnabled();
      
      return {
        type: 'message',
        messageType: 'info',
        content: `ReAct Mode Status:
• Enabled: ${isEnabled ? '✅ Yes' : '❌ No'}
• Max Cycles: ${reActSettings.maxCycles}
• Confidence Threshold: ${Math.round((reActSettings.confidenceThreshold || 0.7) * 100)}%
• Auto Reflection: ${reActSettings.autoReflection ? '✅' : '❌'}
• Show Thoughts: ${reActSettings.showInternalThoughts ? '✅' : '❌'}

Usage:
• /react enable - Enable ReAct mode for all queries automatically
• /react disable - Disable ReAct mode  
• /react clear - Clear any stuck ReAct sessions
• /react "specific goal" - Force ReAct for a specific task
• /react config - Show detailed configuration
• /react help - Show this help message

Note: When enabled, ReAct automatically activates for complex queries.`,
      };
    }

    // Handle subcommands
    const [subcommand, ...rest] = trimmedArgs.split(' ');
    const remainingArgs = rest.join(' ');

    switch (subcommand.toLowerCase()) {
      case 'enable':
        services.config.setReActSettings({
          ...services.config.getReActSettings(),
          enabled: true,
        });
        return {
          type: 'message',
          messageType: 'info',
          content: '✅ ReAct mode enabled. Your queries will now use step-by-step reasoning.',
        };

      case 'disable':
        services.config.setReActSettings({
          ...services.config.getReActSettings(),
          enabled: false,
        });
        return {
          type: 'message',
          messageType: 'info',
          content: '❌ ReAct mode disabled. Queries will use standard processing.',
        };

      case 'clear':
      case 'reset':
        // Note: Auto-cleanup happens when starting new sessions
        return {
          type: 'message',
          messageType: 'info',
          content: '🧹 Stale ReAct sessions will be automatically cleared when starting new sessions.',
        };

      case 'config':
      case 'settings':
        const settings = services.config.getReActSettings();
        return {
          type: 'message',
          messageType: 'info',
          content: `ReAct Configuration:
• Enabled: ${settings.enabled ? '✅' : '❌'}
• Max Cycles: ${settings.maxCycles}
• Thinking Timeout: ${settings.thinkingTimeout}ms
• Confidence Threshold: ${Math.round((settings.confidenceThreshold || 0.7) * 100)}%
• Auto Reflection: ${settings.autoReflection ? '✅' : '❌'}
• Show Internal Thoughts: ${settings.showInternalThoughts ? '✅' : '❌'}
• Enable Parallel Actions: ${settings.enableParallelActions ? '✅' : '❌'}

Display Settings:
• Show Thoughts: ${settings.displaySettings?.showThoughts ? '✅' : '❌'}
• Show Actions: ${settings.displaySettings?.showActions ? '✅' : '❌'}
• Show Observations: ${settings.displaySettings?.showObservations ? '✅' : '❌'}
• Show Reflections: ${settings.displaySettings?.showReflections ? '✅' : '❌'}
• Animate Transitions: ${settings.displaySettings?.animateTransitions ? '✅' : '❌'}`,
        };

      case 'help':
        return {
          type: 'message',
          messageType: 'info',
          content: `ReAct (Reasoning and Acting) Mode Help:

ReAct mode enables step-by-step reasoning where the AI:
1. 🤔 **Thinks** about the problem and plans next steps
2. 🛠️ **Acts** by using tools or taking actions  
3. 👁️ **Observes** the results of actions
4. 🔄 **Reflects** on progress and lessons learned

Commands:
• /react enable - Enable automatic ReAct mode for all queries
• /react disable - Disable ReAct mode
• /react clear - Clear any stuck ReAct sessions
• /react "goal" - Force ReAct for a specific goal (optional when enabled)
• /react config - Show current configuration
• /react help - Show this help

When ReAct is enabled, these queries automatically use step-by-step reasoning:
• "Analyze this codebase and suggest improvements"
• "Debug the login authentication issue"  
• "Implement user profile management feature"

No need to prefix with /react when mode is enabled!

ReAct mode is ideal for:
- Complex problem-solving tasks
- Multi-step debugging
- Feature development
- Code analysis and optimization
- Research and investigation tasks`,
        };

      default:
        // Treat the entire args as a goal for ReAct reasoning
        if (!services.config.getReActEnabled()) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'ReAct mode is disabled. Enable it with `/react enable` first.',
          };
        }

        // Submit the goal as a regular prompt - ReAct processing will be automatic
        return {
          type: 'submit_prompt',
          content: trimmedArgs,
        };
    }
  },

  completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
    const suggestions = ['enable', 'disable', 'clear', 'reset', 'config', 'settings', 'help'];
    
    if (!partialArg) {
      return suggestions;
    }

    const lowerPartial = partialArg.toLowerCase();
    return suggestions.filter(suggestion => 
      suggestion.toLowerCase().startsWith(lowerPartial)
    );
  },
};