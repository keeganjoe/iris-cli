/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task, TaskStatus, TaskExecutionContext } from '../types/task.js';
import { 
  TaskCheckpoint, 
  CheckpointResult, 
  RetryDecision, 
  TaskError, 
  ToolCallRecord,
  ExecutionState,
  ProgressSnapshot
} from '../types/checkpoint.js';
import { TaskPersistenceService } from './taskPersistenceService.js';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Progress tracking event types
 */
export enum ProgressEventType {
  TaskStarted = 'task_started',
  SubtaskStarted = 'subtask_started',
  SubtaskProgress = 'subtask_progress',
  SubtaskCompleted = 'subtask_completed',
  SubtaskFailed = 'subtask_failed',
  CheckpointCreated = 'checkpoint_created',
  ProgressUpdate = 'progress_update',
  TimeEstimateUpdated = 'time_estimate_updated'
}

export interface ProgressEvent {
  type: ProgressEventType;
  taskId: string;
  timestamp: Date;
  data: any;
}

/**
 * Service for tracking task progress and managing checkpoints
 */
export class ProgressTracker {
  private activeTask?: Task;
  private executionContext?: TaskExecutionContext;
  private checkpointInterval: number;
  private checkpointTimer?: NodeJS.Timeout;
  private progressListeners: Set<(event: ProgressEvent) => void> = new Set();
  
  // Progress tracking state
  private subtaskStartTimes: Map<string, Date> = new Map();
  private subtaskDurations: number[] = [];
  private lastCheckpointTime: Date = new Date();
  private toolCallHistory: ToolCallRecord[] = [];

  constructor(
    private readonly config: Config,
    private readonly persistenceService: TaskPersistenceService,
    checkpointInterval: number = 30000 // 30 seconds default
  ) {
    this.checkpointInterval = checkpointInterval;
  }

  /**
   * Start tracking progress for a task
   */
  async startTracking(task: Task, executionContext: TaskExecutionContext): Promise<void> {
    console.log(`Starting progress tracking for task: ${task.id}`);
    
    this.activeTask = task;
    this.executionContext = executionContext;
    this.lastCheckpointTime = new Date();
    this.toolCallHistory = [];
    
    // Update task status
    this.activeTask.status = TaskStatus.IN_PROGRESS;
    this.activeTask.startedAt = new Date();
    
    // Save initial task state
    await this.persistenceService.saveTask(this.activeTask);
    
    // Start periodic checkpointing
    this.schedulePeriodicCheckpoints();
    
    // Emit task started event
    this.emitProgressEvent(ProgressEventType.TaskStarted, {
      task: this.activeTask,
      executionContext: this.executionContext
    });
    
    // Create initial checkpoint
    await this.createCheckpoint();
  }

  /**
   * Stop tracking progress and cleanup
   */
  async stopTracking(): Promise<void> {
    if (!this.activeTask) return;
    
    console.log(`Stopping progress tracking for task: ${this.activeTask.id}`);
    
    // Clear checkpoint timer
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = undefined;
    }
    
    // Create final checkpoint
    await this.createCheckpoint();
    
    // Save final task state
    if (this.activeTask) {
      await this.persistenceService.saveTask(this.activeTask);
    }
    
