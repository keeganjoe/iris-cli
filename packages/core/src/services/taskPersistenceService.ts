/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Config } from '../config/config.js';
import { Task, TaskStatus } from '../types/task.js';
import { 
  TaskCheckpoint, 
  CheckpointConfig, 
  CheckpointResult, 
  RestoreResult,
  CheckpointStats
} from '../types/checkpoint.js';
import { getErrorMessage } from '../utils/errors.js';
import * as crypto from 'node:crypto';

/**
 * Service for persisting tasks and checkpoints to the file system
 */
export class TaskPersistenceService {
  private readonly storageDir: string;
  private readonly checkpointDir: string;
  private readonly config: CheckpointConfig;
  private readonly stats: CheckpointStats;

  constructor(private readonly geminiConfig: Config, config?: Partial<CheckpointConfig>) {
    this.storageDir = path.join(geminiConfig.getGeminiDir(), 'tasks');
    this.checkpointDir = path.join(this.storageDir, 'checkpoints');
    
    this.config = {
      autoCheckpointInterval: 30000, // 30 seconds
      maxCheckpointsPerTask: 10,
      enableCompression: true,
      validateIntegrity: true,
      encryptSensitiveData: false,
      ...config,
      checkpointDirectory: this.checkpointDir
    };

    this.stats = {
      totalCheckpoints: 0,
      totalSize: 0,
      averageSize: 0,
      successfulRestores: 0,
      failedRestores: 0,
      averageCreationTime: 0,
      averageRestoreTime: 0
    };

    this.initializeStorage();
  }

