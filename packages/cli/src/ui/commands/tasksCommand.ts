/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TaskPersistenceService,
  SessionRecoveryService,
  TaskStatus,
  getErrorMessage,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';

// Helper function to get services - these will be initialized from config
function getTaskServices(context: CommandContext) {
  const config = context.services.config;
  if (!config) {
    throw new Error('Configuration not available');
  }
  
  const persistenceService = new TaskPersistenceService(config);
  const recoveryService = new SessionRecoveryService(config, persistenceService);
  
  return { persistenceService, recoveryService };
}

// Helper function to format task status with colors/indicators
function formatTaskStatus(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.PENDING:
      return '⏳ Pending';
    case TaskStatus.IN_PROGRESS:
      return '🔄 In Progress';
    case TaskStatus.COMPLETED:
      return '✅ Completed';
    case TaskStatus.FAILED:
      return '❌ Failed';
    case TaskStatus.BLOCKED:
      return '🚫 Blocked';
    default:
      return '❓ Unknown';
  }
}

// Helper function to format duration
function formatDuration(start: Date, end?: Date): string {
  const endTime = end || new Date();
  const duration = endTime.getTime() - start.getTime();
  
  const hours = Math.floor(duration / (1000 * 60 * 60));
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((duration % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export const tasksCommand: SlashCommand = {
  name: 'tasks',
  description: 'Commands for managing agentic tasks.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      description: 'List all persisted tasks.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<void> => {
        try {
          const { persistenceService } = getTaskServices(context);
          const tasks = await persistenceService.getAllTasks();
          
          if (tasks.length === 0) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No persisted tasks found.',
              },
              Date.now(),
            );
            return;
          }
          
          // Format task list
          const taskList = tasks.map(task => {
            const status = formatTaskStatus(task.status);
            const duration = task.startedAt 
              ? formatDuration(task.startedAt, task.completedAt)
              : 'Not started';
            const progress = task.progress || 0;
            const subtaskCount = task.subtasks.length;
            const completedSubtasks = task.subtasks.filter(st => st.status === TaskStatus.COMPLETED).length;
            
            return `**${task.id}**
${status} | Progress: ${progress}% | Duration: ${duration}
Description: ${task.description || 'No description'}
Subtasks: ${completedSubtasks}/${subtaskCount} completed
Created: ${task.createdAt.toLocaleString()}
${task.error ? `⚠️ Last error: ${task.error.message}` : ''}`;
          }).join('\n\n---\n\n');
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `**Found ${tasks.length} task(s):**\n\n${taskList}`,
            },
            Date.now(),
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error listing tasks: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'status',
      description: 'Show detailed status of a specific task.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /tasks status <task-id>',
          };
        }
        
        const taskId = args.trim();
        
        try {
          const { persistenceService } = getTaskServices(context);
          const task = await persistenceService.loadTask(taskId);
          
          if (!task) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Task '${taskId}' not found.`,
            };
          }
          
          // Get latest checkpoint info
          const checkpoint = await persistenceService.loadLatestCheckpoint(taskId);
          
          // Format detailed status
          const status = formatTaskStatus(task.status);
          const duration = task.startedAt 
            ? formatDuration(task.startedAt, task.completedAt)
            : 'Not started';
          
          const subtaskDetails = task.subtasks.map(subtask => 
            `  • ${subtask.description}: ${formatTaskStatus(subtask.status)} (${subtask.progress || 0}%)`
          ).join('\n');
          
          const checkpointInfo = checkpoint 
            ? `Last checkpoint: ${checkpoint.timestamp.toLocaleString()}\nCheckpoint ID: ${checkpoint.checkpointId}`
            : 'No checkpoints available';
          
          const goalsInfo = task.goals.length > 0
            ? task.goals.map(goal => 
                `  • ${goal.description}: ${goal.validationResult?.success ? '✅' : '⏳'}`
              ).join('\n')
            : '  No goals defined';
          
          const errorInfo = task.error 
            ? `\n**Last Error:**\n${task.error.message}\nTime: ${task.error.timestamp.toLocaleString()}${task.error.details ? `\nDetails: ${task.error.details}` : ''}`
            : '';
          
          const statusText = `**Task Status: ${task.id}**

${status} | Progress: ${task.progress || 0}%
Duration: ${duration}
Created: ${task.createdAt.toLocaleString()}
${task.startedAt ? `Started: ${task.startedAt.toLocaleString()}` : ''}
${task.completedAt ? `Completed: ${task.completedAt.toLocaleString()}` : ''}

**Description:**
${task.description || 'No description provided'}

**Subtasks (${task.subtasks.length}):**
${subtaskDetails}

**Goals (${task.goals.length}):**
${goalsInfo}

**Checkpoints:**
${checkpointInfo}${errorInfo}`;
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: statusText,
            },
            Date.now(),
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error getting task status: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'resume',
      description: 'Resume an interrupted task from its latest checkpoint.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        const taskId = args.trim();
        
        if (!taskId) {
          // Show resumable tasks if no task ID provided
          try {
            const { persistenceService } = getTaskServices(context);
            const resumableTasks = await persistenceService.getResumableTasks();
            
            if (resumableTasks.length === 0) {
              return {
                type: 'message',
                messageType: 'info',
                content: 'No resumable tasks found. Use `/tasks list` to see all tasks.',
              };
            }
            
            const taskList = resumableTasks.map(task => 
              `• **${task.id}**: ${task.description || 'No description'} (${formatTaskStatus(task.status)})`
            ).join('\n');
            
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `**Resumable tasks:**\n${taskList}\n\nUse \`/tasks resume <task-id>\` to resume a specific task.`,
              },
              Date.now(),
            );
            return;
          } catch (error) {
            const errorMessage = getErrorMessage(error);
            return {
              type: 'message',
              messageType: 'error',
              content: `Error listing resumable tasks: ${errorMessage}`,
            };
          }
        }
        
        try {
          const { persistenceService, recoveryService } = getTaskServices(context);
          
          // Check if task exists and is resumable
          const task = await persistenceService.loadTask(taskId);
          if (!task) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Task '${taskId}' not found.`,
            };
          }
          
          if (task.status === TaskStatus.COMPLETED) {
            return {
              type: 'message',
              messageType: 'info',
              content: `Task '${taskId}' is already completed.`,
            };
          }
          
          // Check for interruptions and create recovery plan
          const interruptions = await recoveryService.detectInterruptions();
          const taskInterruption = interruptions.find(i => i.taskId === taskId);
          
          if (!taskInterruption) {
            return {
              type: 'message',
              messageType: 'error',
              content: `No interruption detected for task '${taskId}'. Task may not be resumable.`,
            };
          }
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Creating recovery plan for task '${taskId}'...`,
            },
            Date.now(),
          );
          
          const recoveryPlan = await recoveryService.createRecoveryPlan(taskInterruption);
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Recovery plan created:
Strategy: ${recoveryPlan.strategy}
Confidence: ${(recoveryPlan.confidence * 100).toFixed(1)}%
Estimated time: ${(recoveryPlan.estimatedRecoveryTime / 1000).toFixed(1)} seconds
${recoveryPlan.risks.length > 0 ? `⚠️ Risks: ${recoveryPlan.risks.join(', ')}` : ''}

