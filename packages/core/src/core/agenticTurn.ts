/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion } from '@google/genai';
import { Turn, ServerGeminiStreamEvent, GeminiEventType, ToolCallRequestInfo } from './turn.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { TaskPlannerService } from '../services/taskPlannerService.js';
import { TaskPersistenceService } from '../services/taskPersistenceService.js';
import { Task, TaskPlan, TaskStatus, TaskExecutionContext, TaskExecutionResult, SubTask, Goal } from '../types/task.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Event types specific to agentic execution
 */
export enum AgenticEventType {
  TaskPlanCreated = 'task_plan_created',
  TaskStarted = 'task_started',
  TaskProgress = 'task_progress', 
  TaskCompleted = 'task_completed',
  SubtaskStarted = 'subtask_started',
  SubtaskCompleted = 'subtask_completed',
  GoalAchieved = 'goal_achieved',
  PlanningError = 'planning_error',
  AgenticModeDisabled = 'agentic_mode_disabled'
}

/**
 * Agentic-specific stream events
 */
export type AgenticTaskPlanCreatedEvent = {
  type: AgenticEventType.TaskPlanCreated;
  value: {
    plan: TaskPlan;
    confidence: number;
    warnings: string[];
  };
};

export type AgenticTaskStartedEvent = {
  type: AgenticEventType.TaskStarted;
  value: {
    task: Task;
  };
};

export type AgenticTaskProgressEvent = {
  type: AgenticEventType.TaskProgress;
  value: {
    taskId: string;
    progress: number;
    currentSubtask?: string;
  };
};

export type AgenticTaskCompletedEvent = {
  type: AgenticEventType.TaskCompleted;
  value: {
    task: Task;
    result: TaskExecutionResult;
  };
};

export type AgenticSubtaskEvent = {
  type: AgenticEventType.SubtaskStarted | AgenticEventType.SubtaskCompleted;
  value: {
    taskId: string;
    subtaskId: string;
    subtaskDescription: string;
    progress?: number;
  };
};

export type AgenticGoalAchievedEvent = {
  type: AgenticEventType.GoalAchieved;
  value: {
    taskId: string;
    goalId: string;
    goalDescription: string;
  };
};

export type AgenticPlanningErrorEvent = {
  type: AgenticEventType.PlanningError;
  value: {
    error: string;
    fallbackToNormalMode: boolean;
  };
};

export type AgenticModeDisabledEvent = {
  type: AgenticEventType.AgenticModeDisabled;
  value: {
    reason: string;
  };
};

export type AgenticStreamEvent = 
  | AgenticTaskPlanCreatedEvent
  | AgenticTaskStartedEvent
  | AgenticTaskProgressEvent
  | AgenticTaskCompletedEvent
  | AgenticSubtaskEvent
  | AgenticGoalAchievedEvent
  | AgenticPlanningErrorEvent
  | AgenticModeDisabledEvent;

/**
 * Extended stream events that include both regular and agentic events
 */
export type ExtendedServerGeminiStreamEvent = ServerGeminiStreamEvent | AgenticStreamEvent;

/**
 * Enhanced Turn class with agentic planning and execution capabilities
 */
