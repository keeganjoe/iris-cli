/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { Task, TaskStatus } from '../types/task.js';
import { 
  InterruptionInfo, 
  RecoveryPlan, 
  RecoveryStep, 
  TaskCheckpoint,
  RestoreResult
} from '../types/checkpoint.js';
import { TaskPersistenceService } from './taskPersistenceService.js';
import { getErrorMessage } from '../utils/errors.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RESUME = 'resume',
  RESTART = 'restart',
  MODIFY_AND_RESUME = 'modify_and_resume',
  ALTERNATIVE_APPROACH = 'alternative_approach'
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  strategy: 'resume' | 'restart' | 'modify_and_resume' | 'alternative_approach';
  restoredTask?: Task;
  error?: string;
  warnings: string[];
  steps: Array<{
    step: RecoveryStep;
    success: boolean;
    duration: number;
    error?: string;
  }>;
  totalDuration: number;
}

/**
 * Service for recovering from session interruptions and restoring task state
 */
export class SessionRecoveryService {
  constructor(
    private readonly config: Config,
    private readonly persistenceService: TaskPersistenceService
  ) {}

  /**
   * Detect any interruptions that occurred in previous sessions
   */
  async detectInterruptions(): Promise<InterruptionInfo[]> {
    try {
      console.log('Detecting session interruptions...');
      
      const interruptions: InterruptionInfo[] = [];
      
      // Look for tasks that were in progress but session ended
      const resumableTasks = await this.persistenceService.getResumableTasks();
      
      for (const task of resumableTasks) {
        if (task.status === TaskStatus.IN_PROGRESS) {
          // Check if there's a recent checkpoint
          const latestCheckpoint = await this.persistenceService.loadLatestCheckpoint(task.id);
          
          const interruption: InterruptionInfo = {
            type: 'system_error', // Assume system error for in-progress tasks
            timestamp: latestCheckpoint?.timestamp || task.startedAt || new Date(),
            taskId: task.id,
            subtaskId: this.getCurrentSubtaskId(task),
            systemState: await this.captureSystemState(),
            recoverable: this.assessRecoverability(task, latestCheckpoint)
          };
          
          interruptions.push(interruption);
        }
      }
      
      console.log(`Detected ${interruptions.length} interruptions`);
      return interruptions;
    } catch (error) {
      console.error('Failed to detect interruptions:', error);
      return [];
    }
  }

