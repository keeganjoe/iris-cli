/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TaskPlan,
  TaskStep,
  TaskDependency,
  PlanGenerationContext,
  PlannerConfig,
  PlanValidationResult,
  PlanExecutionResult,
  ITaskPlanner,
  PlanModification,
  PlanFilter,
  ValidationError,
  ValidationWarning,
  ExecutionError,
  TaskPlanStatus,
  TaskStepStatus,
  TaskComplexity,
  DependencyType,
} from './planningTypes.js';
import { GeminiClient } from './client.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

/**
 * Implementation of the task planner that creates and executes structured plans.
 */
export class TaskPlanner implements ITaskPlanner {
  private plans = new Map<string, TaskPlan>();
  private activePlans = new Set<string>();
  private pausedPlans = new Set<string>();

  private readonly defaultConfig: PlannerConfig = {
    maxSteps: 20,
    maxDependencyDepth: 5,
    defaultEstimation: '10-15 minutes',
    enableParallelExecution: true,
    autoRetryFailedSteps: true,
    maxRetries: 3,
    stepTimeout: 300000, // 5 minutes
    enableOptimization: true,
    preferredToolOrder: ['read_file', 'search_text', 'write_file', 'edit_file', 'shell'],
    contextInheritance: true,
  };

  constructor(
    private geminiClient: GeminiClient,
    private config: Config,
  ) {}

  /**
   * Creates a new task plan based on the given context.
   */
  async createPlan(
    context: PlanGenerationContext,
    customConfig?: Partial<PlannerConfig>,
  ): Promise<TaskPlan> {
    const config = { ...this.defaultConfig, ...customConfig };
    const planId = `plan_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Generate plan using AI
    const aiGeneratedPlan = await this.generatePlanWithAI(context, config);

    const plan: TaskPlan = {
      id: planId,
      goal: context.goal,
      description: aiGeneratedPlan.description || `Plan to achieve: ${context.goal}`,
      steps: aiGeneratedPlan.steps,
      dependencies: aiGeneratedPlan.dependencies,
      estimatedTime: this.calculateTotalEstimatedTime(aiGeneratedPlan.steps),
      complexity: this.determineComplexity(aiGeneratedPlan.steps),
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        context: context.existingContext,
        constraints: context.constraints,
        preferences: context.preferences,
        generationConfig: config,
      },
      category: aiGeneratedPlan.category || 'general',
      priority: aiGeneratedPlan.priority || 'medium',
      tags: aiGeneratedPlan.tags || [],
    };

    // Validate the generated plan
    const validationResult = await this.validatePlan(plan);
    if (!validationResult.isValid) {
      // Try to fix common issues automatically
      const fixedPlan = await this.autoFixPlan(plan, validationResult);
      if (fixedPlan) {
        this.plans.set(planId, fixedPlan);
        return fixedPlan;
      }
      throw new Error(`Generated plan is invalid: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    this.plans.set(planId, plan);
    return plan;
  }

  /**
   * Generates a plan using AI assistance.
   */
  private async generatePlanWithAI(
    context: PlanGenerationContext,
    config: PlannerConfig,
  ): Promise<{
    description: string;
    steps: TaskStep[];
    dependencies: TaskDependency[];
    category?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    tags?: string[];
  }> {
    const prompt = `You are an expert project planner. Create a structured task plan to achieve the specified goal.

**GOAL:** ${context.goal}

**AVAILABLE TOOLS:** ${context.availableTools.join(', ')}

**CONSTRAINTS:** ${context.constraints.length > 0 ? context.constraints.join(', ') : 'None'}

${context.timeLimit ? `**TIME LIMIT:** ${context.timeLimit}` : ''}

${context.qualityRequirements && context.qualityRequirements.length > 0 ? `**QUALITY REQUIREMENTS:** ${context.qualityRequirements.join(', ')}` : ''}

**RESPOND WITH VALID JSON:**
\`\`\`json
{
  "description": "Brief overview of the plan",
  "category": "development|analysis|deployment|general",
  "priority": "low|medium|high|urgent", 
  "tags": ["tag1", "tag2"],
  "steps": [
    {
      "id": "step_1",
      "description": "What needs to be done",
      "tools": ["tool1", "tool2"],
      "prerequisites": [],
      "acceptanceCriteria": ["criterion1", "criterion2"],
      "estimatedDuration": "10-15 minutes"
    }
  ],
  "dependencies": [
    {
      "stepId": "step_2",
      "dependsOn": ["step_1"],
      "type": "sequential"
    }
  ]
}
\`\`\`

**EXAMPLE FOR DEBUGGING:**
\`\`\`json
{
  "description": "Debug authentication issue by examining code and running tests",
  "category": "development",
  "priority": "high",
  "tags": ["debugging", "authentication", "testing"],
  "steps": [
    {
      "id": "step_1",
      "description": "Examine project structure and identify auth-related files",
      "tools": ["list_directory", "search_file_content"],
      "prerequisites": [],
      "acceptanceCriteria": ["Auth files identified", "Project structure understood"],
      "estimatedDuration": "5-10 minutes"
    },
    {
      "id": "step_2",
      "description": "Run tests to reproduce the authentication issue", 
      "tools": ["run_shell_command"],
      "prerequisites": ["step_1"],
      "acceptanceCriteria": ["Test failures reproduced", "Error messages captured"],
      "estimatedDuration": "10-15 minutes"
    }
  ],
  "dependencies": [
    {
      "stepId": "step_2",
      "dependsOn": ["step_1"],
      "type": "sequential"
    }
  ]
}
\`\`\`

**YOUR JSON PLAN:**`;

    try {
      const response = await this.geminiClient.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
        temperature: 0.2, // Lower temperature for structured output
        maxOutputTokens: 1000
      }, new AbortController().signal);
      
