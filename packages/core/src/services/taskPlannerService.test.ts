/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPlannerService } from './taskPlannerService.js';
import { Config } from '../config/config.js';
import { TaskStatus, TaskPriority, ValidationMethod } from '../types/task.js';

// Mock the Config and GeminiClient
const mockGeminiClient = {
  generateJson: vi.fn()
};

const mockConfig = {
  getGeminiClient: vi.fn(() => mockGeminiClient),
  getToolRegistry: vi.fn(() => Promise.resolve({
    getFunctionDeclarations: vi.fn(() => [
      { name: 'write_file', description: 'Write content to a file' },
      { name: 'read_file', description: 'Read content from a file' },
      { name: 'shell_tool', description: 'Execute shell commands' }
    ])
  })),
  getWorkingDir: vi.fn(() => '/test/project')
} as unknown as Config;

describe('TaskPlannerService', () => {
  let taskPlanner: TaskPlannerService;

  beforeEach(() => {
    vi.clearAllMocks();
    taskPlanner = new TaskPlannerService(mockConfig);
  });

  describe('createTaskPlan', () => {
    it('should create a basic task plan for a simple request', async () => {
      // Mock complexity analysis response
      mockGeminiClient.generateJson
        .mockResolvedValueOnce({
          complexity: 'simple',
          reasoning: 'Basic file operation',
          estimatedSubtasks: 2,
          riskFactors: []
        })
        // Mock task decomposition response
        .mockResolvedValueOnce({
          description: 'Create a test file with content',
          goals: [{
            id: 'goal_1',
            description: 'File should be created with correct content',
            successCriteria: {
              description: 'File exists and contains expected content',
              conditions: ['File exists', 'Content matches']
            },
            validationMethod: 'file_verification'
          }],
          subtasks: [{
            description: 'Write content to test.txt file',
            dependencies: [],
            requiredTools: ['write_file'],
            estimatedDuration: 5000,
            priority: 2,
            context: { filePath: 'test.txt', content: 'Hello World' }
          }],
          priority: 2,
          estimatedDuration: 10000
        });

      const result = await taskPlanner.createTaskPlan('Create a file called test.txt with "Hello World"');

      expect(result).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.plan.task.description).toBe('Create a test file with content');
      expect(result.plan.task.subtasks).toHaveLength(1);
      expect(result.plan.task.goals).toHaveLength(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle complex requests with multiple subtasks', async () => {
      mockGeminiClient.generateJson
        .mockResolvedValueOnce({
          complexity: 'complex',
          reasoning: 'Multiple operations with dependencies',
          estimatedSubtasks: 5,
          riskFactors: ['File conflicts', 'Permission issues']
        })
        .mockResolvedValueOnce({
          description: 'Set up a new web project',
          goals: [
            {
              id: 'goal_1',
              description: 'Project structure should be created',
              successCriteria: {
                description: 'All necessary files and directories exist',
                conditions: ['package.json exists', 'src/ directory exists', 'README.md exists']
              },
              validationMethod: 'file_verification'
            },
            {
              id: 'goal_2', 
              description: 'Dependencies should be installed',
              successCriteria: {
                description: 'node_modules directory exists with required packages',
                conditions: ['node_modules exists', 'package-lock.json exists']
              },
              validationMethod: 'tool_execution'
            }
          ],
          subtasks: [
            {
              description: 'Create package.json file',
              dependencies: [],
              requiredTools: ['write_file'],
              estimatedDuration: 10000,
              priority: 3,
              context: {}
            },
            {
              description: 'Create src directory and main file',
              dependencies: ['subtask_1'],
              requiredTools: ['write_file'],
              estimatedDuration: 15000,
              priority: 2,
              context: {}
            },
            {
              description: 'Install npm dependencies',
              dependencies: ['subtask_1'],
              requiredTools: ['shell_tool'],
              estimatedDuration: 30000,
              priority: 2,
              context: {}
            }
          ],
          priority: 3,
          estimatedDuration: 60000
        });

      const result = await taskPlanner.createTaskPlan('Set up a new web project with React');

      expect(result.plan.task.subtasks).toHaveLength(3);
      expect(result.plan.task.goals).toHaveLength(2);
      expect(result.plan.dependencyGraph).toBeDefined();
      expect(result.plan.resourceEstimates.totalDuration).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
    });

    it('should handle planning errors gracefully', async () => {
      mockGeminiClient.generateJson.mockRejectedValue(new Error('API Error'));

      await expect(taskPlanner.createTaskPlan('Invalid request')).rejects.toThrow('Failed to create task plan');
    });

    it('should generate appropriate warnings for complex plans', async () => {
      // Mock a plan with many subtasks
      mockGeminiClient.generateJson
        .mockResolvedValueOnce({ complexity: 'complex', reasoning: 'Complex task', estimatedSubtasks: 15 })
        .mockResolvedValueOnce({
          description: 'Large complex task',
          goals: [{ id: 'g1', description: 'Complete task', successCriteria: { description: 'Done', conditions: [] }, validationMethod: 'llm_evaluation' }],
          subtasks: Array.from({ length: 25 }, (_, i) => ({
            description: `Subtask ${i + 1}`,
            dependencies: [],
            requiredTools: ['write_file'],
            estimatedDuration: 30000,
            priority: 2,
            context: {}
          })),
          estimatedDuration: 750000 // Over 10 minutes
        });

      const result = await taskPlanner.createTaskPlan('Very complex task');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('subtasks'))).toBe(true);
      expect(result.warnings.some(w => w.includes('10 minutes'))).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should correctly parse priority levels', async () => {
      mockGeminiClient.generateJson
        .mockResolvedValueOnce({ complexity: 'simple', reasoning: 'test', estimatedSubtasks: 1 })
        .mockResolvedValueOnce({
          description: 'Test task',
          goals: [],
          subtasks: [{
            description: 'High priority task',
            dependencies: [],
            requiredTools: [],
            estimatedDuration: 5000,
            priority: 4, // Should become CRITICAL
            context: {}
          }],
          priority: 1 // Should become LOW
        });

      const result = await taskPlanner.createTaskPlan('Test');
      
      expect(result.plan.task.priority).toBe(TaskPriority.LOW);
      expect(result.plan.task.subtasks[0].priority).toBe(TaskPriority.CRITICAL);
    });

    it('should correctly parse validation methods', async () => {
      mockGeminiClient.generateJson
        .mockResolvedValueOnce({ complexity: 'simple', reasoning: 'test', estimatedSubtasks: 1 })
        .mockResolvedValueOnce({
          description: 'Test task',
          goals: [{
            id: 'test_goal',
            description: 'Test goal',
            successCriteria: { description: 'Success', conditions: [] },
            validationMethod: 'file_verification'
          }],
          subtasks: [],
          priority: 2
        });

      const result = await taskPlanner.createTaskPlan('Test');
      
      expect(result.plan.task.goals[0].validationMethod).toBe(ValidationMethod.FILE_VERIFICATION);
    });
  });
});