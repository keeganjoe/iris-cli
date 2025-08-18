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
 * Command to show current mode status and configuration.
 */
export const statusCommand: SlashCommand = {
  name: 'status',
  altNames: ['modes', 'state'],
  description: 'Show current ReAct and Planning mode status',
  kind: CommandKind.BUILT_IN,
  
  action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
    const { services } = context;
    
    if (!services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const reActEnabled = services.config.getReActEnabled();
    const plannerEnabled = services.config.getPlannerEnabled();
    const reActSettings = services.config.getReActSettings();
    const plannerSettings = services.config.getPlannerSettings();

    const status = `🎛️ **Agentic Mode Status**

**ReAct (Reasoning & Acting):**
• Status: ${reActEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
• Max Cycles: ${reActSettings.maxCycles}
• Auto Reflection: ${reActSettings.autoReflection ? '✅' : '❌'}
• Show Thoughts: ${reActSettings.showInternalThoughts ? '✅' : '❌'}

**Planning (Task Breakdown):**
• Status: ${plannerEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}  
• Max Steps: ${plannerSettings.maxSteps}
• Parallel Execution: ${plannerSettings.enableParallelExecution ? '✅' : '❌'}
• Auto Retry: ${plannerSettings.autoRetryFailedSteps ? '✅' : '❌'}

**Current Behavior:**
${reActEnabled && plannerEnabled ? 
  '🚀 Both modes active - queries will automatically use ReAct reasoning or structured planning based on content' :
  reActEnabled ? 
    '🧠 ReAct mode active - complex queries will use step-by-step reasoning' :
    plannerEnabled ?
      '📋 Planning mode active - implementation tasks will use structured planning' :
      '⚪ Standard mode - no automatic reasoning or planning'
}

**Quick Commands:**
• \`/react enable\` - Enable automatic reasoning
• \`/plan enable\` - Enable automatic planning  
• \`/react disable\` - Disable reasoning
• \`/plan disable\` - Disable planning`;

    return {
      type: 'message',
      messageType: 'info',
      content: status,
    };
  },
};