Executing recovery...`,
            },
            Date.now(),
          );
          
          // Execute recovery
          const recoveryResult = await recoveryService.executeRecovery(recoveryPlan);
          
          if (recoveryResult.success) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `✅ Task '${taskId}' recovered successfully in ${recoveryResult.totalDuration}ms!
${recoveryResult.warnings.length > 0 ? `⚠️ Warnings: ${recoveryResult.warnings.join(', ')}` : ''}

Task is now ready to continue execution. You can check its status with \`/tasks status ${taskId}\`.`,
              },
              Date.now(),
            );
          } else {
            await recoveryService.cleanupFailedRecovery(taskId);
            return {
              type: 'message',
              messageType: 'error',
              content: `Failed to recover task '${taskId}': ${recoveryResult.error}\n${recoveryResult.warnings.length > 0 ? `Warnings: ${recoveryResult.warnings.join(', ')}` : ''}`,
            };
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error resuming task: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'abandon',
      description: 'Abandon a task and clean up its resources.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /tasks abandon <task-id>',
          };
        }
        
        const taskId = args.trim();
        
        try {
          const { persistenceService } = getTaskServices(context);
          
          // Check if task exists
          const task = await persistenceService.loadTask(taskId);
          if (!task) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Task '${taskId}' not found.`,
            };
          }
          
          // Confirm abandonment for important tasks
          if (task.status === TaskStatus.IN_PROGRESS || (task.subtasks.length > 0 && task.progress > 20)) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `⚠️ **Abandoning task '${taskId}'**

This will permanently delete the task and all its checkpoints.
Task status: ${formatTaskStatus(task.status)}
Progress: ${task.progress || 0}%
Created: ${task.createdAt.toLocaleString()}

Are you sure you want to continue? This action cannot be undone.
Run the command again with '--confirm' to proceed: \`/tasks abandon ${taskId} --confirm\``,
              },
              Date.now(),
            );
            
            // Check if user provided confirmation
            if (!args.includes('--confirm')) {
              return;
            }
          }
          
          // Perform deletion
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Abandoning task '${taskId}' and cleaning up resources...`,
            },
            Date.now(),
          );
          
          await persistenceService.deleteTask(taskId);
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `✅ Task '${taskId}' has been abandoned and all resources cleaned up.`,
            },
            Date.now(),
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error abandoning task: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'recover',
      description: 'Show recovery recommendations for interrupted tasks.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<void> => {
        try {
          const { recoveryService } = getTaskServices(context);
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: 'Analyzing interrupted tasks for recovery options...',
            },
            Date.now(),
          );
          
          const recommendations = await recoveryService.getRecoveryRecommendations();
          
          if (recommendations.length === 0) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No interrupted tasks found that require recovery.',
              },
              Date.now(),
            );
            return;
          }
          
          const recommendationText = recommendations.map(({ interruption, plan, recommendation }) => 
            `**Task: ${interruption.taskId}**
Interruption type: ${interruption.type}
Occurred: ${interruption.timestamp.toLocaleString()}
${recommendation}
Recovery steps: ${plan.steps.length}

Use \`/tasks resume ${interruption.taskId}\` to execute recovery.`
          ).join('\n\n---\n\n');
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `**Recovery Recommendations:**\n\n${recommendationText}`,
            },
            Date.now(),
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error generating recovery recommendations: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};