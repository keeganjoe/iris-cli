/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, GenerateContentConfig } from '@google/genai';
import { Config } from '../config/config.js';
import { 
  Task, 
  TaskPlan, 
  TaskPlanningResult, 
  SubTask,
  Goal,
  TaskStatus,
  TaskPriority,
  ValidationMethod
} from '../types/task.js';
import { getErrorMessage } from '../utils/errors.js';
// Simple ID generator (replacement for uuid)
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Configuration for task planning
 */
export interface TaskPlannerConfig {
  /** Maximum number of subtasks to generate */
  maxSubtasks: number;
  /** Default retry policy */
  defaultRetryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  /** Resource limits for planning */
  resourceLimits: {
    maxTokensPerPlan: number;
    maxPlanningDuration: number;
  };
  /** Whether to enable parallel execution by default */
  enableParallelExecution: boolean;
  /** Maximum parallel tasks */
  maxParallelTasks: number;
}

/**
 * Service responsible for intelligent task planning and decomposition
 */
export class TaskPlannerService {
  private readonly config: Config;
  private readonly plannerConfig: TaskPlannerConfig;

  constructor(config: Config, plannerConfig?: Partial<TaskPlannerConfig>) {
    this.config = config;
    this.plannerConfig = {
      maxSubtasks: 20,
      defaultRetryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2
      },
      resourceLimits: {
        maxTokensPerPlan: 4000,
        maxPlanningDuration: 30000 // 30 seconds
      },
      enableParallelExecution: true,
      maxParallelTasks: 3,
      ...plannerConfig
    };
  }

  /**
   * Create a comprehensive task plan for a user request
   */
  async createTaskPlan(
    userRequest: string,
    conversationContext?: string,
    signal?: AbortSignal
  ): Promise<TaskPlanningResult> {
    try {
      console.log(`TaskPlannerService: Creating plan for request: "${userRequest}"`);
      
      // Analyze the request to determine complexity
      const complexity = await this.analyzeRequestComplexity(userRequest, signal);
      
      // Generate task decomposition
      const task = await this.generateTaskDecomposition(
        userRequest, 
        conversationContext, 
        complexity,
        signal
      );

      // Create execution plan
      const plan = await this.createExecutionPlan(task, signal);

      // Validate and optimize the plan
      const optimizedPlan = await this.optimizePlan(plan, signal);

      // Calculate confidence score
      const confidence = this.calculatePlanConfidence(optimizedPlan);

      return {
        plan: optimizedPlan,
        confidence,
        warnings: this.generatePlanWarnings(optimizedPlan),
        alternatives: await this.generateAlternatives(optimizedPlan, signal)
      };

    } catch (error) {
      console.error('TaskPlannerService: Error creating task plan:', error);
      throw new Error(`Failed to create task plan: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Analyze request complexity to determine planning strategy
   */
  private async analyzeRequestComplexity(
    userRequest: string, 
    signal?: AbortSignal
  ): Promise<'simple' | 'moderate' | 'complex'> {
    const complexityPrompt = `
Analyze this user request and determine its complexity level:

Request: "${userRequest}"

Consider:
- Number of distinct operations required
- Dependencies between operations  
- Technical complexity of individual steps
- Amount of context/domain knowledge required
- Potential for errors or edge cases

Respond with a JSON object:
{
  "complexity": "simple" | "moderate" | "complex",
  "reasoning": "Brief explanation of the complexity assessment",
  "estimatedSubtasks": number,
  "riskFactors": ["list", "of", "potential", "risks"]
}`;

    try {
      const response = await this.config.getGeminiClient().generateJson(
        [{ role: 'user', parts: [{ text: complexityPrompt }] }],
        {
          type: 'object',
          properties: {
            complexity: { 
              type: 'string', 
              enum: ['simple', 'moderate', 'complex'] 
            },
            reasoning: { type: 'string' },
            estimatedSubtasks: { type: 'number' },
            riskFactors: { 
              type: 'array', 
              items: { type: 'string' } 
            }
          },
          required: ['complexity', 'reasoning', 'estimatedSubtasks']
        },
        signal || new AbortController().signal
      );

      console.log(`TaskPlannerService: Complexity analysis:`, response);
      return (response.complexity as 'simple' | 'moderate' | 'complex') || 'moderate';
    } catch (error) {
      console.warn('TaskPlannerService: Failed to analyze complexity, defaulting to moderate:', error);
      return 'moderate';
    }
  }

  /**
   * Generate detailed task decomposition using LLM
   */
  private async generateTaskDecomposition(
    userRequest: string,
    conversationContext: string | undefined,
    complexity: string,
    signal?: AbortSignal
  ): Promise<Task> {
    // Get available tools for context
    const toolRegistry = await this.config.getToolRegistry();
    const availableTools = toolRegistry.getFunctionDeclarations()
      .map(tool => `${tool.name}: ${tool.description}`)
      .join('\n');

    // Get project context
    const projectContext = {
      workingDirectory: this.config.getWorkingDir(),
      gitBranch: undefined, // TODO: Get from GitService
      openFiles: [] // TODO: Get from IDE context
    };

    const decompositionPrompt = `
You are an expert AI task planner. Break down this user request into a structured task plan.

User Request: "${userRequest}"
${conversationContext ? `\nConversation Context: ${conversationContext}` : ''}

Project Context:
- Working Directory: ${projectContext.workingDirectory}
- Available Tools: 
${availableTools}

Complexity Level: ${complexity}

Create a comprehensive task breakdown with:
1. Clear main goals and success criteria
2. Logical subtasks with dependencies
3. Required tools for each subtask  
4. Priority levels and time estimates
5. Risk assessment and mitigation

Respond with a JSON object following this structure:
{
  "description": "Main task description",
  "goals": [
    {
      "id": "goal_1",
      "description": "What this goal achieves",
      "successCriteria": {
        "description": "How to measure success",
        "conditions": ["specific", "measurable", "conditions"]
      },
      "validationMethod": "llm_evaluation" | "tool_execution" | "file_verification" | "test_execution"
    }
  ],
  "subtasks": [
    {
      "description": "What this subtask does",
      "dependencies": ["other_subtask_ids"],
      "requiredTools": ["tool_names"],
      "estimatedDuration": 30000,
      "priority": 1-4,
      "context": {"key": "value"}
    }
  ],
  "priority": 1-4,
  "estimatedDuration": 120000
}`;

    try {
      const response = await this.config.getGeminiClient().generateJson(
        [{ role: 'user', parts: [{ text: decompositionPrompt }] }],
        {
          type: 'object',
          properties: {
            description: { type: 'string' },
            goals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  description: { type: 'string' },
                  successCriteria: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      conditions: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  },
                  validationMethod: {
                    type: 'string',
                    enum: ['llm_evaluation', 'tool_execution', 'file_verification', 'test_execution']
                  }
                }
              }
            },
            subtasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  requiredTools: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  estimatedDuration: { type: 'number' },
                  priority: { type: 'number' },
                  context: { type: 'object' }
                }
              }
            },
            priority: { type: 'number' },
            estimatedDuration: { type: 'number' }
          },
          required: ['description', 'goals', 'subtasks']
        },
        signal || new AbortController().signal
      );

      // Convert JSON response to Task object
      const taskId = generateId();
      const now = new Date();

      // First pass: create subtasks and build ID mapping
      const subtaskIdMap = new Map<string, string>();
      const subtasks = (response.subtasks as any[]).map((st: any, index: number) => {
        const subtaskId = `${taskId}_subtask_${index + 1}`;
        // Map original dependency names to actual IDs
        const originalName = `subtask_${index + 1}`;
        subtaskIdMap.set(originalName, subtaskId);
        return {
          id: subtaskId,
          parentTaskId: taskId,
          description: st.description,
          status: TaskStatus.PENDING,
          progress: 0,
          dependencies: st.dependencies || [], // Will be resolved in second pass
          requiredTools: st.requiredTools || [],
          estimatedDuration: st.estimatedDuration || 30000,
          priority: this.parsePriority(st.priority),
          context: st.context || {}
        };
      });

      // Second pass: resolve dependencies using the mapping
      subtasks.forEach((subtask: SubTask) => {
        subtask.dependencies = subtask.dependencies
          .map((depName: string) => subtaskIdMap.get(depName) || depName)
          .filter((depId: string) => subtasks.some(st => st.id === depId)); // Only keep valid dependencies
      });

      const task: Task = {
        id: taskId,
        description: response.description as string,
        goals: (response.goals as any[]).map((g: any, index: number) => ({
          id: g.id || `goal_${index + 1}`,
          description: g.description,
          successCriteria: {
            description: g.successCriteria?.description || 'Goal completion',
            conditions: g.successCriteria?.conditions || ['Task completed successfully'],
            validationContext: {}
          },
          validationMethod: this.parseValidationMethod(g.validationMethod),
          achieved: false
        })),
        subtasks,
        dependencies: [],
        status: TaskStatus.PENDING,
        progress: 0,
        estimatedDuration: response.estimatedDuration as number || 60000,
        priority: this.parsePriority(response.priority as number),
        createdAt: now,
        metadata: {
          originalRequest: userRequest,
          conversationContext,
          projectContext,
          custom: {}
        }
      };

      console.log(`TaskPlannerService: Generated task with ${task.subtasks.length} subtasks`);
      return task;

    } catch (error) {
      console.error('TaskPlannerService: Failed to generate task decomposition:', error);
      throw new Error(`Task decomposition failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create execution plan with dependency management and resource allocation
   */
  private async createExecutionPlan(task: Task, signal?: AbortSignal): Promise<TaskPlan> {
    // Build dependency graph
    const dependencyGraph: { [subtaskId: string]: string[] } = {};
    for (const subtask of task.subtasks) {
      dependencyGraph[subtask.id] = subtask.dependencies;
    }

    // Validate dependencies
    this.validateDependencyGraph(dependencyGraph, task.subtasks);

    // Calculate resource estimates
    const resourceEstimates = this.calculateResourceEstimates(task);

    // Determine execution strategy
    const strategy = this.determineExecutionStrategy(task, resourceEstimates);

    const plan: TaskPlan = {
      id: generateId(),
      task,
      strategy,
      dependencyGraph,
      resourceEstimates,
      createdAt: new Date(),
      status: 'draft'
    };

    console.log(`TaskPlannerService: Created execution plan with strategy: ${strategy.resourceAllocation}`);
    return plan;
  }

  /**
   * Optimize plan for efficiency and reliability
   */
  private async optimizePlan(plan: TaskPlan, signal?: AbortSignal): Promise<TaskPlan> {
    // Optimize subtask ordering for parallel execution
    const optimizedSubtasks = this.optimizeSubtaskOrdering(plan.task.subtasks, plan.dependencyGraph);
    
    // Update resource estimates based on optimized ordering
    const optimizedResourceEstimates = this.calculateResourceEstimates({
      ...plan.task,
      subtasks: optimizedSubtasks
    });

    return {
      ...plan,
      task: {
        ...plan.task,
        subtasks: optimizedSubtasks
      },
      resourceEstimates: optimizedResourceEstimates,
      status: 'approved'
    };
  }

  /**
   * Calculate plan confidence score based on various factors
   */
  private calculatePlanConfidence(plan: TaskPlan): number {
    let confidence = 1.0;

    // Reduce confidence for complex dependency chains
    const avgDependencies = plan.task.subtasks.reduce((sum, st) => sum + st.dependencies.length, 0) / plan.task.subtasks.length;
    if (avgDependencies > 2) confidence -= 0.1;

    // Reduce confidence for high resource requirements
    if (plan.resourceEstimates.totalTokens > 10000) confidence -= 0.1;
    if (plan.resourceEstimates.totalDuration > 300000) confidence -= 0.1; // 5 minutes

    // Reduce confidence for many subtasks
    if (plan.task.subtasks.length > 10) confidence -= 0.1;

    // Increase confidence for well-structured plans
    if (plan.task.goals.length > 0 && plan.task.goals.every(g => g.successCriteria.conditions.length > 0)) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate warnings about potential issues with the plan
   */
  private generatePlanWarnings(plan: TaskPlan): string[] {
    const warnings: string[] = [];

    if (plan.task.subtasks.length > this.plannerConfig.maxSubtasks) {
      warnings.push(`Plan has ${plan.task.subtasks.length} subtasks, which exceeds the recommended maximum of ${this.plannerConfig.maxSubtasks}`);
    }

    if (plan.resourceEstimates.totalDuration > 600000) { // 10 minutes
      warnings.push('Plan is estimated to take over 10 minutes to complete');
    }

    if (plan.resourceEstimates.totalTokens > 15000) {
      warnings.push('Plan may consume a large number of tokens');
    }

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(plan.dependencyGraph);
    if (circularDeps.length > 0) {
      warnings.push(`Circular dependencies detected: ${circularDeps.join(', ')}`);
    }

    return warnings;
  }

  /**
   * Generate alternative execution strategies
   */
  private async generateAlternatives(plan: TaskPlan, signal?: AbortSignal): Promise<Array<{
    description: string;
    pros: string[];
    cons: string[];
  }>> {
    // For now, return static alternatives based on current strategy
    const alternatives = [];

    if (plan.strategy.allowParallelExecution) {
      alternatives.push({
        description: 'Sequential Execution',
        pros: ['Lower resource usage', 'Easier to debug', 'More predictable'],
        cons: ['Slower execution', 'Less efficient']
      });
    } else {
      alternatives.push({
        description: 'Parallel Execution',
        pros: ['Faster execution', 'Better resource utilization'],
        cons: ['Higher complexity', 'More memory usage', 'Harder to debug']
      });
    }

    return alternatives;
  }

  // Helper methods

  private parseValidationMethod(method: string): ValidationMethod {
    switch (method) {
      case 'tool_execution': return ValidationMethod.TOOL_EXECUTION;
      case 'file_verification': return ValidationMethod.FILE_VERIFICATION;
      case 'test_execution': return ValidationMethod.TEST_EXECUTION;
      case 'manual': return ValidationMethod.MANUAL;
      default: return ValidationMethod.LLM_EVALUATION;
    }
  }

  private parsePriority(priority: number): TaskPriority {
    if (priority >= 4) return TaskPriority.CRITICAL;
    if (priority >= 3) return TaskPriority.HIGH;
    if (priority >= 2) return TaskPriority.MEDIUM;
    return TaskPriority.LOW;
  }

  private validateDependencyGraph(dependencyGraph: { [subtaskId: string]: string[] }, subtasks: SubTask[]): void {
    const subtaskIds = new Set(subtasks.map(st => st.id));
    
    for (const [subtaskId, dependencies] of Object.entries(dependencyGraph)) {
      if (!subtaskIds.has(subtaskId)) {
        throw new Error(`Invalid subtask ID in dependency graph: ${subtaskId}`);
      }
      
      for (const depId of dependencies) {
        if (!subtaskIds.has(depId)) {
          throw new Error(`Invalid dependency ID: ${depId} for subtask ${subtaskId}`);
        }
      }
    }
  }

  private calculateResourceEstimates(task: Task): TaskPlan['resourceEstimates'] {
    const totalDuration = task.subtasks.reduce((sum, st) => sum + (st.estimatedDuration || 30000), 0);
    const toolsRequired = [...new Set(task.subtasks.flatMap(st => st.requiredTools))];
    
    return {
      totalTokens: Math.min(task.subtasks.length * 500, 15000), // Rough estimate
      totalDuration,
      toolsRequired,
      memoryRequirement: task.subtasks.length * 50 // MB estimate
    };
  }

  private determineExecutionStrategy(task: Task, resourceEstimates: TaskPlan['resourceEstimates']): TaskPlan['strategy'] {
    const allowParallel = this.plannerConfig.enableParallelExecution && 
                         task.subtasks.length > 2 && 
                         resourceEstimates.memoryRequirement < 500;

    return {
      allowParallelExecution: allowParallel,
      maxParallelTasks: allowParallel ? Math.min(this.plannerConfig.maxParallelTasks, task.subtasks.length) : 1,
      resourceAllocation: task.subtasks.length > 5 ? 'priority_based' : 'balanced',
      retryPolicy: {
        ...this.plannerConfig.defaultRetryPolicy,
        retryableErrors: ['timeout', 'temporary_failure', 'rate_limit']
      }
    };
  }

  private optimizeSubtaskOrdering(subtasks: SubTask[], dependencyGraph: { [subtaskId: string]: string[] }): SubTask[] {
    // Simple topological sort for now
    // TODO: Implement more sophisticated optimization
    return [...subtasks].sort((a, b) => {
      if (a.dependencies.includes(b.id)) return 1;
      if (b.dependencies.includes(a.id)) return -1;
      return b.priority - a.priority; // Higher priority first
    });
  }

  private detectCircularDependencies(dependencyGraph: { [subtaskId: string]: string[] }): string[] {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const circular: string[] = [];

    const visit = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) {
        circular.push(nodeId);
        return true;
      }
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      for (const depId of dependencyGraph[nodeId] || []) {
        if (visit(depId)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const nodeId of Object.keys(dependencyGraph)) {
      visit(nodeId);
    }

    return circular;
  }
}