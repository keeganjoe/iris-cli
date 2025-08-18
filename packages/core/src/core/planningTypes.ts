/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents the status of a task step.
 */
export type TaskStepStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';

/**
 * Represents the status of a task plan.
 */
export type TaskPlanStatus = 'draft' | 'executing' | 'completed' | 'failed' | 'paused';

/**
 * Complexity level of a task.
 */
export type TaskComplexity = 'low' | 'medium' | 'high';

/**
 * Type of dependency between steps.
 */
export type DependencyType = 'blocking' | 'soft';

/**
 * Represents a single step in a task plan.
 */
export interface TaskStep {
  id: string;
  description: string;
  tools: string[];
  prerequisites: string[];
  acceptanceCriteria: string[];
  status: TaskStepStatus;
  estimatedDuration: string;
  actualDuration?: string;
  output?: any;
  notes?: string;
  startTime?: Date;
  endTime?: Date;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * Represents a dependency between task steps.
 */
export interface TaskDependency {
  stepId: string;
  dependsOn: string[];
  type: DependencyType;
  reason?: string;
}

/**
 * Represents a complete task plan.
 */
export interface TaskPlan {
  id: string;
  goal: string;
  description: string;
  steps: TaskStep[];
  dependencies: TaskDependency[];
  estimatedTime: string;
  complexity: TaskComplexity;
  status: TaskPlanStatus;
  createdAt: Date;
  updatedAt: Date;
  startTime?: Date;
  endTime?: Date;
  metadata: Record<string, any>;
  tags?: string[];
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  context?: Record<string, any>;
}

/**
 * Result of plan validation.
 */
export interface PlanValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

/**
 * Validation error for a plan.
 */
export interface ValidationError {
  stepId?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'dependency' | 'tool' | 'prerequisite' | 'acceptance' | 'structure';
}

/**
 * Validation warning for a plan.
 */
export interface ValidationWarning {
  stepId?: string;
  message: string;
  suggestion?: string;
  category: 'optimization' | 'best_practice' | 'performance' | 'maintainability';
}

/**
 * Result of plan execution.
 */
export interface PlanExecutionResult {
  planId: string;
  status: TaskPlanStatus;
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  completedSteps: number;
  totalSteps: number;
  successRate: number;
  errors: ExecutionError[];
  outputs: Record<string, any>;
  finalResult?: any;
}

/**
 * Execution error during plan execution.
 */
export interface ExecutionError {
  stepId: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
  retryable: boolean;
  context?: Record<string, any>;
}

/**
 * Configuration for the task planner.
 */
export interface PlannerConfig {
  maxSteps: number;
  maxDependencyDepth: number;
  defaultEstimation: string;
  enableParallelExecution: boolean;
  autoRetryFailedSteps: boolean;
  maxRetries: number;
  stepTimeout: number;
  enableOptimization: boolean;
  preferredToolOrder: string[];
  contextInheritance: boolean;
}

/**
 * Context for plan generation.
 */
export interface PlanGenerationContext {
  goal: string;
  constraints: string[];
  availableTools: string[];
  existingContext: Record<string, any>;
  preferences: PlannerPreferences;
  timeLimit?: string;
  qualityRequirements?: string[];
}

/**
 * User preferences for planning.
 */
export interface PlannerPreferences {
  preferredComplexity: TaskComplexity;
  allowParallelExecution: boolean;
  verboseSteps: boolean;
  includeAlternatives: boolean;
  optimizeForSpeed: boolean;
  optimizeForQuality: boolean;
}

/**
 * Template for creating plans.
 */
export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  stepTemplates: StepTemplate[];
  dependencyPatterns: DependencyPattern[];
  defaultContext: Record<string, any>;
  metadata: Record<string, any>;
  version: string;
  author?: string;
  tags: string[];
}

/**
 * Template for creating steps.
 */
export interface StepTemplate {
  id: string;
  name: string;
  description: string;
  requiredTools: string[];
  optionalTools: string[];
  estimatedDuration: string;
  complexity: TaskComplexity;
  category: string;
  prerequisites: string[];
  acceptanceCriteria: string[];
}

/**
 * Pattern for creating dependencies.
 */
export interface DependencyPattern {
  fromCategory: string;
  toCategory: string;
  type: DependencyType;
  condition?: string;
}

/**
 * Interface for the task planner service.
 */
export interface ITaskPlanner {
  createPlan(context: PlanGenerationContext, config?: Partial<PlannerConfig>): Promise<TaskPlan>;
  validatePlan(plan: TaskPlan): Promise<PlanValidationResult>;
  executePlan(planId: string, signal?: AbortSignal): Promise<PlanExecutionResult>;
  pausePlan(planId: string): Promise<void>;
  resumePlan(planId: string): Promise<void>;
  modifyPlan(planId: string, modifications: PlanModification[]): Promise<TaskPlan>;
  getPlan(planId: string): Promise<TaskPlan | null>;
  listPlans(filter?: PlanFilter): Promise<TaskPlan[]>;
  deletePlan(planId: string): Promise<void>;
  optimizePlan(planId: string): Promise<TaskPlan>;
  exportPlan(planId: string, format: 'json' | 'yaml' | 'markdown'): Promise<string>;
  importPlan(data: string, format: 'json' | 'yaml'): Promise<TaskPlan>;
}

/**
 * Modification to apply to a plan.
 */
export interface PlanModification {
  type: 'add_step' | 'remove_step' | 'modify_step' | 'add_dependency' | 'remove_dependency';
  stepId?: string;
  data?: any;
}

/**
 * Filter for listing plans.
 */
export interface PlanFilter {
  status?: TaskPlanStatus;
  complexity?: TaskComplexity;
  category?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Statistics about plan execution.
 */
export interface PlanStats {
  totalPlans: number;
  completedPlans: number;
  failedPlans: number;
  averageExecutionTime: number;
  averageStepsPerPlan: number;
  mostUsedTools: { tool: string; count: number }[];
  commonFailureReasons: { reason: string; count: number }[];
  successRateByComplexity: Record<TaskComplexity, number>;
}