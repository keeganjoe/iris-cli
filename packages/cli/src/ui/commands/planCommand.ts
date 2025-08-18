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
 * Command for task planning and structured execution.
 */
export const planCommand: SlashCommand = {
  name: 'plan',
  altNames: ['planning', 'planner'],
  description: 'Create and manage structured task plans for complex goals',
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
    
    // If no arguments, show planning status and help
    if (!trimmedArgs) {
      const plannerSettings = services.config.getPlannerSettings();
      const isEnabled = services.config.getPlannerEnabled();
      
      return {
        type: 'message',
        messageType: 'info',
        content: `Task Planner Status:
• Enabled: ${isEnabled ? '✅ Yes' : '❌ No'}
• Max Steps: ${plannerSettings.maxSteps}
• Max Dependency Depth: ${plannerSettings.maxDependencyDepth}
• Parallel Execution: ${plannerSettings.enableParallelExecution ? '✅' : '❌'}
• Auto Retry: ${plannerSettings.autoRetryFailedSteps ? '✅' : '❌'}
• Optimization: ${plannerSettings.enableOptimization ? '✅' : '❌'}

Usage:
• /plan enable - Enable automatic planning for complex queries
• /plan disable - Disable planning mode
• /plan "complex goal" - Force planning for a specific task
• /plan list - Show all existing plans
• /plan show <id> - Show details of a specific plan
• /plan execute <id> - Execute a plan
• /plan help - Show detailed help

Note: When enabled, planning automatically activates for implementation tasks.`,
      };
    }

    // Handle subcommands
    const [subcommand, ...rest] = trimmedArgs.split(' ');
    const remainingArgs = rest.join(' ');

    switch (subcommand.toLowerCase()) {
      case 'enable':
        services.config.setPlannerSettings({
          ...services.config.getPlannerSettings(),
          enabled: true,
        });
        return {
          type: 'message',
          messageType: 'info',
          content: '✅ Task Planning enabled. Complex goals will be broken down into structured plans.',
        };

      case 'disable':
        services.config.setPlannerSettings({
          ...services.config.getPlannerSettings(),
          enabled: false,
        });
        return {
          type: 'message',
          messageType: 'info',
          content: '❌ Task Planning disabled. Goals will use standard processing.',
        };

      case 'list':
        // This would list existing plans - stub for now
        return {
          type: 'message',
          messageType: 'info',
          content: 'Plan listing functionality will be implemented with plan persistence.',
        };

      case 'show':
        if (!remainingArgs) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Please specify a plan ID: /plan show <plan_id>',
          };
        }
        return {
          type: 'message',
          messageType: 'info',
          content: `Plan details for "${remainingArgs}" will be shown once plan persistence is implemented.`,
        };

      case 'execute':
        if (!remainingArgs) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Please specify a plan ID: /plan execute <plan_id>',
          };
        }
        return {
          type: 'message',
          messageType: 'info',
          content: `Plan execution for "${remainingArgs}" will be implemented with the execution engine.`,
        };

      case 'config':
      case 'settings':
        const settings = services.config.getPlannerSettings();
        return {
          type: 'message',
          messageType: 'info',
          content: `Task Planner Configuration:
• Enabled: ${settings.enabled ? '✅' : '❌'}
• Max Steps: ${settings.maxSteps}
• Max Dependency Depth: ${settings.maxDependencyDepth}
• Default Estimation: ${settings.defaultEstimation}
• Parallel Execution: ${settings.enableParallelExecution ? '✅' : '❌'}
• Auto Retry Failed Steps: ${settings.autoRetryFailedSteps ? '✅' : '❌'}
• Max Retries: ${settings.maxRetries}
• Step Timeout: ${settings.stepTimeout}ms
• Optimization: ${settings.enableOptimization ? '✅' : '❌'}
• Context Inheritance: ${settings.contextInheritance ? '✅' : '❌'}
• Preferred Tool Order: [${settings.preferredToolOrder?.join(', ') || 'None'}]`,
        };

      case 'help':
        return {
          type: 'message',
          messageType: 'info',
          content: `Task Planning Help:

Task Planning breaks down complex goals into structured, executable steps with:
1. 📋 **Plan Generation** - AI creates detailed step-by-step plans
2. ✅ **Validation** - Ensures plans are feasible and well-structured
3. 🔗 **Dependency Management** - Tracks prerequisites and execution order
4. ⚡ **Parallel Execution** - Runs independent steps simultaneously
5. 🔄 **Auto-retry** - Handles failures with intelligent retry logic
6. 📊 **Progress Tracking** - Real-time status and completion monitoring

Commands:
• /plan enable - Enable automatic planning for complex queries
• /plan disable - Disable planning mode  
• /plan "goal" - Force planning for a specific goal
• /plan list - Show all existing plans
• /plan show <id> - Show plan details
• /plan execute <id> - Execute a specific plan
• /plan config - Show configuration details

When planning is enabled, these queries automatically create structured plans:
• "Set up a new React application with TypeScript and testing"
• "Analyze this codebase and refactor for better performance"
• "Implement user authentication with OAuth and session management"
• "Debug and fix all failing tests in the project"

No need to prefix with /plan when mode is enabled!

Planning is ideal for:
- Multi-step feature implementations
- Complex debugging workflows
- Code refactoring projects
- System setup and configuration
- Research and analysis tasks`,
        };

      default:
        // Treat the entire args as a goal for task planning
        if (!services.config.getPlannerEnabled()) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Task Planning is disabled. Enable it with `/plan enable` first.',
          };
        }

        // Submit the goal as a regular prompt - planning will be automatic
        return {
          type: 'submit_prompt',
          content: trimmedArgs,
        };
    }
  },

  completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
    const suggestions = ['enable', 'disable', 'list', 'show', 'execute', 'config', 'settings', 'help'];
    
    if (!partialArg) {
      return suggestions;
    }

    const lowerPartial = partialArg.toLowerCase();
    return suggestions.filter(suggestion => 
      suggestion.toLowerCase().startsWith(lowerPartial)
    );
  },
};