    // Clear state
    this.activeTask = undefined;
    this.executionContext = undefined;
    this.subtaskStartTimes.clear();
    this.toolCallHistory = [];
  }

  /**
   * Update progress for a specific subtask
   */
  async updateProgress(
    subtaskId: string, 
    progress: number, 
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.activeTask) {
      console.warn('No active task for progress update');
      return;
    }

    const subtask = this.activeTask.subtasks.find(st => st.id === subtaskId);
    if (!subtask) {
      console.warn(`Subtask ${subtaskId} not found in active task`);
      return;
    }

    // Update subtask progress
    const oldProgress = subtask.progress;
    subtask.progress = Math.min(100, Math.max(0, progress));
    
    // Update overall task progress
    this.updateOverallProgress();
    
    // Record timing data
    this.updateTimeEstimates();
    
    // Emit progress event
    this.emitProgressEvent(ProgressEventType.SubtaskProgress, {
      subtaskId,
      oldProgress,
      newProgress: subtask.progress,
      overallProgress: this.activeTask.progress,
      metadata
    });
    
    // Save task state if significant progress made
    if (subtask.progress - oldProgress >= 10) {
      await this.persistenceService.saveTask(this.activeTask);
    }
  }

  /**
   * Mark subtask as started
   */
  async startSubtask(subtaskId: string): Promise<void> {
    if (!this.activeTask) return;
    
    const subtask = this.activeTask.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return;
    
    // Record start time
    const startTime = new Date();
    this.subtaskStartTimes.set(subtaskId, startTime);
    
    // Update subtask state
    subtask.status = TaskStatus.IN_PROGRESS;
    subtask.startedAt = startTime;
    subtask.progress = 0;
    
    // Update execution context
    if (this.executionContext) {
      this.executionContext.currentSubtask = subtask;
    }
    
    console.log(`Started subtask: ${subtask.description}`);
    
    // Emit event
    this.emitProgressEvent(ProgressEventType.SubtaskStarted, {
      subtaskId,
      subtask,
      startTime
    });
  }

  /**
   * Mark subtask as completed
   */
  async completeSubtask(subtaskId: string, result?: any): Promise<void> {
    if (!this.activeTask) return;
    
    const subtask = this.activeTask.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return;
    
    const completionTime = new Date();
    const startTime = this.subtaskStartTimes.get(subtaskId);
    
    // Update subtask state
    subtask.status = TaskStatus.COMPLETED;
    subtask.completedAt = completionTime;
    subtask.progress = 100;
    
    // Record duration for time estimation
    if (startTime) {
      const duration = completionTime.getTime() - startTime.getTime();
      subtask.actualDuration = duration;
      this.subtaskDurations.push(duration);
      this.subtaskStartTimes.delete(subtaskId);
    }
    
    // Update overall progress
    this.updateOverallProgress();
    this.updateTimeEstimates();
    
    console.log(`Completed subtask: ${subtask.description}`);
    
    // Emit event
    this.emitProgressEvent(ProgressEventType.SubtaskCompleted, {
      subtaskId,
      subtask,
      result,
      completionTime
    });
    
    // Save progress
    await this.persistenceService.saveTask(this.activeTask);
    
    // Create checkpoint after completing subtask
    await this.createCheckpoint();
  }

  /**
   * Handle subtask failure
   */
  async handleSubtaskFailure(subtaskId: string, error: Error): Promise<RetryDecision> {
    if (!this.activeTask) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries: 0,
        reasoning: 'No active task'
      };
    }
    
    const subtask = this.activeTask.subtasks.find(st => st.id === subtaskId);
    if (!subtask) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries: 0,
        reasoning: 'Subtask not found'
      };
    }
    
    // Create error record
    const taskError: TaskError = {
      id: `error_${Date.now()}`,
      message: error.message,
      details: error.stack,
      subtaskId,
      stack: error.stack,
      timestamp: new Date(),
      recoverable: this.isRecoverableError(error),
      recoveryActions: this.generateRecoveryActions(error, subtask)
    };
    
    // Update subtask state
    subtask.status = TaskStatus.FAILED;
    subtask.error = {
      message: error.message,
      details: error.stack,
      timestamp: new Date(),
      retryCount: (subtask.error?.retryCount || 0) + 1
    };
    
    // Determine retry decision
    const retryDecision = this.determineRetryStrategy(taskError, subtask);
    
    console.log(`Subtask ${subtaskId} failed: ${error.message}`);
    console.log(`Retry decision: ${retryDecision.shouldRetry ? 'retry' : 'no retry'} - ${retryDecision.reasoning}`);
    
    // Emit event
    this.emitProgressEvent(ProgressEventType.SubtaskFailed, {
      subtaskId,
      error: taskError,
      retryDecision
    });
    
    // Save state
    await this.persistenceService.saveTask(this.activeTask);
    
    return retryDecision;
  }

  /**
   * Record a tool call execution
   */
  recordToolCall(toolCall: ToolCallRecord): void {
    this.toolCallHistory.push(toolCall);
    
    // Limit history size to prevent memory issues
    if (this.toolCallHistory.length > 1000) {
      this.toolCallHistory = this.toolCallHistory.slice(-800); // Keep last 800
    }
  }

  /**
   * Create a checkpoint of current task state
   */
  async createCheckpoint(): Promise<CheckpointResult> {
    if (!this.activeTask || !this.executionContext) {
      return {
        success: false,
        error: 'No active task to checkpoint',
        duration: 0
      };
    }

    try {
      const checkpoint: TaskCheckpoint = {
        taskId: this.activeTask.id,
        checkpointId: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        version: '1.0',
        
        taskSnapshot: {
          task: { ...this.activeTask },
          completedSubtasks: this.activeTask.subtasks
            .filter(st => st.status === TaskStatus.COMPLETED)
            .map(st => st.id),
          currentSubtask: this.executionContext.currentSubtask?.id,
          failedSubtasks: this.activeTask.subtasks
            .filter(st => st.status === TaskStatus.FAILED)
            .map(st => st.id)
        },
        
        executionState: this.captureExecutionState(),
        progress: this.captureProgressSnapshot(),
        errors: [], // TODO: Collect errors from task execution
        retryCount: 0,
        recoveryAttempts: [],
        
        metadata: {
          size: 0, // Will be calculated by persistence service
          checksum: '', // Will be calculated by persistence service
          restorable: true
        }
      };
      
      const result = await this.persistenceService.saveCheckpoint(checkpoint);
      
      if (result.success) {
        this.lastCheckpointTime = new Date();
        
        this.emitProgressEvent(ProgressEventType.CheckpointCreated, {
          checkpointId: checkpoint.checkpointId,
          size: result.size,
          duration: result.duration
        });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return {
        success: false,
        error: getErrorMessage(error),
        duration: 0
      };
    }
  }

  /**
   * Calculate estimated completion time
   */
  async calculateEstimatedCompletion(): Promise<number> {
    if (!this.activeTask) return 0;
    
    const completedSubtasks = this.activeTask.subtasks.filter(st => st.status === TaskStatus.COMPLETED);
    const remainingSubtasks = this.activeTask.subtasks.filter(
      st => st.status === TaskStatus.PENDING || st.status === TaskStatus.IN_PROGRESS
    );
    
    if (remainingSubtasks.length === 0) return 0;
    
    // Calculate average duration from completed subtasks
    let averageDuration = 0;
    if (this.subtaskDurations.length > 0) {
      averageDuration = this.subtaskDurations.reduce((sum, duration) => sum + duration, 0) / this.subtaskDurations.length;
    } else if (completedSubtasks.length > 0) {
      // Fallback to estimated durations
      const totalEstimated = completedSubtasks.reduce((sum, st) => sum + (st.estimatedDuration || 30000), 0);
      averageDuration = totalEstimated / completedSubtasks.length;
    } else {
      // Use default estimate
      averageDuration = 30000; // 30 seconds
    }
    
    // Estimate remaining time
    return remainingSubtasks.length * averageDuration;
  }

  /**
   * Add progress event listener
   */
  addProgressListener(listener: (event: ProgressEvent) => void): void {
    this.progressListeners.add(listener);
  }

  /**
   * Remove progress event listener
   */
  removeProgressListener(listener: (event: ProgressEvent) => void): void {
    this.progressListeners.delete(listener);
  }

  // Private helper methods

  private schedulePeriodicCheckpoints(): void {
    this.checkpointTimer = setInterval(async () => {
      await this.createCheckpoint();
    }, this.checkpointInterval);
  }

  private updateOverallProgress(): void {
    if (!this.activeTask) return;
    
    const totalSubtasks = this.activeTask.subtasks.length;
    if (totalSubtasks === 0) {
      this.activeTask.progress = 0;
      return;
    }
    
    const totalProgress = this.activeTask.subtasks.reduce((sum, st) => sum + st.progress, 0);
    this.activeTask.progress = Math.round(totalProgress / totalSubtasks);
  }

  private updateTimeEstimates(): void {
    if (!this.activeTask) return;
    
    // Update estimated completion time
    this.calculateEstimatedCompletion().then(estimatedTime => {
      if (this.activeTask) {
        this.emitProgressEvent(ProgressEventType.TimeEstimateUpdated, {
          estimatedTimeRemaining: estimatedTime,
          averageSubtaskDuration: this.subtaskDurations.length > 0 
            ? this.subtaskDurations.reduce((sum, dur) => sum + dur, 0) / this.subtaskDurations.length 
            : 30000
        });
      }
    });
  }

  private captureExecutionState(): ExecutionState {
    return {
      toolCallHistory: [...this.toolCallHistory],
      conversationContext: [], // TODO: Capture conversation context
      environmentState: {
        workingDirectory: this.config.getWorkingDir(),
        sessionId: this.config.getSessionId(),
        timestamp: new Date()
      },
      currentSubtaskId: this.executionContext?.currentSubtask?.id,
      currentStep: 0, // TODO: Track execution steps
      executionVariables: {}
    };
  }

  private captureProgressSnapshot(): ProgressSnapshot {
    if (!this.activeTask) {
      return {
        overallPercent: 0,
        subtaskProgress: {},
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
        averageSubtaskTime: 0,
        predictedCompletion: new Date()
      };
    }
    
    const elapsedTime = this.activeTask.startedAt 
      ? Date.now() - this.activeTask.startedAt.getTime()
      : 0;
    
    const subtaskProgress: Record<string, number> = {};
    this.activeTask.subtasks.forEach(st => {
      subtaskProgress[st.id] = st.progress;
    });
    
    const averageSubtaskTime = this.subtaskDurations.length > 0
      ? this.subtaskDurations.reduce((sum, dur) => sum + dur, 0) / this.subtaskDurations.length
      : 30000;
    
    const estimatedRemaining = this.calculateEstimatedCompletion();
    
    return {
      overallPercent: this.activeTask.progress,
      subtaskProgress,
      estimatedTimeRemaining: 0, // Will be set asynchronously
      elapsedTime,
      averageSubtaskTime,
      predictedCompletion: new Date(Date.now() + (estimatedRemaining as any)) // Type assertion needed for async result
    };
  }

  private emitProgressEvent(type: ProgressEventType, data: any): void {
    if (!this.activeTask) return;
    
    const event: ProgressEvent = {
      type,
      taskId: this.activeTask.id,
      timestamp: new Date(),
      data
    };
    
    this.progressListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  private isRecoverableError(error: Error): boolean {
    // Define recoverable error patterns
    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /rate limit/i,
      /temporary/i,
      /try again/i
    ];
    
    return recoverablePatterns.some(pattern => 
      pattern.test(error.message) || (error.stack && pattern.test(error.stack))
    );
  }

  private generateRecoveryActions(error: Error, subtask: any): string[] {
    const actions: string[] = [];
    
    if (/timeout/i.test(error.message)) {
      actions.push('Increase timeout duration');
      actions.push('Retry with exponential backoff');
    }
    
    if (/network/i.test(error.message)) {
      actions.push('Check network connectivity');
      actions.push('Retry request');
    }
    
    if (/rate limit/i.test(error.message)) {
      actions.push('Wait for rate limit reset');
      actions.push('Implement request throttling');
    }
    
    if (actions.length === 0) {
      actions.push('Manual intervention required');
    }
    
    return actions;
  }

  private determineRetryStrategy(error: TaskError, subtask: any): RetryDecision {
    const retryCount = subtask.error?.retryCount || 0;
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries,
        reasoning: 'Maximum retry attempts reached'
      };
    }
    
    if (!error.recoverable) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries,
        reasoning: 'Error is not recoverable'
      };
    }
    
    // Exponential backoff
    const baseDelay = 5000; // 5 seconds
    const retryDelay = baseDelay * Math.pow(2, retryCount);
    
    return {
      shouldRetry: true,
      retryDelay,
      maxRetries,
      reasoning: `Recoverable error, attempt ${retryCount + 1} of ${maxRetries}`
    };
  }
}