export class AgenticTurn {
  private baseTurn: Turn;
  private taskPlannerService: TaskPlannerService;
  private taskPersistenceService: TaskPersistenceService;
  private currentTask?: Task;
  private currentTaskPlan?: TaskPlan;
  private executionContext?: TaskExecutionContext;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
    private readonly config: Config
  ) {
    this.baseTurn = new Turn(chat, prompt_id);
    this.taskPlannerService = new TaskPlannerService(config);
    this.taskPersistenceService = new TaskPersistenceService(config);
  }

  // Delegate Turn properties
  get pendingToolCalls(): ToolCallRequestInfo[] {
    return this.baseTurn.pendingToolCalls;
  }

  get finishReason() {
    return this.baseTurn.finishReason;
  }

  getDebugResponses() {
    return this.baseTurn.getDebugResponses();
  }

  // Add missing properties for compatibility
  get debugResponses() {
    return this.baseTurn.getDebugResponses();
  }

  handlePendingFunctionCall(fnCall: any) {
    return (this.baseTurn as any).handlePendingFunctionCall(fnCall);
  }

  /**
   * Enhanced run method with task planning integration
   */
  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ExtendedServerGeminiStreamEvent> {
    // Check if agentic mode is enabled
    if (!this.config.getAgenticMode()) {
      yield {
        type: AgenticEventType.AgenticModeDisabled,
        value: { reason: 'Agentic mode is not enabled in configuration' }
      };
      
      // Fall back to regular Turn execution
      yield* this.baseTurn.run(req, signal);
      return;
    }

    const userMessage = this.extractUserMessage(req);
    
    // Determine if this request warrants task planning
    const shouldPlan = await this.shouldCreateTaskPlan(userMessage, signal);
    
    if (!shouldPlan) {
      console.log('AgenticTurn: Request does not require task planning, using normal execution');
      yield* this.baseTurn.run(req, signal);
      return;
    }

    try {
      // Create task plan
      console.log('AgenticTurn: Creating task plan for request:', userMessage);
      const planningResult = await this.taskPlannerService.createTaskPlan(
        userMessage,
        this.getConversationContext(),
        signal
      );

      yield {
        type: AgenticEventType.TaskPlanCreated,
        value: {
          plan: planningResult.plan,
          confidence: planningResult.confidence,
          warnings: planningResult.warnings
        }
      };

      // Execute the task plan
      yield* this.executeTaskPlan(planningResult.plan, signal);

    } catch (error) {
      console.error('AgenticTurn: Task planning failed:', error);
      
      yield {
        type: AgenticEventType.PlanningError,
        value: {
          error: getErrorMessage(error),
          fallbackToNormalMode: true
        }
      };

      // Fall back to normal execution
      console.log('AgenticTurn: Falling back to normal execution');
      yield* this.baseTurn.run(req, signal);
    }
  }

  /**
   * Execute a task plan step by step
   */
  private async *executeTaskPlan(
    plan: TaskPlan,
    signal: AbortSignal
  ): AsyncGenerator<ExtendedServerGeminiStreamEvent> {
    this.currentTask = plan.task;
    this.currentTaskPlan = plan;

    // Initialize execution context
    this.executionContext = {
      task: plan.task,
      plan,
      sessionId: this.config.getSessionId(),
      executionStartTime: new Date(),
      resourceLimits: {
        maxTokens: plan.resourceEstimates.totalTokens,
        maxDuration: plan.resourceEstimates.totalDuration,
        maxMemoryMB: plan.resourceEstimates.memoryRequirement
      },
      callbacks: {
        onProgress: (progress, subtaskId) => this.updateProgress(progress, subtaskId),
        onSubtaskComplete: (subtaskId, result) => this.onSubtaskComplete(subtaskId, result),
        onError: (error, subtaskId) => this.onExecutionError(error, subtaskId)
      }
    };

    yield {
      type: AgenticEventType.TaskStarted,
      value: { task: plan.task }
    };

    // Update task status
    this.currentTask.status = TaskStatus.IN_PROGRESS;
    this.currentTask.startedAt = new Date();

    // Persist the task to file system
    try {
      await this.taskPersistenceService.saveTask(this.currentTask);
      console.log(`AgenticTurn: Task ${this.currentTask.id} persisted successfully`);
    } catch (error) {
      console.error(`AgenticTurn: Failed to persist task ${this.currentTask.id}:`, error);
    }

    try {
      // Execute subtasks based on dependency order
      const executionOrder = this.calculateExecutionOrder(plan);
      
      for (const subtaskId of executionOrder) {
        if (signal.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        const subtask = plan.task.subtasks.find(st => st.id === subtaskId);
        if (!subtask) continue;

        yield* this.executeSubtask(subtask, signal);
      }

      // Validate goals after execution
      yield* this.validateGoals(signal);

      // Mark task as completed
      this.currentTask.status = TaskStatus.COMPLETED;
      this.currentTask.completedAt = new Date();
      this.currentTask.progress = 100;

      const executionResult: TaskExecutionResult = this.createExecutionResult(true);
      
      yield {
        type: AgenticEventType.TaskCompleted,
        value: {
          task: this.currentTask,
          result: executionResult
        }
      };

    } catch (error) {
      console.error('AgenticTurn: Task execution failed:', error);
      
      this.currentTask.status = TaskStatus.FAILED;
      this.currentTask.error = {
        message: getErrorMessage(error),
        timestamp: new Date()
      };

      const executionResult: TaskExecutionResult = this.createExecutionResult(false, error);
      
      yield {
        type: AgenticEventType.TaskCompleted,
        value: {
          task: this.currentTask,
          result: executionResult
        }
      };
    }
  }

  /**
   * Execute a single subtask
   */
  private async *executeSubtask(
    subtask: SubTask,
    signal: AbortSignal
  ): AsyncGenerator<ExtendedServerGeminiStreamEvent> {
    console.log(`AgenticTurn: Starting subtask: ${subtask.description}`);
    
    if (this.currentTask) {
      yield {
        type: AgenticEventType.SubtaskStarted,
        value: {
          taskId: this.currentTask.id,
          subtaskId: subtask.id,
          subtaskDescription: subtask.description
        }
      };
    }

    subtask.status = TaskStatus.IN_PROGRESS;
    subtask.startedAt = new Date();
    if (this.executionContext) {
      this.executionContext.currentSubtask = subtask;
    }

    try {
      // Convert subtask to natural language instruction
      const instruction = this.convertSubtaskToInstruction(subtask);
      
      // Execute using normal Turn mechanism
      const regularTurnEvents = this.baseTurn.run([{ text: instruction }], signal);
      
      for await (const event of regularTurnEvents) {
        yield event;
        
        // Track tool calls for this subtask
        if (event.type === GeminiEventType.ToolCallRequest) {
          // We could add subtask-specific tool call tracking here
        }
      }

      // Mark subtask as completed
      subtask.status = TaskStatus.COMPLETED;
      subtask.completedAt = new Date();
      subtask.progress = 100;

      if (this.currentTask) {
        yield {
          type: AgenticEventType.SubtaskCompleted,
          value: {
            taskId: this.currentTask.id,
            subtaskId: subtask.id,
            subtaskDescription: subtask.description,
            progress: 100
          }
        };
      }

      // Update overall task progress
      this.updateTaskProgress();

    } catch (error) {
      subtask.status = TaskStatus.FAILED;
      subtask.error = {
        message: getErrorMessage(error),
        timestamp: new Date(),
        retryCount: 0
      };

      console.error(`AgenticTurn: Subtask ${subtask.id} failed:`, error);
      throw error; // Propagate error to task level
    }
  }

  /**
   * Validate all task goals
   */
  private async *validateGoals(signal: AbortSignal): AsyncGenerator<ExtendedServerGeminiStreamEvent> {
    if (!this.currentTask) return;

    for (const goal of this.currentTask.goals) {
      try {
        const isAchieved = await this.validateGoal(goal, signal);
        
        if (isAchieved) {
          goal.achieved = true;
          goal.validationResult = {
            success: true,
            details: 'Goal validation passed',
            timestamp: new Date()
          };

          yield {
            type: AgenticEventType.GoalAchieved,
            value: {
              taskId: this.currentTask.id,
              goalId: goal.id,
              goalDescription: goal.description
            }
          };
        }
      } catch (error) {
        console.warn(`AgenticTurn: Goal validation failed for ${goal.id}:`, error);
        goal.validationResult = {
          success: false,
          details: getErrorMessage(error),
          timestamp: new Date()
        };
      }
    }
  }

  // Helper methods

  private extractUserMessage(req: PartListUnion): string {
    if (Array.isArray(req)) {
      return req.map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) return part.text || '';
        return JSON.stringify(part);
      }).join(' ');
    }
    if (typeof req === 'string') return req;
    if (typeof req === 'object' && req !== null && 'text' in req) return req.text || '';
    return JSON.stringify(req);
  }

  private async shouldCreateTaskPlan(userMessage: string, signal: AbortSignal): Promise<boolean> {
    // Simple heuristics for now - could be enhanced with LLM-based decision
    const complexityIndicators = [
      'create', 'build', 'implement', 'develop', 'set up', 'configure',
      'install', 'deploy', 'test', 'fix', 'refactor', 'optimize'
    ];

    const multiStepIndicators = [
      'and then', 'after that', 'next', 'followed by', 'also', 'additionally',
      'first', 'second', 'finally', 'steps', 'multiple', 'several'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const hasComplexity = complexityIndicators.some(indicator => lowerMessage.includes(indicator));
    const hasMultiStep = multiStepIndicators.some(indicator => lowerMessage.includes(indicator));
    const isLongRequest = userMessage.length > 100;

    return hasComplexity && (hasMultiStep || isLongRequest);
  }

  private getConversationContext(): string {
    // Extract recent conversation context
    const history = this.chat.getHistory(); // Access chat history
    const recentHistory = history.slice(-5); // Last 5 exchanges
    
    return recentHistory.map((content: any) => {
      const role = content.role === 'model' ? 'assistant' : content.role;
      const text = content.parts?.map((p: any) => p.text).join(' ') || '';
      return `${role}: ${text}`;
    }).join('\n');
  }

  private calculateExecutionOrder(plan: TaskPlan): string[] {
    // Simple topological sort based on dependencies
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (subtaskId: string): void => {
      if (visiting.has(subtaskId)) {
        console.warn(`Circular dependency detected for subtask ${subtaskId}`);
        return;
      }
      if (visited.has(subtaskId)) return;

      visiting.add(subtaskId);
      
      const dependencies = plan.dependencyGraph[subtaskId] || [];
      for (const depId of dependencies) {
        visit(depId);
      }
      
      visiting.delete(subtaskId);
      visited.add(subtaskId);
      result.push(subtaskId);
    };

    for (const subtask of plan.task.subtasks) {
      visit(subtask.id);
    }

    return result;
  }

  private convertSubtaskToInstruction(subtask: SubTask): string {
    let instruction = subtask.description;
    
    if (subtask.context && Object.keys(subtask.context).length > 0) {
      instruction += `\n\nContext: ${JSON.stringify(subtask.context, null, 2)}`;
    }
    
    if (subtask.requiredTools.length > 0) {
      instruction += `\n\nUse these tools as needed: ${subtask.requiredTools.join(', ')}`;
    }

    return instruction;
  }

  private updateProgress(progress: number, subtaskId?: string): void {
    if (subtaskId && this.currentTask) {
      const subtask = this.currentTask.subtasks.find(st => st.id === subtaskId);
      if (subtask) {
        subtask.progress = progress;
      }
    }
    this.updateTaskProgress();
  }

  private updateTaskProgress(): void {
    if (!this.currentTask) return;

    const totalSubtasks = this.currentTask.subtasks.length;
    if (totalSubtasks === 0) return;

    const totalProgress = this.currentTask.subtasks.reduce((sum, st) => sum + st.progress, 0);
    this.currentTask.progress = Math.round(totalProgress / totalSubtasks);
  }

  private onSubtaskComplete(subtaskId: string, result: unknown): void {
    console.log(`AgenticTurn: Subtask ${subtaskId} completed with result:`, result);
  }

  private onExecutionError(error: Error, subtaskId?: string): void {
    console.error(`AgenticTurn: Execution error${subtaskId ? ` in subtask ${subtaskId}` : ''}:`, error);
  }

  private async validateGoal(goal: Goal, signal: AbortSignal): Promise<boolean> {
    // Basic goal validation - could be enhanced with tool-based validation
    switch (goal.validationMethod) {
      case 'llm_evaluation':
        return this.validateGoalWithLLM(goal, signal);
      case 'file_verification':
        return this.validateGoalWithFileCheck(goal);
      case 'tool_execution':
        return this.validateGoalWithTool(goal, signal);
      default:
        console.warn(`Unsupported validation method: ${goal.validationMethod}`);
        return true; // Assume success for unsupported methods
    }
  }

  private async validateGoalWithLLM(goal: Goal, signal: AbortSignal): Promise<boolean> {
    try {
      const validationPrompt = `
Evaluate whether this goal has been achieved based on the conversation context:

Goal: ${goal.description}
Success Criteria: ${goal.successCriteria.description}
Conditions to check: ${goal.successCriteria.conditions.join(', ')}

Recent conversation context:
${this.getConversationContext()}

Respond with a JSON object:
{
  "achieved": true/false,
  "reasoning": "explanation of why the goal was or wasn't achieved",
  "evidence": "specific evidence from the context"
}`;

      const response = await this.config.getGeminiClient().generateJson(
        [{ role: 'user', parts: [{ text: validationPrompt }] }],
        {
          type: 'object',
          properties: {
            achieved: { type: 'boolean' },
            reasoning: { type: 'string' },
            evidence: { type: 'string' }
          },
          required: ['achieved']
        },
        signal
      );

      return response.achieved as boolean || false;
    } catch (error) {
      console.warn('Goal validation with LLM failed:', error);
      return false;
    }
  }

  private async validateGoalWithFileCheck(goal: Goal): Promise<boolean> {
    // TODO: Implement file-based validation
    // This would check if specific files exist or contain expected content
    console.warn('File validation not yet implemented');
    return true;
  }

  private async validateGoalWithTool(goal: Goal, signal: AbortSignal): Promise<boolean> {
    // TODO: Implement tool-based validation
    // This would execute specific tools to verify goal achievement
    console.warn('Tool-based validation not yet implemented');
    return true;
  }

  private createExecutionResult(success: boolean, error?: unknown): TaskExecutionResult {
    if (!this.currentTask) {
      throw new Error('Cannot create execution result without current task');
    }

    const endTime = new Date();
    const totalDuration = this.currentTask.startedAt ? 
      endTime.getTime() - this.currentTask.startedAt.getTime() : 0;

    return {
      success,
      task: this.currentTask,
      summary: {
        totalDuration,
        completedSubtasks: this.currentTask.subtasks.filter(st => st.status === TaskStatus.COMPLETED).length,
        failedSubtasks: this.currentTask.subtasks.filter(st => st.status === TaskStatus.FAILED).length,
        goalsAchieved: this.currentTask.goals.filter(g => g.achieved).length,
        resourcesUsed: {
          tokens: 0, // TODO: Track actual token usage
          toolCalls: this.pendingToolCalls.length,
          memoryMB: 0 // TODO: Track actual memory usage
        }
      },
      subtaskResults: this.currentTask.subtasks.map(st => ({
        subtaskId: st.id,
        result: st.context,
        error: st.error ? new Error(st.error.message) : undefined
      })),
      error: error ? (error instanceof Error ? error : new Error(String(error))) : undefined
    };
  }
}