  /**
   * Create a recovery plan for an interruption
   */
  async createRecoveryPlan(interruption: InterruptionInfo): Promise<RecoveryPlan> {
    try {
      console.log(`Creating recovery plan for task ${interruption.taskId}`);
      
      // Load task and checkpoint data
      const task = await this.persistenceService.loadTask(interruption.taskId);
      const checkpoint = await this.persistenceService.loadLatestCheckpoint(interruption.taskId);
      
      if (!task) {
        throw new Error(`Task ${interruption.taskId} not found`);
      }
      
      // Determine recovery strategy
      const strategy = this.determineRecoveryStrategy(interruption, task, checkpoint);
      
      // Generate recovery steps
      const steps = this.generateRecoverySteps(strategy, task, checkpoint, interruption);
      
      // Calculate estimates
      const estimatedTime = steps.reduce((total, step) => total + step.estimatedTime, 0);
      const confidence = this.calculateRecoveryConfidence(strategy, task, checkpoint);
      const risks = this.identifyRecoveryRisks(strategy, task, checkpoint);
      
      const recoveryPlan: RecoveryPlan = {
        interruptionId: `interruption_${interruption.taskId}_${Date.now()}`,
        strategy,
        steps,
        estimatedRecoveryTime: estimatedTime,
        confidence,
        risks
      };
      
      console.log(`Recovery plan created: ${strategy} (confidence: ${(confidence * 100).toFixed(1)}%)`);
      return recoveryPlan;
    } catch (error) {
      console.error('Failed to create recovery plan:', error);
      throw new Error(`Recovery plan creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute a recovery plan
   */
  async executeRecovery(plan: RecoveryPlan): Promise<RecoveryResult> {
    const startTime = Date.now();
    const stepResults: RecoveryResult['steps'] = [];
    let restoredTask: Task | undefined;
    const warnings: string[] = [];
    
    console.log(`Executing recovery plan: ${plan.strategy}`);
    
    try {
      for (const step of plan.steps) {
        const stepStartTime = Date.now();
        
        try {
          console.log(`Executing recovery step: ${step.description}`);
          
          const stepResult = await this.executeRecoveryStep(step);
          const stepDuration = Date.now() - stepStartTime;
          
          stepResults.push({
            step,
            success: stepResult.success,
            duration: stepDuration,
            error: stepResult.error
          });
          
          if (!stepResult.success && step.critical) {
            throw new Error(`Critical recovery step failed: ${stepResult.error}`);
          }
          
          if (!stepResult.success) {
            warnings.push(`Non-critical step failed: ${step.description} - ${stepResult.error}`);
          }
          
          // Capture restored task if this step produced one
          if (stepResult.restoredTask) {
            restoredTask = stepResult.restoredTask;
          }
          
        } catch (error) {
          const stepDuration = Date.now() - stepStartTime;
          stepResults.push({
            step,
            success: false,
            duration: stepDuration,
            error: getErrorMessage(error)
          });
          
          if (step.critical) {
            throw error;
          } else {
            warnings.push(`Step failed but continuing: ${step.description} - ${getErrorMessage(error)}`);
          }
        }
      }
      
      const totalDuration = Date.now() - startTime;
      
      console.log(`Recovery completed successfully in ${totalDuration}ms`);
      
      return {
        success: true,
        strategy: plan.strategy,
        restoredTask,
        warnings,
        steps: stepResults,
        totalDuration
      };
      
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      
      console.error('Recovery execution failed:', error);
      
      return {
        success: false,
        strategy: plan.strategy,
        error: getErrorMessage(error),
        warnings,
        steps: stepResults,
        totalDuration
      };
    }
  }

  /**
   * Clean up resources from a failed recovery attempt
   */
  async cleanupFailedRecovery(taskId: string): Promise<void> {
    try {
      console.log(`Cleaning up failed recovery for task ${taskId}`);
      
      // Load the task to check its state
      const task = await this.persistenceService.loadTask(taskId);
      if (!task) {
        console.warn(`Task ${taskId} not found for cleanup`);
        return;
      }
      
      // Reset task status if it's in an inconsistent state
      if (task.status === TaskStatus.IN_PROGRESS) {
        task.status = TaskStatus.FAILED;
        task.error = {
          message: 'Recovery failed - task marked as failed',
          timestamp: new Date()
        };
        
        await this.persistenceService.saveTask(task);
      }
      
      // Clean up any temporary files or resources
      await this.cleanupTempResources(taskId);
      
      console.log(`Cleanup completed for task ${taskId}`);
    } catch (error) {
      console.error(`Failed to cleanup task ${taskId}:`, error);
    }
  }

  /**
   * Get recovery recommendations for all detected interruptions
   */
  async getRecoveryRecommendations(): Promise<Array<{
    interruption: InterruptionInfo;
    plan: RecoveryPlan;
    recommendation: string;
  }>> {
    const interruptions = await this.detectInterruptions();
    const recommendations = [];
    
    for (const interruption of interruptions) {
      try {
        const plan = await this.createRecoveryPlan(interruption);
        const recommendation = this.generateRecommendationText(plan, interruption);
        
        recommendations.push({
          interruption,
          plan,
          recommendation
        });
      } catch (error) {
        console.error(`Failed to create recovery plan for ${interruption.taskId}:`, error);
      }
    }
    
    return recommendations;
  }

  // Private helper methods

  private getCurrentSubtaskId(task: Task): string | undefined {
    return task.subtasks.find(st => st.status === TaskStatus.IN_PROGRESS)?.id;
  }

  private async captureSystemState(): Promise<Record<string, unknown>> {
    return {
      timestamp: new Date().toISOString(),
      workingDirectory: this.config.getWorkingDir(),
      sessionId: this.config.getSessionId(),
      nodeVersion: process.version,
      platform: process.platform,
      // Add more system state as needed
    };
  }

  private assessRecoverability(task: Task, checkpoint: TaskCheckpoint | null): boolean {
    // Task is recoverable if:
    // 1. It has a recent checkpoint
    // 2. No critical errors in subtasks
    // 3. System state seems consistent
    
    if (!checkpoint) {
      return false; // No checkpoint to recover from
    }
    
    const checkpointAge = Date.now() - new Date(checkpoint.timestamp).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (checkpointAge > maxAge) {
      return false; // Checkpoint too old
    }
    
    // Check for critical failures
    const criticalFailures = task.subtasks.some(st => 
      st.status === TaskStatus.FAILED && 
      st.error && 
      !st.error.message.includes('recoverable')
    );
    
    return !criticalFailures;
  }

  private determineRecoveryStrategy(
    interruption: InterruptionInfo,
    task: Task,
    checkpoint: TaskCheckpoint | null
  ): RecoveryStrategy {
    // Strategy selection logic based on interruption type and task state
    
    if (!checkpoint) {
      return RecoveryStrategy.RESTART;
    }
    
    if (interruption.type === 'user_cancelled') {
      return RecoveryStrategy.RESUME; // User can resume where they left off
    }
    
    if (interruption.type === 'timeout') {
      return RecoveryStrategy.MODIFY_AND_RESUME; // Adjust timeouts and resume
    }
    
    if (interruption.type === 'system_error') {
      const checkpointAge = Date.now() - new Date(checkpoint.timestamp).getTime();
      if (checkpointAge < 5 * 60 * 1000) { // Less than 5 minutes
        return RecoveryStrategy.RESUME;
      } else {
        return RecoveryStrategy.RESTART;
      }
    }
    
    if (interruption.type === 'resource_exhausted') {
      return RecoveryStrategy.ALTERNATIVE_APPROACH;
    }
    
    return RecoveryStrategy.ALTERNATIVE_APPROACH;
  }

  private generateRecoverySteps(
    strategy: RecoveryStrategy,
    task: Task,
    checkpoint: TaskCheckpoint | null,
    interruption: InterruptionInfo
  ): RecoveryStep[] {
    const steps: RecoveryStep[] = [];
    
    // Common initial validation step
    steps.push({
      id: 'validate_system_state',
      description: 'Validate system state and prerequisites',
      type: 'validate_state',
      parameters: {
        workingDirectory: this.config.getWorkingDir(),
        taskId: task.id
      },
      critical: true,
      estimatedTime: 2000
    });
    
    switch (strategy) {
      case RecoveryStrategy.RESUME:
        if (checkpoint) {
          steps.push({
            id: 'restore_checkpoint',
            description: 'Restore task from checkpoint',
            type: 'restore_checkpoint',
            parameters: {
              checkpointId: checkpoint.checkpointId,
              taskId: task.id
            },
            critical: true,
            estimatedTime: 5000
          });
        }
        break;
        
      case RecoveryStrategy.RESTART:
        steps.push({
          id: 'cleanup_resources',
          description: 'Clean up previous execution resources',
          type: 'cleanup_resources',
          parameters: {
            taskId: task.id
          },
          critical: false,
          estimatedTime: 3000
        });
        
        steps.push({
          id: 'reset_task_state',
          description: 'Reset task to initial state',
          type: 'modify_plan',
          parameters: {
            taskId: task.id,
            resetToInitial: true
          },
          critical: true,
          estimatedTime: 2000
        });
        break;
        
      case RecoveryStrategy.MODIFY_AND_RESUME:
        if (checkpoint) {
          steps.push({
            id: 'restore_checkpoint',
            description: 'Restore task from checkpoint',
            type: 'restore_checkpoint',
            parameters: {
              checkpointId: checkpoint.checkpointId,
              taskId: task.id
            },
            critical: true,
            estimatedTime: 5000
          });
          
          steps.push({
            id: 'modify_parameters',
            description: 'Modify task parameters for recovery',
            type: 'modify_plan',
            parameters: {
              taskId: task.id,
              modifications: this.getParameterModifications(interruption)
            },
            critical: false,
            estimatedTime: 3000
          });
        }
        break;
        
      case RecoveryStrategy.ALTERNATIVE_APPROACH:
        steps.push({
          id: 'analyze_alternatives',
          description: 'Analyze alternative execution approaches',
          type: 'modify_plan',
          parameters: {
            taskId: task.id,
            generateAlternatives: true
          },
          critical: true,
          estimatedTime: 10000
        });
        break;
    }
    
    return steps;
  }

  private async executeRecoveryStep(step: RecoveryStep): Promise<{
    success: boolean;
    error?: string;
    restoredTask?: Task;
  }> {
    try {
      switch (step.type) {
        case 'validate_state':
          return await this.validateSystemState(step.parameters);
          
        case 'restore_checkpoint':
          return await this.restoreFromCheckpoint(step.parameters);
          
        case 'cleanup_resources':
          return await this.cleanupResources(step.parameters);
          
        case 'modify_plan':
          return await this.modifyTaskPlan(step.parameters);
          
        case 'retry_subtask':
          return await this.retrySubtask(step.parameters);
          
        default:
          return {
            success: false,
            error: `Unknown recovery step type: ${step.type}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  private async validateSystemState(parameters: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Validate working directory exists
    const workingDir = parameters.workingDirectory as string;
    try {
      await fs.access(workingDir);
    } catch {
      return {
        success: false,
        error: `Working directory not accessible: ${workingDir}`
      };
    }
    
    // Additional validation logic here
    return { success: true };
  }

  private async restoreFromCheckpoint(parameters: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
    restoredTask?: Task;
  }> {
    const checkpointId = parameters.checkpointId as string;
    
    const restoreResult = await this.persistenceService.restoreFromCheckpoint(checkpointId);
    
    return {
      success: restoreResult.success,
      error: restoreResult.error,
      restoredTask: restoreResult.task
    };
  }

  private async cleanupResources(parameters: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
  }> {
    const taskId = parameters.taskId as string;
    await this.cleanupTempResources(taskId);
    return { success: true };
  }

  private async modifyTaskPlan(parameters: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
    restoredTask?: Task;
  }> {
    const taskId = parameters.taskId as string;
    const task = await this.persistenceService.loadTask(taskId);
    
    if (!task) {
      return {
        success: false,
        error: 'Task not found for modification'
      };
    }
    
    if (parameters.resetToInitial) {
      // Reset all subtasks to pending
      task.subtasks.forEach(st => {
        st.status = TaskStatus.PENDING;
        st.progress = 0;
        st.startedAt = undefined;
        st.completedAt = undefined;
        st.error = undefined;
      });
      
      task.status = TaskStatus.PENDING;
      task.progress = 0;
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.error = undefined;
      
      await this.persistenceService.saveTask(task);
    }
    
    return {
      success: true,
      restoredTask: task
    };
  }

  private async retrySubtask(parameters: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Implementation for retrying a specific subtask
    return { success: true };
  }

  private async cleanupTempResources(taskId: string): Promise<void> {
    // Clean up any temporary files or resources associated with the task
    const tempDir = path.join(this.config.getGeminiDir(), 'temp', taskId);
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors - temp directory might not exist
    }
  }

  private calculateRecoveryConfidence(
    strategy: RecoveryStrategy,
    task: Task,
    checkpoint: TaskCheckpoint | null
  ): number {
    let confidence = 0.5; // Base confidence
    
    if (checkpoint) {
      const checkpointAge = Date.now() - new Date(checkpoint.timestamp).getTime();
      const maxAge = 60 * 60 * 1000; // 1 hour
      confidence += 0.3 * (1 - Math.min(checkpointAge / maxAge, 1));
    }
    
    if (strategy === RecoveryStrategy.RESUME) {
      confidence += 0.2;
    }
    
    const completedRatio = task.subtasks.filter(st => st.status === TaskStatus.COMPLETED).length / task.subtasks.length;
    confidence += completedRatio * 0.2;
    
    return Math.min(confidence, 1.0);
  }

  private identifyRecoveryRisks(
    strategy: RecoveryStrategy,
    task: Task,
    checkpoint: TaskCheckpoint | null
  ): string[] {
    const risks: string[] = [];
    
    if (!checkpoint) {
      risks.push('No checkpoint available - may lose progress');
    }
    
    if (checkpoint) {
      const age = Date.now() - new Date(checkpoint.timestamp).getTime();
      if (age > 2 * 60 * 60 * 1000) { // 2 hours
        risks.push('Checkpoint is relatively old - system state may have changed');
      }
    }
    
    if (strategy === RecoveryStrategy.RESTART) {
      risks.push('All progress will be lost');
    }
    
    const failedSubtasks = task.subtasks.filter(st => st.status === TaskStatus.FAILED);
    if (failedSubtasks.length > 0) {
      risks.push(`${failedSubtasks.length} subtasks previously failed`);
    }
    
    return risks;
  }

  private getParameterModifications(interruption: InterruptionInfo): Record<string, unknown> {
    const modifications: Record<string, unknown> = {};
    
    if (interruption.type === 'timeout') {
      modifications.increaseTimeouts = true;
      modifications.timeoutMultiplier = 2;
    }
    
    if (interruption.type === 'resource_exhausted') {
      modifications.reduceParallelism = true;
      modifications.enableResourceThrottling = true;
    }
    
    return modifications;
  }

  private generateRecommendationText(plan: RecoveryPlan, interruption: InterruptionInfo): string {
    const confidence = (plan.confidence * 100).toFixed(1);
    const strategy = plan.strategy.replace(/_/g, ' ').toLowerCase();
    
    let recommendation = `Recommended recovery: ${strategy} (${confidence}% confidence)\n`;
    recommendation += `Estimated time: ${(plan.estimatedRecoveryTime / 1000).toFixed(1)} seconds\n`;
    
    if (plan.risks.length > 0) {
      recommendation += `⚠️  Risks: ${plan.risks.join(', ')}\n`;
    }
    
    return recommendation;
  }
}