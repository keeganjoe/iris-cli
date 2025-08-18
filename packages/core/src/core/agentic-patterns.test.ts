/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Config } from '../config/config.js';
import { TaskPlanner } from './taskPlanner.js';
import { ReActServiceAI } from './reactServiceAI.js';
import { GeminiEventType } from './turn.js';

// Mock GeminiClient for testing
const mockGeminiClient = {
  generateContent: async () => {
    // Simulate AI failure to trigger fallback plan
    throw new Error('Mock AI failure to test fallback');
  },
} as any;

describe('Agentic Patterns Implementation', () => {
  let config: Config;

  beforeEach(async () => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: 'gemini-1.5-flash-002',
    });
    
    // Initialize the config to set up tool registry
    await config.initialize();
  });

  describe('Config Integration', () => {
    it('should have default ReAct settings', () => {
      const settings = config.getReActSettings();
      expect(settings).toBeDefined();
      expect(settings.enabled).toBe(false);
      expect(settings.maxCycles).toBe(5);
      expect(settings.showInternalThoughts).toBe(true);
    });

    it('should have default Planner settings', () => {
      const settings = config.getPlannerSettings();
      expect(settings).toBeDefined();
      expect(settings.enabled).toBe(false);
      expect(settings.maxSteps).toBe(20);
      expect(settings.enableParallelExecution).toBe(true);
    });

    it('should allow updating ReAct settings', () => {
      const newSettings = {
        enabled: true,
        maxCycles: 10,
        showInternalThoughts: false,
      };
      
      config.setReActSettings(newSettings);
      const updated = config.getReActSettings();
      
      expect(updated.enabled).toBe(true);
      expect(updated.maxCycles).toBe(10);
      expect(updated.showInternalThoughts).toBe(false);
    });

    it('should allow updating Planner settings', () => {
      const newSettings = {
        enabled: true,
        maxSteps: 15,
        enableParallelExecution: false,
      };
      
      config.setPlannerSettings(newSettings);
      const updated = config.getPlannerSettings();
      
      expect(updated.enabled).toBe(true);
      expect(updated.maxSteps).toBe(15);
      expect(updated.enableParallelExecution).toBe(false);
    });
  });

  describe('TaskPlanner', () => {
    let taskPlanner: TaskPlanner;

    beforeEach(() => {
      taskPlanner = new TaskPlanner(mockGeminiClient, config);
    });

    it('should initialize successfully', () => {
      expect(taskPlanner).toBeDefined();
    });

    it('should create a plan with fallback when AI fails', async () => {
      const context = {
        goal: 'Test goal',
        constraints: ['constraint1'],
        availableTools: ['read_file', 'write_file'],
        existingContext: {},
        preferences: {
          preferredComplexity: 'low' as const,
          allowParallelExecution: true,
          verboseSteps: false,
          includeAlternatives: false,
          optimizeForSpeed: true,
          optimizeForQuality: false,
        }
      };

      const plan = await taskPlanner.createPlan(context);
      
      expect(plan).toBeDefined();
      expect(plan.goal).toBe('Test goal');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.complexity).toBeDefined();
    });

    it('should validate plans correctly', async () => {
      const validPlan = {
        id: 'test-plan',
        goal: 'Test goal',
        description: 'Test description',
        steps: [
          {
            id: 'step_1',
            description: 'Test step',
            tools: ['read_file'],
            prerequisites: [],
            acceptanceCriteria: ['Step completed'],
            status: 'pending' as const,
            estimatedDuration: '5 minutes',
            retryCount: 0,
            maxRetries: 3,
          }
        ],
        dependencies: [],
        estimatedTime: '5 minutes',
        complexity: 'low' as const,
        status: 'draft' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        category: 'test',
        priority: 'medium' as const,
        tags: [],
      };

      const result = await taskPlanner.validatePlan(validPlan);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('ReActServiceAI', () => {
    let reactService: ReActServiceAI;

    beforeEach(async () => {
      reactService = new ReActServiceAI(config);
      await reactService.initialize();
    });

    it('should initialize successfully', () => {
      expect(reactService).toBeDefined();
    });

    it('should check if ReAct is active', () => {
      expect(reactService.isReActActive()).toBe(false);
    });
  });

  describe('Event Types', () => {
    it('should have all required ReAct event types', () => {
      expect(GeminiEventType.ReActCycleStarted).toBe('react_cycle_started');
      expect(GeminiEventType.ReActThought).toBe('react_thought');
      expect(GeminiEventType.ReActAction).toBe('react_action');
      expect(GeminiEventType.ReActObservation).toBe('react_observation');
      expect(GeminiEventType.ReActReflection).toBe('react_reflection');
      expect(GeminiEventType.ReActCycleCompleted).toBe('react_cycle_completed');
    });

    it('should have all required Planning event types', () => {
      expect(GeminiEventType.PlanCreated).toBe('plan_created');
      expect(GeminiEventType.PlanValidated).toBe('plan_validated');
      expect(GeminiEventType.PlanExecutionStarted).toBe('plan_execution_started');
      expect(GeminiEventType.StepStarted).toBe('step_started');
      expect(GeminiEventType.StepCompleted).toBe('step_completed');
      expect(GeminiEventType.StepFailed).toBe('step_failed');
      expect(GeminiEventType.PlanExecutionCompleted).toBe('plan_execution_completed');
    });
  });

  describe('Plan Execution', () => {
    let taskPlanner: TaskPlanner;

    beforeEach(() => {
      taskPlanner = new TaskPlanner(mockGeminiClient, config);
    });

    it('should handle plan execution lifecycle', async () => {
      // Create a simple plan first
      const context = {
        goal: 'Test execution',
        constraints: [],
        availableTools: ['read_file'],
        existingContext: {},
        preferences: {
          preferredComplexity: 'low' as const,
          allowParallelExecution: false,
          verboseSteps: false,
          includeAlternatives: false,
          optimizeForSpeed: true,
          optimizeForQuality: false,
        }
      };

      const plan = await taskPlanner.createPlan(context);
      
      // Test plan execution
      const result = await taskPlanner.executePlan(plan.id);
      
      expect(result).toBeDefined();
      expect(result.planId).toBe(plan.id);
      expect(result.status).toBeDefined();
      expect(result.totalSteps).toBe(plan.steps.length);
    });
  });
});