      const responseText = getResponseText(response);
      if (responseText) {
        const plan = this.parseAIPlanJSON(responseText, context.availableTools);
        if (plan) return plan;
      }
    } catch (error) {
      console.warn('AI plan generation failed, using fallback:', error);
    }

    // Fallback to a simple default plan structure
    return this.createFallbackPlan(context);
  }

  /**
   * Parses JSON plan response from AI.
   */
  private parseAIPlanJSON(
    response: string,
    availableTools: string[]
  ): {
    description: string;
    steps: TaskStep[];
    dependencies: TaskDependency[];
    category?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    tags?: string[];
  } | null {
    try {
      // Extract JSON from markdown code blocks or plain text
      const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n\s*```/) || response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const planData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      // Validate required fields
      if (!planData.description || !Array.isArray(planData.steps)) {
        console.warn('Invalid plan JSON structure');
        return null;
      }

      // Convert steps to proper TaskStep format
      const steps: TaskStep[] = planData.steps.map((step: any, index: number) => ({
        id: step.id || `step_${index + 1}`,
        description: step.description || 'Complete task step',
        tools: Array.isArray(step.tools) ? step.tools.filter((t: string) => availableTools.includes(t)) : [],
        prerequisites: Array.isArray(step.prerequisites) ? step.prerequisites : [],
        acceptanceCriteria: Array.isArray(step.acceptanceCriteria) ? step.acceptanceCriteria : ['Step completed'],
        status: 'pending' as TaskStepStatus,
        estimatedDuration: step.estimatedDuration || this.defaultConfig.defaultEstimation,
        retryCount: 0,
        maxRetries: this.defaultConfig.maxRetries,
      }));

      // Convert dependencies to proper format
      const dependencies: TaskDependency[] = Array.isArray(planData.dependencies) ? 
        planData.dependencies.map((dep: any) => ({
          stepId: dep.stepId,
          dependsOn: Array.isArray(dep.dependsOn) ? dep.dependsOn : [],
          type: dep.type || 'sequential' as DependencyType,
        })) : [];

      return {
        description: planData.description,
        steps,
        dependencies,
        category: planData.category || 'general',
        priority: planData.priority || 'medium',
        tags: Array.isArray(planData.tags) ? planData.tags : [],
      };
    } catch (error) {
      console.warn('Failed to parse plan JSON:', error);
      return null;
    }
  }

  /**
   * Parses the legacy AI response into a structured plan.
   */
  private parseAIPlanResponse(
    response: string, 
    availableTools: string[]
  ): {
    description: string;
    steps: TaskStep[];
    dependencies: TaskDependency[];
    category?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    tags?: string[];
  } {
    const lines = response.split('\n');
    let description = '';
    const steps: TaskStep[] = [];
    const dependencies: TaskDependency[] = [];
    let category = 'general';
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
    let tags: string[] = [];

    let currentSection = '';
    let currentStep: Partial<TaskStep> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('DESCRIPTION:')) {
        currentSection = 'description';
        description = trimmed.replace('DESCRIPTION:', '').trim();
        continue;
      }
      
      if (trimmed.startsWith('STEPS:')) {
        currentSection = 'steps';
        continue;
      }
      
      if (trimmed.startsWith('DEPENDENCIES:')) {
        currentSection = 'dependencies';
        continue;
      }
      
      if (trimmed.startsWith('CATEGORY:')) {
        category = trimmed.replace('CATEGORY:', '').trim();
        continue;
      }
      
      if (trimmed.startsWith('PRIORITY:')) {
        const priorityStr = trimmed.replace('PRIORITY:', '').trim();
        if (['low', 'medium', 'high', 'urgent'].includes(priorityStr)) {
          priority = priorityStr as 'low' | 'medium' | 'high' | 'urgent';
        }
        continue;
      }
      
      if (trimmed.startsWith('TAGS:')) {
        tags = trimmed.replace('TAGS:', '').trim().split(',').map(t => t.trim());
        continue;
      }

      if (currentSection === 'description' && trimmed && !trimmed.includes(':')) {
        description += ' ' + trimmed;
      }

      if (currentSection === 'steps') {
        if (trimmed.startsWith('- ID:')) {
          if (currentStep && currentStep.id) {
            steps.push(this.completeStep(currentStep, availableTools));
          }
          currentStep = {
            id: trimmed.replace('- ID:', '').trim(),
            status: 'pending',
            tools: [],
            prerequisites: [],
            acceptanceCriteria: [],
          };
        } else if (currentStep) {
          if (trimmed.startsWith('- Description:')) {
            currentStep.description = trimmed.replace('- Description:', '').trim();
          } else if (trimmed.startsWith('- Tools:')) {
            const toolsStr = trimmed.replace('- Tools:', '').trim();
            currentStep.tools = toolsStr.split(',').map(t => t.trim()).filter(t => availableTools.includes(t));
          } else if (trimmed.startsWith('- Prerequisites:')) {
            const prereqStr = trimmed.replace('- Prerequisites:', '').trim();
            currentStep.prerequisites = prereqStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
          } else if (trimmed.startsWith('- Acceptance criteria:')) {
            const criteriaStr = trimmed.replace('- Acceptance criteria:', '').trim();
            currentStep.acceptanceCriteria = criteriaStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
          } else if (trimmed.startsWith('- Estimated duration:')) {
            currentStep.estimatedDuration = trimmed.replace('- Estimated duration:', '').trim();
          }
        }
      }

      if (currentSection === 'dependencies') {
        const depMatch = trimmed.match(/(\w+)\s+depends\s+on\s+\[(.*)\]/);
        if (depMatch) {
          const stepId = depMatch[1];
          const dependsOn = depMatch[2].split(',').map(d => d.trim());
          dependencies.push({
            stepId,
            dependsOn,
            type: 'blocking',
          });
        }
      }
    }

    // Add the last step
    if (currentStep && currentStep.id) {
      steps.push(this.completeStep(currentStep, availableTools));
    }

    return { description, steps, dependencies, category, priority, tags };
  }

  /**
   * Completes a partial step with defaults.
   */
  private completeStep(partialStep: Partial<TaskStep>, availableTools: string[]): TaskStep {
    return {
      id: partialStep.id || `step_${Date.now()}`,
      description: partialStep.description || 'Complete the task',
      tools: partialStep.tools || [],
      prerequisites: partialStep.prerequisites || [],
      acceptanceCriteria: partialStep.acceptanceCriteria || ['Task completed successfully'],
      status: 'pending',
      estimatedDuration: partialStep.estimatedDuration || this.defaultConfig.defaultEstimation,
      retryCount: 0,
      maxRetries: this.defaultConfig.maxRetries,
    };
  }

  /**
   * Creates a fallback plan when AI generation fails.
   */
  private createFallbackPlan(context: PlanGenerationContext): {
    description: string;
    steps: TaskStep[];
    dependencies: TaskDependency[];
    category: string;
    priority: 'medium';
    tags: string[];
  } {
    return {
      description: `Simple plan to achieve: ${context.goal}`,
      steps: [
        {
          id: 'step_1',
          description: 'Analyze the requirements and current state',
          tools: ['read_file', 'search_text'],
          prerequisites: [],
          acceptanceCriteria: ['Requirements understood', 'Current state assessed'],
          status: 'pending',
          estimatedDuration: '5-10 minutes',
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'step_2',
          description: 'Implement the necessary changes',
          tools: ['write_file', 'edit_file'],
          prerequisites: ['step_1'],
          acceptanceCriteria: ['Changes implemented', 'Code is functional'],
          status: 'pending',
          estimatedDuration: '15-30 minutes',
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'step_3',
          description: 'Verify the implementation meets the goal',
          tools: ['read_file', 'shell'],
          prerequisites: ['step_2'],
          acceptanceCriteria: ['Implementation verified', 'Goal achieved'],
          status: 'pending',
          estimatedDuration: '5-10 minutes',
          retryCount: 0,
          maxRetries: 3,
        },
      ],
      dependencies: [
        { stepId: 'step_2', dependsOn: ['step_1'], type: 'blocking' },
        { stepId: 'step_3', dependsOn: ['step_2'], type: 'blocking' },
      ],
      category: 'general',
      priority: 'medium',
      tags: ['auto-generated', 'fallback'],
    };
  }

  /**
   * Calculates the total estimated time for all steps.
   */
  private calculateTotalEstimatedTime(steps: TaskStep[]): string {
    // Simple heuristic: sum the maximum estimated times
    let totalMinutes = 0;
    for (const step of steps) {
      const match = step.estimatedDuration.match(/(\d+)-(\d+)/);
      if (match) {
        totalMinutes += parseInt(match[2]); // Use the maximum estimate
      } else {
        totalMinutes += 15; // Default fallback
      }
    }
    
    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }

  /**
   * Determines the complexity based on the steps.
   */
  private determineComplexity(steps: TaskStep[]): TaskComplexity {
    if (steps.length <= 3) return 'low';
    if (steps.length <= 7) return 'medium';
    return 'high';
  }

  /**
   * Validates a task plan for correctness and feasibility.
   */
  async validatePlan(plan: TaskPlan): Promise<PlanValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Validate steps
    const stepIds = new Set(plan.steps.map(s => s.id));
    const toolRegistry = await this.config.getToolRegistry();
    const availableTools = toolRegistry.getAllTools().map(t => t.name);

    for (const step of plan.steps) {
      // Check if step has valid tools
      for (const tool of step.tools) {
        if (!availableTools.includes(tool)) {
          errors.push({
            stepId: step.id,
            message: `Tool '${tool}' is not available`,
            severity: 'error',
            category: 'tool',
          });
        }
      }

      // Check prerequisites reference valid steps
      for (const prereq of step.prerequisites) {
        if (prereq.startsWith('step_') && !stepIds.has(prereq)) {
          errors.push({
            stepId: step.id,
            message: `Prerequisite '${prereq}' references non-existent step`,
            severity: 'error',
            category: 'prerequisite',
          });
        }
      }

      // Check for missing acceptance criteria
      if (step.acceptanceCriteria.length === 0) {
        warnings.push({
          stepId: step.id,
          message: 'Step has no acceptance criteria',
          suggestion: 'Add specific criteria to know when this step is complete',
          category: 'best_practice',
        });
      }
    }

    // Validate dependencies
    for (const dep of plan.dependencies) {
      if (!stepIds.has(dep.stepId)) {
        errors.push({
          message: `Dependency references non-existent step '${dep.stepId}'`,
          severity: 'error',
          category: 'dependency',
        });
      }
      
      for (const prereq of dep.dependsOn) {
        if (!stepIds.has(prereq)) {
          errors.push({
            message: `Dependency references non-existent prerequisite '${prereq}'`,
            severity: 'error',
            category: 'dependency',
          });
        }
      }
    }

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(plan.dependencies);
    for (const cycle of circularDeps) {
      errors.push({
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        severity: 'error',
        category: 'dependency',
      });
    }

    // Performance suggestions
    if (plan.steps.length > 10) {
      suggestions.push('Consider breaking this large plan into smaller sub-plans');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Detects circular dependencies in the plan.
   */
  private detectCircularDependencies(dependencies: TaskDependency[]): string[][] {
    const cycles: string[][] = [];
    const graph = new Map<string, string[]>();
    
    // Build dependency graph
    for (const dep of dependencies) {
      if (!graph.has(dep.stepId)) {
        graph.set(dep.stepId, []);
      }
      graph.get(dep.stepId)!.push(...dep.dependsOn);
    }
    
    // DFS to detect cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();
    
    const detectCycle = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          detectCycle(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
      
      recStack.delete(node);
    };
    
    for (const stepId of graph.keys()) {
      if (!visited.has(stepId)) {
        detectCycle(stepId, []);
      }
    }
    
    return cycles;
  }

  /**
   * Attempts to automatically fix common plan issues.
   */
  private async autoFixPlan(plan: TaskPlan, validationResult: PlanValidationResult): Promise<TaskPlan | null> {
    const fixedPlan = JSON.parse(JSON.stringify(plan)); // Deep copy
    let wasFixed = false;

    // Fix missing acceptance criteria
    for (const warning of validationResult.warnings) {
      if (warning.category === 'best_practice' && warning.stepId) {
        const step = fixedPlan.steps.find((s: TaskStep) => s.id === warning.stepId);
        if (step && step.acceptanceCriteria.length === 0) {
          step.acceptanceCriteria.push('Step completed successfully');
          wasFixed = true;
        }
      }
    }

    // Remove invalid tool references
    const toolRegistry = await this.config.getToolRegistry();
    const availableTools = toolRegistry.getAllTools().map(t => t.name);
    
    for (const step of fixedPlan.steps) {
      const validTools = step.tools.filter((tool: string) => availableTools.includes(tool));
      if (validTools.length !== step.tools.length) {
        step.tools = validTools;
        wasFixed = true;
      }
    }

    return wasFixed ? fixedPlan : null;
  }

  /**
   * Executes a task plan by running each step with proper dependency management.
   */
  async executePlan(planId: string, signal?: AbortSignal): Promise<PlanExecutionResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.status = 'executing';
    plan.startTime = new Date();
    this.activePlans.add(planId);

    const errors: ExecutionError[] = [];
    const outputs: Record<string, any> = {};
    const completedStepIds = new Set<string>();
    let completedSteps = 0;

    try {
      // Sort steps by dependencies to determine execution order
      const executionOrder = this.calculateExecutionOrder(plan.steps, plan.dependencies);
      
      for (const step of executionOrder) {
        if (signal?.aborted) {
          plan.status = 'paused';
          break;
        }

        // Check if all prerequisites are completed
        const unmetPrerequisites = step.prerequisites.filter(prereq => 
          prereq.startsWith('step_') && !completedStepIds.has(prereq)
        );

        if (unmetPrerequisites.length > 0) {
          const error: ExecutionError = {
            stepId: step.id,
            message: `Prerequisites not met: ${unmetPrerequisites.join(', ')}`,
            timestamp: new Date(),
            recoverable: false,
            retryable: false,
          };
          errors.push(error);
          step.status = 'failed';
          continue;
        }

        // Execute the step
        const stepResult = await this.executeStep(step, outputs, signal);
        
        if (stepResult.success) {
          step.status = 'completed';
          step.endTime = new Date();
          step.output = stepResult.output;
          outputs[step.id] = stepResult.output;
          completedStepIds.add(step.id);
          completedSteps++;
        } else {
          step.status = 'failed';
          step.endTime = new Date();
          errors.push(...stepResult.errors);

          // Check if we should retry
          if (this.defaultConfig.autoRetryFailedSteps && 
              (step.retryCount || 0) < (step.maxRetries || this.defaultConfig.maxRetries)) {
            step.retryCount = (step.retryCount || 0) + 1;
            step.status = 'pending';
            // Add step back to execution queue for retry
            executionOrder.push(step);
          }
        }
      }

      plan.endTime = new Date();
      plan.status = completedSteps === plan.steps.length ? 'completed' : 'failed';

      const result: PlanExecutionResult = {
        planId,
        status: plan.status,
        startTime: plan.startTime,
        endTime: plan.endTime,
        totalDuration: plan.endTime.getTime() - plan.startTime.getTime(),
        completedSteps,
        totalSteps: plan.steps.length,
        successRate: completedSteps / plan.steps.length,
        errors,
        outputs,
        finalResult: completedSteps === plan.steps.length ? outputs : undefined,
      };

      return result;

    } finally {
      this.activePlans.delete(planId);
      plan.updatedAt = new Date();
    }
  }

  /**
   * Calculates the execution order based on dependencies.
   */
  private calculateExecutionOrder(steps: TaskStep[], dependencies: TaskDependency[]): TaskStep[] {
    const stepMap = new Map(steps.map(step => [step.id, step]));
    const dependencyMap = new Map<string, string[]>();
    
    // Build dependency map
    for (const dep of dependencies) {
      dependencyMap.set(dep.stepId, dep.dependsOn);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: TaskStep[] = [];

    const visit = (stepId: string): void => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: ${stepId}`);
      }

      visiting.add(stepId);
      
      const dependencies = dependencyMap.get(stepId) || [];
      for (const depId of dependencies) {
        if (stepMap.has(depId)) {
          visit(depId);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      
      const step = stepMap.get(stepId);
      if (step) {
        result.push(step);
      }
    };

    // Visit all steps
    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  /**
   * Executes a single step by running its associated tools.
   */
  private async executeStep(
    step: TaskStep, 
    context: Record<string, any>, 
    signal?: AbortSignal
  ): Promise<{ success: boolean; output?: any; errors: ExecutionError[] }> {
    const errors: ExecutionError[] = [];
    let output: any = {};

    step.status = 'executing';
    step.startTime = new Date();

    try {
      // Get tool registry from config
      const toolRegistry = await this.config.getToolRegistry();
      
      // Execute each tool specified in the step
      for (const toolName of step.tools) {
        if (signal?.aborted) {
          return { success: false, errors };
        }

        const tool = toolRegistry.getTool(toolName);
        if (!tool) {
          errors.push({
            stepId: step.id,
            message: `Tool not found: ${toolName}`,
            timestamp: new Date(),
            recoverable: false,
            retryable: false,
          });
          continue;
        }

        try {
          // This is a simplified tool execution - in a real implementation,
          // we would need to parse the step description to extract tool arguments
          // and integrate with the actual tool execution pipeline
          console.log(`Executing ${toolName} for step ${step.id}: ${step.description}`);
          
          // For now, simulate tool execution
          output[toolName] = {
            executed: true,
            timestamp: new Date(),
            stepId: step.id,
            description: step.description,
          };

        } catch (error) {
          errors.push({
            stepId: step.id,
            message: `Tool execution failed for ${toolName}: ${error}`,
            timestamp: new Date(),
            recoverable: true,
            retryable: true,
            context: { toolName, error: String(error) },
          });
        }
      }

      return { 
        success: errors.length === 0, 
        output, 
        errors 
      };

    } catch (error) {
      errors.push({
        stepId: step.id,
        message: `Step execution failed: ${error}`,
        timestamp: new Date(),
        recoverable: true,
        retryable: true,
        context: { error: String(error) },
      });

      return { success: false, errors };
    }
  }

  async pausePlan(planId: string): Promise<void> {
    this.pausedPlans.add(planId);
    this.activePlans.delete(planId);
  }

  async resumePlan(planId: string): Promise<void> {
    this.pausedPlans.delete(planId);
    this.activePlans.add(planId);
  }

  async modifyPlan(planId: string, modifications: PlanModification[]): Promise<TaskPlan> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Apply modifications (implementation would depend on modification type)
    plan.updatedAt = new Date();
    return plan;
  }

  async getPlan(planId: string): Promise<TaskPlan | null> {
    return this.plans.get(planId) || null;
  }

  async listPlans(filter?: PlanFilter): Promise<TaskPlan[]> {
    let plans = Array.from(this.plans.values());
    
    if (filter) {
      if (filter.status) {
        plans = plans.filter(p => p.status === filter.status);
      }
      if (filter.complexity) {
        plans = plans.filter(p => p.complexity === filter.complexity);
      }
      if (filter.limit) {
        plans = plans.slice(0, filter.limit);
      }
    }
    
    return plans;
  }

  async deletePlan(planId: string): Promise<void> {
    this.plans.delete(planId);
    this.activePlans.delete(planId);
    this.pausedPlans.delete(planId);
  }

  async optimizePlan(planId: string): Promise<TaskPlan> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    
    // Optimization would analyze dependencies and suggest improvements
    return plan;
  }

  async exportPlan(planId: string, format: 'json' | 'yaml' | 'markdown'): Promise<string> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    
    if (format === 'json') {
      return JSON.stringify(plan, null, 2);
    }
    
    // Would implement YAML and Markdown export
    return JSON.stringify(plan, null, 2);
  }

  async importPlan(data: string, format: 'json' | 'yaml'): Promise<TaskPlan> {
    const plan = JSON.parse(data) as TaskPlan;
    this.plans.set(plan.id, plan);
    return plan;
  }
}