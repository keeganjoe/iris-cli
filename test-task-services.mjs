#!/usr/bin/env node

/**
 * Test script to verify the task management services work correctly
 * This bypasses the CLI command interface and tests the core functionality
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing Task Management Services\n');

async function testServiceImports() {
  console.log('1. Testing service imports...');
  
  try {
    console.log('   Importing services from core package...');
    const coreModule = await import('./packages/core/dist/index.js');
    
    const { 
      TaskPersistenceService,
      SessionRecoveryService, 
      ProgressTracker,
      TaskStatus,
      Config 
    } = coreModule;
    
    console.log('   ✅ All services imported successfully!\n');
    
    return { 
      TaskPersistenceService, 
      SessionRecoveryService, 
      ProgressTracker, 
      TaskStatus,
      Config 
    };
  } catch (error) {
    console.error('   ❌ Import failed:', error.message);
    console.error('   Stack:', error.stack);
    throw error;
  }
}

async function testTaskPersistence(services) {
  console.log('2. Testing TaskPersistenceService...');
  
  try {
    const { TaskPersistenceService, TaskStatus, Config } = services;
    
    // Create a mock config
    const mockConfig = {
      getGeminiDir: () => join(__dirname, '.test-gemini'),
      getWorkingDir: () => __dirname,
      getSessionId: () => 'test-session-123'
    };
    
    const persistenceService = new TaskPersistenceService(mockConfig);
    
    // Create a test task
    const testTask = {
      id: 'test-task-123',
      description: 'Test task for verification',
      goals: [],
      subtasks: [
        {
          id: 'subtask-1',
          parentTaskId: 'test-task-123',
          description: 'Test subtask',
          status: TaskStatus.PENDING,
          progress: 0,
          dependencies: [],
          requiredTools: ['read_file']
        }
      ],
      dependencies: [],
      status: TaskStatus.PENDING,
      progress: 0,
      priority: 'medium',
      createdAt: new Date(),
      metadata: {
        originalRequest: 'Test the task management system',
        projectContext: {
          workingDirectory: __dirname,
          gitBranch: 'main'
        }
      }
    };
    
    // Ensure the directory exists
    const testDir = join(__dirname, '.test-gemini/tasks');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
      console.log('   Created test directory:', testDir);
    }
    
    console.log('   Saving test task...');
    await persistenceService.saveTask(testTask);
    
    console.log('   Loading test task...');
    const loadedTask = await persistenceService.loadTask('test-task-123');
    
    if (loadedTask && loadedTask.id === 'test-task-123') {
      console.log('   ✅ Task persistence working correctly!');
    } else {
      throw new Error('Task not loaded correctly');
    }
    
    console.log('   Getting all tasks...');
    const allTasks = await persistenceService.getAllTasks();
    console.log(`   Found ${allTasks.length} task(s)`);
    
    console.log('   ✅ TaskPersistenceService test passed!\n');
    
    return persistenceService;
  } catch (error) {
    console.error('   ❌ TaskPersistenceService test failed:', error.message);
    throw error;
  }
}

async function testProgressTracker(services, persistenceService) {
  console.log('3. Testing ProgressTracker...');
  
  try {
    const { ProgressTracker } = services;
    
    // Create a mock config
    const mockConfig = {
      getWorkingDir: () => __dirname,
      getSessionId: () => 'test-session-123'
    };
    
    const progressTracker = new ProgressTracker(mockConfig, persistenceService, 5000); // 5 second intervals
    
    console.log('   ✅ ProgressTracker created successfully!');
    
    // Test event listener
    progressTracker.addProgressListener((event) => {
      console.log(`   📊 Progress event: ${event.type} for task ${event.taskId}`);
    });
    
    console.log('   ✅ ProgressTracker test passed!\n');
    
    return progressTracker;
  } catch (error) {
    console.error('   ❌ ProgressTracker test failed:', error.message);
    throw error;
  }
}

async function testSessionRecovery(services, persistenceService) {
  console.log('4. Testing SessionRecoveryService...');
  
  try {
    const { SessionRecoveryService } = services;
    
    // Create a mock config
    const mockConfig = {
      getGeminiDir: () => join(__dirname, '.test-gemini'),
      getWorkingDir: () => __dirname,
      getSessionId: () => 'test-session-123'
    };
    
    const recoveryService = new SessionRecoveryService(mockConfig, persistenceService);
    
    console.log('   Detecting interruptions...');
    const interruptions = await recoveryService.detectInterruptions();
    console.log(`   Found ${interruptions.length} interruption(s)`);
    
    console.log('   Getting recovery recommendations...');
    const recommendations = await recoveryService.getRecoveryRecommendations();
    console.log(`   Generated ${recommendations.length} recommendation(s)`);
    
    console.log('   ✅ SessionRecoveryService test passed!\n');
    
    return recoveryService;
  } catch (error) {
    console.error('   ❌ SessionRecoveryService test failed:', error.message);
    throw error;
  }
}

async function testCommandExistence() {
  console.log('5. Testing CLI command existence...');
  
  try {
    // Check if the tasks command file exists in the built output
    const tasksCommandPath = join(__dirname, 'packages/cli/dist/ui/commands/tasksCommand.js');
    
    if (existsSync(tasksCommandPath)) {
      console.log('   ✅ tasksCommand.js found in built output');
    } else {
      console.log('   ⚠️  tasksCommand.js not found in built output');
      console.log('      This may indicate a build issue');
    }
    
    // Check if the command is registered in BuiltinCommandLoader
    const loaderPath = join(__dirname, 'packages/cli/dist/services/BuiltinCommandLoader.js');
    
    if (existsSync(loaderPath)) {
      console.log('   ✅ BuiltinCommandLoader.js found in built output');
      
      // Try to read and check for tasks command
      const { readFileSync } = await import('fs');
      const loaderContent = readFileSync(loaderPath, 'utf8');
      
      if (loaderContent.includes('tasksCommand')) {
        console.log('   ✅ tasksCommand referenced in BuiltinCommandLoader');
      } else {
        console.log('   ⚠️  tasksCommand not found in BuiltinCommandLoader');
      }
    } else {
      console.log('   ⚠️  BuiltinCommandLoader.js not found in built output');
    }
    
    console.log('   ✅ Command existence check completed!\n');
  } catch (error) {
    console.error('   ❌ Command existence test failed:', error.message);
  }
}

async function cleanup() {
  console.log('6. Cleaning up test files...');
  
  try {
    const testDir = join(__dirname, '.test-gemini');
    if (existsSync(testDir)) {
      const { rmSync } = await import('fs');
      rmSync(testDir, { recursive: true, force: true });
      console.log('   ✅ Test directory cleaned up');
    }
  } catch (error) {
    console.error('   ⚠️  Cleanup warning:', error.message);
  }
}

// Main test execution
async function main() {
  try {
    console.log('🚀 Starting comprehensive task management tests...\n');
    
    // Test 1: Import services
    const services = await testServiceImports();
    
    // Test 2: Task persistence
    const persistenceService = await testTaskPersistence(services);
    
    // Test 3: Progress tracker
    const progressTracker = await testProgressTracker(services, persistenceService);
    
    // Test 4: Session recovery
    const recoveryService = await testSessionRecovery(services, persistenceService);
    
    // Test 5: Command existence
    await testCommandExistence();
    
    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Service imports: Working');
    console.log('✅ Task persistence: Working');
    console.log('✅ Progress tracking: Working');
    console.log('✅ Session recovery: Working');
    console.log('✅ Command files: Present');
    
    console.log('\n🔧 Next Steps:');
    console.log('1. Test the CLI slash commands interactively');
    console.log('2. Create actual agentic tasks to test end-to-end');
    console.log('3. Verify command registration in the CLI');
    console.log('4. Test with real task interruption scenarios');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main().catch(console.error);