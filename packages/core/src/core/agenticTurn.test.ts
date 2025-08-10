/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgenticTurn, AgenticEventType } from './agenticTurn.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { GeminiEventType } from './turn.js';

// Mock GeminiChat
const mockChat = {
  getHistory: vi.fn(() => [
    {
      role: 'user',
      parts: [{ text: 'Hello' }]
    },
    {
      role: 'model', 
      parts: [{ text: 'Hi there!' }]
    }
  ])
} as unknown as GeminiChat;

// Mock Config
const mockConfig = {
  getAgenticMode: vi.fn(() => false),
  getSessionId: vi.fn(() => 'test-session'),
  getGeminiClient: vi.fn(() => ({
    generateJson: vi.fn().mockResolvedValue({
      complexity: 'simple',
      reasoning: 'Basic request',
      estimatedSubtasks: 1
    })
  })),
  getToolRegistry: vi.fn(() => Promise.resolve({
    getFunctionDeclarations: vi.fn(() => [
      { name: 'write_file', description: 'Write content to a file' }
    ])
  })),
  getWorkingDir: vi.fn(() => '/test')
} as unknown as Config;

// Mock Turn
const mockTurnRun = vi.fn();
vi.mock('./turn.js', () => ({
  Turn: class MockTurn {
    pendingToolCalls = [];
    finishReason = undefined;
    debugResponses = [];
    
    getDebugResponses() {
      return this.debugResponses;
    }
    
    run = mockTurnRun;
  },
  GeminiEventType: {
    Content: 'content',
    ToolCallRequest: 'tool_call_request',
    UserCancelled: 'user_cancelled',
    LoopDetected: 'loop_detected'
  }
}));

describe('AgenticTurn', () => {
  let agenticTurn: AgenticTurn;

  beforeEach(() => {
    vi.clearAllMocks();
    agenticTurn = new AgenticTurn(mockChat, 'test-prompt', mockConfig);
  });

  describe('run', () => {
    it('should fall back to regular turn when agentic mode is disabled', async () => {
      mockConfig.getAgenticMode = vi.fn(() => false);
      mockTurnRun.mockReturnValue(async function* () {
        yield { type: GeminiEventType.Content, value: 'Regular response' };
      }());

      const events: any[] = [];
      const stream = agenticTurn.run([{ text: 'test request' }], new AbortController().signal);

      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: AgenticEventType.AgenticModeDisabled,
        value: { reason: 'Agentic mode is not enabled in configuration' }
      });
      expect(events[1]).toMatchObject({
        type: GeminiEventType.Content,
        value: 'Regular response'
      });
    });

    it('should use regular execution for simple requests', async () => {
      mockConfig.getAgenticMode = vi.fn(() => true);
      mockTurnRun.mockReturnValue(async function* () {
        yield { type: GeminiEventType.Content, value: 'Simple response' };
      }());

      const events: any[] = [];
      const stream = agenticTurn.run([{ text: 'hello' }], new AbortController().signal);

      for await (const event of stream) {
        events.push(event);
      }

      // Should use regular execution since "hello" doesn't warrant task planning
      expect(events.some(e => e.type === GeminiEventType.Content)).toBe(true);
      expect(events.some(e => e.type === AgenticEventType.TaskPlanCreated)).toBe(false);
    });

    it('should create task plan for complex requests', async () => {
      mockConfig.getAgenticMode = vi.fn(() => true);
      
      // Mock the task planning response
      const mockTaskPlannerService = {
        createTaskPlan: vi.fn().mockResolvedValue({
          plan: {
            id: 'plan-1',
            task: {
              id: 'task-1',
              description: 'Create a new web project',
              goals: [],
              subtasks: [],
              dependencies: [],
              status: 'pending',
              progress: 0,
              priority: 2,
              createdAt: new Date(),
              metadata: {
                originalRequest: 'create a new web project with react',
                projectContext: {
                  workingDirectory: '/test',
                  openFiles: []
                }
              }
            },
            strategy: {
              allowParallelExecution: false,
              maxParallelTasks: 1,
              resourceAllocation: 'balanced',
              retryPolicy: {
                maxRetries: 3,
                backoffMultiplier: 2,
                retryableErrors: []
              }
            },
            dependencyGraph: {},
            resourceEstimates: {
              totalTokens: 1000,
              totalDuration: 30000,
              toolsRequired: ['write_file'],
              memoryRequirement: 50
            },
            createdAt: new Date(),
            status: 'approved'
          },
          confidence: 0.85,
          warnings: []
        })
      };

      // Replace the task planner service
      (agenticTurn as any).taskPlannerService = mockTaskPlannerService;

      const events: any[] = [];
      const stream = agenticTurn.run([{ text: 'create a new web project with react and then deploy it to production with proper testing and documentation' }], new AbortController().signal);

      for await (const event of stream) {
        events.push(event);
        // Limit the events we collect to avoid infinite loops in test
        if (events.length > 5) break;
      }

      // Should create a task plan for complex requests
      expect(events.some(e => e.type === AgenticEventType.TaskPlanCreated)).toBe(true);
      expect(mockTaskPlannerService.createTaskPlan).toHaveBeenCalledWith(
        'create a new web project with react and then deploy it to production with proper testing and documentation',
        expect.any(String),
        expect.any(AbortSignal)
      );
    });
  });

  describe('helper methods', () => {
    it('should correctly extract user messages from different input types', () => {
      const extractMethod = (agenticTurn as any).extractUserMessage.bind(agenticTurn);

      expect(extractMethod('simple text')).toBe('simple text');
      expect(extractMethod([{ text: 'array text' }])).toBe('array text');
      expect(extractMethod({ text: 'object text' })).toBe('object text');
      expect(extractMethod(['string1', 'string2'])).toBe('string1 string2');
    });

    it('should detect complex requests correctly', async () => {
      const shouldPlanMethod = (agenticTurn as any).shouldCreateTaskPlan.bind(agenticTurn);

      expect(await shouldPlanMethod('hello', new AbortController().signal)).toBe(false);
      expect(await shouldPlanMethod('create a new project with multiple steps', new AbortController().signal)).toBe(true);
      expect(await shouldPlanMethod('build a web application and then deploy it', new AbortController().signal)).toBe(true);
      expect(await shouldPlanMethod('implement user authentication system with JWT tokens and secure database integration for a modern web application', new AbortController().signal)).toBe(true);
    });
  });

  describe('properties', () => {
    it('should delegate properties to base turn correctly', () => {
      expect(agenticTurn.pendingToolCalls).toEqual([]);
      expect(agenticTurn.finishReason).toBeUndefined();
      expect(agenticTurn.getDebugResponses()).toEqual([]);
    });
  });
});