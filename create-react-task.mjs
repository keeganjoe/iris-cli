#!/usr/bin/env node

/**
 * Script to create a React app task using the TaskPersistenceService
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

async function createReactAppTask() {
  try {
    // Import the core services
    console.log('Importing TaskPersistenceService...');
    const coreModule = await import('./packages/core/dist/index.js');
    const { TaskPersistenceService, TaskStatus } = coreModule;
    
    // Setup directories
    const geminiDir = join(homedir(), '.gemini');
    const tasksDir = join(geminiDir, 'tasks');
    
    if (!existsSync(geminiDir)) mkdirSync(geminiDir, { recursive: true });
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    
    // Mock config for TaskPersistenceService
    const mockConfig = {
      getGeminiDir: () => geminiDir,
      getWorkingDir: () => process.cwd(),
      getSessionId: () => 'react-app-session-' + Date.now()
    };
    
    const persistenceService = new TaskPersistenceService(mockConfig);
    
    // Create the React app task
    const task = {
      id: 'react-app-auth-dashboard-' + Date.now(),
      description: 'Build React application with user authentication, protected routes, and dashboard with data visualization',
      goals: [
        {
          id: 'goal-react-setup',
          description: 'Setup React project with routing and authentication',
          priority: 'high',
          validationMethod: 'file_system_check',
          achieved: false
        },
        {
          id: 'goal-auth-system',
          description: 'Implement complete user authentication system',
          priority: 'high', 
          validationMethod: 'test_execution',
          achieved: false
        },
        {
          id: 'goal-protected-routes',
          description: 'Create protected routes with proper access control',
          priority: 'high',
          validationMethod: 'manual_verification',
          achieved: false
        },
        {
          id: 'goal-dashboard',
          description: 'Build interactive dashboard with data visualization',
          priority: 'medium',
          validationMethod: 'manual_verification', 
          achieved: false
        }
      ],
      subtasks: [
        {
          id: 'subtask-react-init',
          parentTaskId: '',
          description: 'Initialize React project with Create React App',
          status: 'pending',
          progress: 0,
          dependencies: [],
          requiredTools: ['run_shell_command'],
          estimatedDuration: 300000 // 5 minutes
        },
        {
          id: 'subtask-install-deps',
          parentTaskId: '',
          description: 'Install authentication and routing dependencies',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-react-init'],
          requiredTools: ['run_shell_command'],
          estimatedDuration: 180000 // 3 minutes
        },
        {
          id: 'subtask-auth-setup',
          parentTaskId: '',
          description: 'Setup authentication context and providers',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-install-deps'],
          requiredTools: ['write_file', 'read_file'],
          estimatedDuration: 1800000 // 30 minutes
        },
        {
          id: 'subtask-protected-routes',
          parentTaskId: '',
          description: 'Implement protected route components',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-auth-setup'],
          requiredTools: ['write_file', 'read_file'],
          estimatedDuration: 1200000 // 20 minutes
        },
        {
          id: 'subtask-dashboard-ui',
          parentTaskId: '',
          description: 'Create dashboard UI components',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-protected-routes'],
          requiredTools: ['write_file', 'read_file'],
          estimatedDuration: 2400000 // 40 minutes
        },
        {
          id: 'subtask-data-viz',
          parentTaskId: '',
          description: 'Implement data visualization with charts',
          status: 'pending',
          progress: 0,
          dependencies: ['subtask-dashboard-ui'],
          requiredTools: ['write_file', 'run_shell_command'],
          estimatedDuration: 1800000 // 30 minutes
        }
      ],
      dependencies: [],
      status: 'pending',
      progress: 0,
      priority: 'high',
      createdAt: new Date(),
      metadata: {
        originalRequest: 'Create a task to build a React application with user authentication, protected routes, and a dashboard with data visualization',
        projectContext: {
          workingDirectory: process.cwd(),
          gitBranch: 'main'
        },
        estimatedTotalDuration: 7680000, // ~2 hours
        techStack: ['React', 'React Router', 'Firebase Auth', 'Chart.js']
      }
    };
    
    // Set parent task ID for subtasks
    task.subtasks.forEach(subtask => {
      subtask.parentTaskId = task.id;
    });
    
    // Save the task
    console.log('Saving React app task...');
    await persistenceService.saveTask(task);
    
    console.log('\n✅ React app task created successfully!');
    console.log(`📋 Task ID: ${task.id}`);
    console.log(`📝 Description: ${task.description}`);
    console.log(`🎯 Goals: ${task.goals.length}`);
    console.log(`📋 Subtasks: ${task.subtasks.length}`);
    console.log(`⏱️  Estimated Duration: ${Math.round(task.metadata.estimatedTotalDuration / 60000)} minutes`);
    
    console.log('\nNow run: /tasks list');
    console.log('To see your new task in the CLI!');
    
    return task.id;
    
  } catch (error) {
    console.error('❌ Failed to create React app task:', error.message);
    throw error;
  }
}

createReactAppTask().catch(console.error);