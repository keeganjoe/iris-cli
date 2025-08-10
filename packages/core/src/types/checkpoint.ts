/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task, Goal, SubTask } from './task.js';
import { Content } from '@google/genai';

/**
 * Represents a tool call execution record
 */
export interface ToolCallRecord {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool that was called */
  toolName: string;
  /** Parameters passed to the tool */
  parameters: Record<string, unknown>;
  /** Result returned by the tool */
  result?: unknown;
  /** Error if the tool call failed */
  error?: string;
  /** When the tool call was executed */
  executedAt: Date;
  /** Duration of tool execution in milliseconds */
  duration: number;
  /** Success/failure status */
  success: boolean;
}

/**
 * Error information for task execution
 */
export interface TaskError {
  /** Unique error identifier */
  id: string;
  /** Error message */
  message: string;
  /** Detailed error information */
  details?: string;
  /** Which subtask caused the error */
  subtaskId?: string;
  /** Error stack trace */
  stack?: string;
  /** When the error occurred */
  timestamp: Date;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Suggested recovery actions */
  recoveryActions?: string[];
}

/**
 * Execution state snapshot for task checkpoints
 */
export interface ExecutionState {
  /** History of all tool calls made during task execution */
  toolCallHistory: ToolCallRecord[];
  /** Conversation context at the time of checkpoint */
  conversationContext: Content[];
  /** Environment variables and system state */
  environmentState: Record<string, unknown>;
  /** Currently executing subtask if any */
  currentSubtaskId?: string;
  /** Step within current subtask */
  currentStep?: number;
  /** Variables and data accumulated during execution */
  executionVariables: Record<string, unknown>;
}

/**
 * Progress tracking information
 */
export interface ProgressSnapshot {
  /** Overall task completion percentage (0-100) */
  overallPercent: number;
  /** Individual subtask progress */
  subtaskProgress: Record<string, number>;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining: number;
  /** Time elapsed since task started */
  elapsedTime: number;
  /** Average time per subtask completion */
  averageSubtaskTime: number;
  /** Predicted completion time */
  predictedCompletion: Date;
}

/**
 * Recovery decision for failed operations
 */
export interface RetryDecision {
  /** Whether to retry the operation */
  shouldRetry: boolean;
  /** How long to wait before retrying (milliseconds) */
  retryDelay: number;
  /** Modified parameters for retry */
  modifiedParameters?: Record<string, unknown>;
  /** Alternative approach to try */
  alternativeApproach?: string;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Reason for the decision */
  reasoning: string;
}

/**
 * Comprehensive checkpoint of task execution state
 */
export interface TaskCheckpoint {
  /** Task this checkpoint belongs to */
  taskId: string;
  /** Unique checkpoint identifier */
  checkpointId: string;
  /** When this checkpoint was created */
  timestamp: Date;
  /** Version of the checkpoint format */
  version: string;
  
  /** Task state at checkpoint time */
  taskSnapshot: {
    /** Complete task object with current state */
    task: Task;
    /** Which subtasks have been completed */
    completedSubtasks: string[];
    /** Currently executing subtask */
    currentSubtask?: string;
    /** Failed subtasks that need attention */
    failedSubtasks: string[];
  };
  
  /** Execution context and state */
  executionState: ExecutionState;
  
  /** Progress information */
  progress: ProgressSnapshot;
  
  /** Errors encountered during execution */
  errors: TaskError[];
  
  /** Number of times task has been retried */
  retryCount: number;
  
  /** Recovery attempts made */
  recoveryAttempts: Array<{
    error: TaskError;
    decision: RetryDecision;
    result: 'success' | 'failure' | 'pending';
    timestamp: Date;
  }>;
  
  /** Metadata about the checkpoint */
  metadata: {
    /** Size of checkpoint data in bytes */
    size: number;
    /** Compression ratio if compressed */
    compressionRatio?: number;
    /** Checksum for data integrity */
    checksum: string;
    /** Whether this checkpoint can be safely restored */
    restorable: boolean;
    /** Reason if not restorable */
    notRestorableReason?: string;
  };
}

/**
 * Information about an interruption that occurred
 */
export interface InterruptionInfo {
  /** Type of interruption */
  type: 'user_cancelled' | 'system_error' | 'timeout' | 'resource_exhausted' | 'unknown';
  /** When the interruption occurred */
  timestamp: Date;
  /** Task that was interrupted */
  taskId: string;
  /** Subtask that was executing when interrupted */
  subtaskId?: string;
  /** Error details if applicable */
  error?: TaskError;
  /** System state at time of interruption */
  systemState: Record<string, unknown>;
  /** Whether recovery is possible */
  recoverable: boolean;
}

/**
 * Plan for recovering from an interruption
 */
export interface RecoveryPlan {
  /** Interruption this plan addresses */
  interruptionId: string;
  /** Recovery strategy to use */
  strategy: 'resume' | 'restart' | 'modify_and_resume' | 'alternative_approach';
  /** Steps to execute for recovery */
  steps: RecoveryStep[];
  /** Estimated recovery time */
  estimatedRecoveryTime: number;
  /** Confidence in recovery success (0-1) */
  confidence: number;
  /** Risks associated with this recovery plan */
  risks: string[];
}

/**
 * Individual step in a recovery plan
 */
export interface RecoveryStep {
  /** Step identifier */
  id: string;
  /** Description of what this step does */
  description: string;
  /** Type of recovery action */
  type: 'validate_state' | 'restore_checkpoint' | 'cleanup_resources' | 'retry_subtask' | 'modify_plan';
  /** Parameters for this step */
  parameters: Record<string, unknown>;
  /** Whether this step is critical for recovery */
  critical: boolean;
  /** Estimated execution time */
  estimatedTime: number;
}

/**
 * Result of checkpoint creation
 */
export interface CheckpointResult {
  /** Whether checkpoint was created successfully */
  success: boolean;
  /** Created checkpoint if successful */
  checkpoint?: TaskCheckpoint;
  /** Error if checkpoint creation failed */
  error?: string;
  /** Time taken to create checkpoint */
  duration: number;
  /** Size of created checkpoint */
  size?: number;
}

/**
 * Result of checkpoint restoration
 */
export interface RestoreResult {
  /** Whether restore was successful */
  success: boolean;
  /** Restored task if successful */
  task?: Task;
  /** Restored execution state */
  executionState?: ExecutionState;
  /** Error if restore failed */
  error?: string;
  /** Validation warnings */
  warnings: string[];
  /** Time taken to restore */
  duration: number;
}

/**
 * Configuration for checkpoint behavior
 */
export interface CheckpointConfig {
  /** How often to create automatic checkpoints (milliseconds) */
  autoCheckpointInterval: number;
  /** Maximum number of checkpoints to keep per task */
  maxCheckpointsPerTask: number;
  /** Whether to compress checkpoint data */
  enableCompression: boolean;
  /** Whether to validate checkpoint integrity */
  validateIntegrity: boolean;
  /** Directory to store checkpoint files */
  checkpointDirectory?: string;
  /** Whether to encrypt sensitive data in checkpoints */
  encryptSensitiveData: boolean;
}

/**
 * Statistics about checkpoint usage
 */
export interface CheckpointStats {
  /** Total number of checkpoints created */
  totalCheckpoints: number;
  /** Total size of all checkpoints */
  totalSize: number;
  /** Average checkpoint size */
  averageSize: number;
  /** Successful restore operations */
  successfulRestores: number;
  /** Failed restore operations */
  failedRestores: number;
  /** Average time to create checkpoint */
  averageCreationTime: number;
  /** Average time to restore checkpoint */
  averageRestoreTime: number;
}