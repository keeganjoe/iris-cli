#!/usr/bin/env node

/**
 * Script to create test tasks for testing the task management system
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Create test tasks in the expected location
function createTestTasks() {
  const geminiDir = join(homedir(), '.gemini');
  const tasksDir = join(geminiDir, 'tasks');
  const checkpointsDir = join(tasksDir, 'checkpoints');
  
  // Ensure directories exist
  if (!existsSync(geminiDir)) mkdirSync(geminiDir, { recursive: true });
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  if (!existsSync(checkpointsDir)) mkdirSync(checkpointsDir, { recursive: true });
  
  // Create sample tasks
  const tasks = [
    {
      id: 'test-web-app-001',
      description: 'Build a React web application with authentication',
      goals: [
        {
          id: 'goal-1',
          description: 'Setup React project structure',
          priority: 'high',
          validationMethod: 'file_system_check',
          achieved: true,
          validationResult: {
            success: true,
            details: 'React project initialized successfully',
            timestamp: new Date()
          }
        },
        {
          id: 'goal-2', 
          description: 'Implement user authentication',
          priority: 'high',
          validationMethod: 'test_execution',
          achieved: false
        }
      ],
      subtasks: [
        {
          id: 'subtask-1',
          parentTaskId: 'test-web-app-001',
          description: 'Initialize React project',
          status: 'completed',
          progress: 100,
          dependencies: [],
          requiredTools: ['run_shell_command'],
          startedAt: new Date(Date.now() - 3600000), // 1 hour ago
          completedAt: new Date(Date.now() - 3000000), // 50 minutes ago
          actualDuration: 600000 // 10 minutes
        },
        {
          id: 'subtask-2',
          parentTaskId: 'test-web-app-001',
          description: 'Setup authentication system',
          status: 'in_progress',
          progress: 60,
          dependencies: ['subtask-1'],
          requiredTools: ['write_file', 'run_shell_command'],
          startedAt: new Date(Date.now() - 2400000) // 40 minutes ago
        },
        {
          id: 'subtask-3',
          parentTaskId: 'test-web-app-001',
          description: 'Add protected routes',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-2'],
          requiredTools: ['write_file', 'read_file']
        }
      ],
      dependencies: [],
      status: 'in_progress',
      progress: 53, // (100 + 60 + 0) / 3
      priority: 'high',
      createdAt: new Date(Date.now() - 4000000), // ~1 hour ago
      startedAt: new Date(Date.now() - 3600000),
      metadata: {
        originalRequest: 'Create a full-stack web application with user authentication and protected routes',
        projectContext: {
          workingDirectory: '/Users/test/projects/web-app',
          gitBranch: 'main'
        }
      }
    },
    {
      id: 'test-api-service-002',
      description: 'Build REST API with database integration',
      goals: [
        {
          id: 'goal-api-1',
          description: 'Setup Express server',
          priority: 'high',
          validationMethod: 'test_execution',
          achieved: false
        }
      ],
      subtasks: [
        {
          id: 'subtask-api-1',
          parentTaskId: 'test-api-service-002',
          description: 'Initialize Node.js project',
          status: 'failed',
          progress: 0,
          dependencies: [],
          requiredTools: ['run_shell_command'],
          error: {
            message: 'npm install failed due to network timeout',
            details: 'Error: connect ETIMEDOUT 104.16.16.35:443',
            timestamp: new Date(Date.now() - 1800000) // 30 minutes ago
          }
        }
      ],
      dependencies: [],
      status: 'failed',
      progress: 0,
      priority: 'medium',
      createdAt: new Date(Date.now() - 2000000), // 33 minutes ago
      startedAt: new Date(Date.now() - 1900000),
      error: {
        message: 'Task failed due to subtask failure',
        details: 'Subtask subtask-api-1 failed with network timeout',
        timestamp: new Date(Date.now() - 1800000)
      },
      metadata: {
        originalRequest: 'Create a RESTful API service with database connectivity',
        projectContext: {
          workingDirectory: '/Users/test/projects/api-service',
          gitBranch: 'develop'
        }
      }
    }
  ];
  
  // Write tasks to files
  tasks.forEach(task => {
    const taskFile = join(tasksDir, `task-${task.id}.json`);
    writeFileSync(taskFile, JSON.stringify(task, null, 2));
    console.log(`✅ Created task: ${taskFile}`);
  });
  
  // Create sample checkpoints for the in-progress task
  const checkpoint = {
    taskId: 'test-web-app-001',
    checkpointId: `checkpoint_${Date.now()}_abc123`,
    timestamp: new Date(),
    version: '1.0',
    taskSnapshot: {
      task: tasks[0],
      completedSubtasks: ['subtask-1'],
      currentSubtask: 'subtask-2',
      failedSubtasks: []
    },
    executionState: {
      toolCallHistory: [
        {
          id: 'tool-call-1',
          toolName: 'run_shell_command',
          parameters: { command: 'npx create-react-app my-app' },
          result: 'Project created successfully',
          executedAt: new Date(Date.now() - 3000000),
          duration: 120000,
          success: true
        }
      ],
      conversationContext: [],
      environmentState: {
        workingDirectory: '/Users/test/projects/web-app',
        sessionId: 'test-session-123',
        timestamp: new Date()
      },
      currentSubtaskId: 'subtask-2',
      currentStep: 2,
      executionVariables: {}
    },
    progress: {
      overallPercent: 53,
      subtaskProgress: {
        'subtask-1': 100,
        'subtask-2': 60,
        'subtask-3': 0
      },
      estimatedTimeRemaining: 1200000, // 20 minutes
      elapsedTime: 3600000, // 1 hour
      averageSubtaskTime: 600000, // 10 minutes
      predictedCompletion: new Date(Date.now() + 1200000)
    },
    errors: [],
    retryCount: 0,
    recoveryAttempts: [],
    metadata: {
      size: 0,
      checksum: 'abc123def456',
      restorable: true
    }
  };
  
  const checkpointFile = join(checkpointsDir, `checkpoint-${checkpoint.taskId}-${checkpoint.checkpointId}.json`);
  writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
  console.log(`✅ Created checkpoint: ${checkpointFile}`);
  
  console.log('\n🎉 Test tasks created successfully!');
  console.log('\nNow you can test:');
  console.log('1. npm start');
  console.log('2. Try: "Show me my tasks"');
  console.log('3. Try: "List all persisted tasks"');
  console.log('4. Try: "Check for tasks that need recovery"');
}

createTestTasks();