  /**
   * Initialize storage directories
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to initialize task storage directories:', error);
    }
  }

  /**
   * Save a task to persistent storage
   */
  async saveTask(task: Task): Promise<void> {
    try {
      const taskFilePath = this.getTaskFilePath(task.id);
      const taskData = {
        ...task,
        savedAt: new Date().toISOString(),
        version: '1.0'
      };

      await fs.writeFile(
        taskFilePath, 
        JSON.stringify(taskData, null, 2), 
        'utf8'
      );

      console.log(`Task ${task.id} saved successfully`);
    } catch (error) {
      console.error(`Failed to save task ${task.id}:`, error);
      throw new Error(`Failed to save task: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Load a task from persistent storage
   */
  async loadTask(taskId: string): Promise<Task | null> {
    try {
      const taskFilePath = this.getTaskFilePath(taskId);
      
      // Check if file exists
      try {
        await fs.access(taskFilePath);
      } catch {
        return null; // File doesn't exist
      }

      const taskData = await fs.readFile(taskFilePath, 'utf8');
      const parsedTask = JSON.parse(taskData);
      
      // Convert date strings back to Date objects
      return this.deserializeTask(parsedTask);
    } catch (error) {
      console.error(`Failed to load task ${taskId}:`, error);
      throw new Error(`Failed to load task: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get all persisted tasks
   */
  async getAllTasks(): Promise<Task[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const taskFiles = files.filter(file => file.startsWith('task-') && file.endsWith('.json'));
      
      const tasks: Task[] = [];
      for (const file of taskFiles) {
        try {
          const taskData = await fs.readFile(path.join(this.storageDir, file), 'utf8');
          const task = this.deserializeTask(JSON.parse(taskData));
          tasks.push(task);
        } catch (error) {
          console.warn(`Failed to load task from ${file}:`, error);
        }
      }

      return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      return [];
    }
  }

  /**
   * Delete a task and all its checkpoints
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      // Delete task file
      const taskFilePath = this.getTaskFilePath(taskId);
      try {
        await fs.unlink(taskFilePath);
      } catch {
        // File might not exist, continue
      }

      // Delete all checkpoints for this task
      await this.deleteAllCheckpoints(taskId);

      console.log(`Task ${taskId} and its checkpoints deleted successfully`);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
      throw new Error(`Failed to delete task: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Save a checkpoint for a task
   */
  async saveCheckpoint(checkpoint: TaskCheckpoint): Promise<CheckpointResult> {
    const startTime = Date.now();
    
    try {
      // Clean up old checkpoints first
      await this.cleanupOldCheckpoints(checkpoint.taskId);

      // Calculate checksum
      const checkpointData = { ...checkpoint };
      checkpointData.metadata.checksum = this.calculateChecksum(checkpointData);
      
      const checkpointFilePath = this.getCheckpointFilePath(checkpoint.taskId, checkpoint.checkpointId);
      const serializedData = JSON.stringify(checkpointData, null, this.config.enableCompression ? 0 : 2);
      
      await fs.writeFile(checkpointFilePath, serializedData, 'utf8');
      
      const duration = Date.now() - startTime;
      const size = Buffer.byteLength(serializedData, 'utf8');
      
      // Update statistics
      this.updateCheckpointStats(size, duration, true);

      console.log(`Checkpoint ${checkpoint.checkpointId} for task ${checkpoint.taskId} saved (${(size / 1024).toFixed(1)}KB)`);
      
      return {
        success: true,
        checkpoint: checkpointData,
        duration,
        size
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Failed to save checkpoint ${checkpoint.checkpointId}:`, error);
      
      return {
        success: false,
        error: getErrorMessage(error),
        duration
      };
    }
  }

  /**
   * Load the latest checkpoint for a task
   */
  async loadLatestCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    try {
      const checkpoints = await this.getAllCheckpoints(taskId);
      if (checkpoints.length === 0) {
        return null;
      }

      // Return the most recent checkpoint
      return checkpoints[0];
    } catch (error) {
      console.error(`Failed to load latest checkpoint for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Restore a task from a checkpoint
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<RestoreResult> {
    const startTime = Date.now();
    
    try {
      const checkpoint = await this.loadCheckpoint(checkpointId);
      if (!checkpoint) {
        return {
          success: false,
          error: 'Checkpoint not found',
          warnings: [],
          duration: Date.now() - startTime
        };
      }

      // Validate checkpoint integrity
      const validationResult = await this.validateCheckpoint(checkpoint);
      if (!validationResult.valid) {
        this.stats.failedRestores++;
        return {
          success: false,
          error: `Checkpoint validation failed: ${validationResult.errors.join(', ')}`,
          warnings: validationResult.warnings,
          duration: Date.now() - startTime
        };
      }

      // Restore task state
      const task = checkpoint.taskSnapshot.task;
      const executionState = checkpoint.executionState;

      // Update statistics
      const duration = Date.now() - startTime;
      this.stats.successfulRestores++;
      this.stats.averageRestoreTime = 
        (this.stats.averageRestoreTime * (this.stats.successfulRestores - 1) + duration) / this.stats.successfulRestores;

      console.log(`Successfully restored task ${task.id} from checkpoint ${checkpointId}`);
      
      return {
        success: true,
        task,
        executionState,
        warnings: validationResult.warnings,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failedRestores++;
      
      return {
        success: false,
        error: getErrorMessage(error),
        warnings: [],
        duration
      };
    }
  }

  /**
   * Get all checkpoints for a task, sorted by timestamp (newest first)
   */
  async getAllCheckpoints(taskId: string): Promise<TaskCheckpoint[]> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const checkpointFiles = files.filter(file => 
        file.startsWith(`checkpoint-${taskId}-`) && file.endsWith('.json')
      );

      const checkpoints: TaskCheckpoint[] = [];
      for (const file of checkpointFiles) {
        try {
          const checkpointData = await fs.readFile(path.join(this.checkpointDir, file), 'utf8');
          const checkpoint = this.deserializeCheckpoint(JSON.parse(checkpointData));
          checkpoints.push(checkpoint);
        } catch (error) {
          console.warn(`Failed to load checkpoint from ${file}:`, error);
        }
      }

      return checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`Failed to get checkpoints for task ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Get incomplete tasks that can be resumed
   */
  async getResumableTasks(): Promise<Task[]> {
    const allTasks = await this.getAllTasks();
    return allTasks.filter(task => 
      task.status === TaskStatus.IN_PROGRESS || 
      task.status === TaskStatus.PENDING ||
      task.status === TaskStatus.BLOCKED
    );
  }

  /**
   * Get checkpoint statistics
   */
  getCheckpointStats(): CheckpointStats {
    return { ...this.stats };
  }

  // Private helper methods

  private getTaskFilePath(taskId: string): string {
    return path.join(this.storageDir, `task-${taskId}.json`);
  }

  private getCheckpointFilePath(taskId: string, checkpointId: string): string {
    return path.join(this.checkpointDir, `checkpoint-${taskId}-${checkpointId}.json`);
  }

  private async loadCheckpoint(checkpointId: string): Promise<TaskCheckpoint | null> {
    try {
      // Find checkpoint file by checkpointId
      const files = await fs.readdir(this.checkpointDir);
      const checkpointFile = files.find(file => file.includes(`-${checkpointId}.json`));
      
      if (!checkpointFile) {
        return null;
      }

      const checkpointData = await fs.readFile(path.join(this.checkpointDir, checkpointFile), 'utf8');
      return this.deserializeCheckpoint(JSON.parse(checkpointData));
    } catch (error) {
      console.error(`Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  private async cleanupOldCheckpoints(taskId: string): Promise<void> {
    try {
      const checkpoints = await this.getAllCheckpoints(taskId);
      
      if (checkpoints.length >= this.config.maxCheckpointsPerTask) {
        // Delete oldest checkpoints
        const checkpointsToDelete = checkpoints.slice(this.config.maxCheckpointsPerTask - 1);
        
        for (const checkpoint of checkpointsToDelete) {
          try {
            const filePath = this.getCheckpointFilePath(checkpoint.taskId, checkpoint.checkpointId);
            await fs.unlink(filePath);
          } catch (error) {
            console.warn(`Failed to delete old checkpoint ${checkpoint.checkpointId}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to cleanup old checkpoints for task ${taskId}:`, error);
    }
  }

  private async deleteAllCheckpoints(taskId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const checkpointFiles = files.filter(file => file.startsWith(`checkpoint-${taskId}-`));
      
      for (const file of checkpointFiles) {
        try {
          await fs.unlink(path.join(this.checkpointDir, file));
        } catch (error) {
          console.warn(`Failed to delete checkpoint file ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to delete checkpoints for task ${taskId}:`, error);
    }
  }

  private calculateChecksum(data: any): string {
    const serialized = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  private async validateCheckpoint(checkpoint: TaskCheckpoint): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!checkpoint.taskId) errors.push('Missing task ID');
    if (!checkpoint.checkpointId) errors.push('Missing checkpoint ID');
    if (!checkpoint.taskSnapshot?.task) errors.push('Missing task snapshot');

    // Validate checksum if configured
    if (this.config.validateIntegrity && checkpoint.metadata.checksum) {
      const { checksum, ...dataWithoutChecksum } = checkpoint.metadata;
      const calculatedChecksum = this.calculateChecksum({ ...checkpoint, metadata: dataWithoutChecksum });
      
      if (checksum !== calculatedChecksum) {
        errors.push('Checksum validation failed - data may be corrupted');
      }
    }

    // Check if checkpoint is too old
    const age = Date.now() - new Date(checkpoint.timestamp).getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (age > maxAge) {
      warnings.push('Checkpoint is older than 7 days - restoration may fail');
    }

    // Check if checkpoint is marked as non-restorable
    if (!checkpoint.metadata.restorable) {
      errors.push(checkpoint.metadata.notRestorableReason || 'Checkpoint is marked as non-restorable');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private deserializeTask(data: any): Task {
    // Convert date strings back to Date objects
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      subtasks: data.subtasks.map((st: any) => ({
        ...st,
        startedAt: st.startedAt ? new Date(st.startedAt) : undefined,
        completedAt: st.completedAt ? new Date(st.completedAt) : undefined
      })),
      goals: data.goals.map((g: any) => ({
        ...g,
        validationResult: g.validationResult ? {
          ...g.validationResult,
          timestamp: new Date(g.validationResult.timestamp)
        } : undefined
      })),
      error: data.error ? {
        ...data.error,
        timestamp: new Date(data.error.timestamp)
      } : undefined
    };
  }

  private deserializeCheckpoint(data: any): TaskCheckpoint {
    return {
      ...data,
      timestamp: new Date(data.timestamp),
      taskSnapshot: {
        ...data.taskSnapshot,
        task: this.deserializeTask(data.taskSnapshot.task)
      },
      executionState: {
        ...data.executionState,
        toolCallHistory: data.executionState.toolCallHistory.map((record: any) => ({
          ...record,
          executedAt: new Date(record.executedAt)
        }))
      },
      errors: data.errors.map((error: any) => ({
        ...error,
        timestamp: new Date(error.timestamp)
      })),
      recoveryAttempts: data.recoveryAttempts.map((attempt: any) => ({
        ...attempt,
        timestamp: new Date(attempt.timestamp)
      })),
      progress: {
        ...data.progress,
        predictedCompletion: new Date(data.progress.predictedCompletion)
      }
    };
  }

  private updateCheckpointStats(size: number, duration: number, success: boolean): void {
    if (success) {
      this.stats.totalCheckpoints++;
      this.stats.totalSize += size;
      this.stats.averageSize = this.stats.totalSize / this.stats.totalCheckpoints;
      this.stats.averageCreationTime = 
        (this.stats.averageCreationTime * (this.stats.totalCheckpoints - 1) + duration) / this.stats.totalCheckpoints;
    }
  }
}