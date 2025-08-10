#!/usr/bin/env node

/**
 * Debug script to test the CLI's task loading logic directly
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

async function debugTasksCommand() {
  try {
    console.log('🔍 Debugging CLI task loading...');
    
    // Import the core services
    const coreModule = await import('./packages/core/dist/index.js');
    const { TaskPersistenceService, Config } = coreModule;
    
    console.log('✅ Successfully imported TaskPersistenceService');
    
    // Create a config similar to what the CLI would use
    const mockConfig = {
      getGeminiDir: () => join(homedir(), '.gemini'),
      getWorkingDir: () => process.cwd(),
      getSessionId: () => 'debug-session'
    };
    
    console.log(`📂 Using gemini dir: ${mockConfig.getGeminiDir()}`);
    console.log(`📂 Tasks directory: ${join(mockConfig.getGeminiDir(), 'tasks')}`);
    
    // Check if tasks directory exists
    const tasksDir = join(mockConfig.getGeminiDir(), 'tasks');
    console.log(`📁 Tasks directory exists: ${existsSync(tasksDir)}`);
    
    if (existsSync(tasksDir)) {
      const { readdirSync } = await import('fs');
      const files = readdirSync(tasksDir);
      console.log(`📋 Files in tasks directory: ${files.length}`);
      files.forEach(file => console.log(`   - ${file}`));
    }
    
    // Test the TaskPersistenceService
    const persistenceService = new TaskPersistenceService(mockConfig);
    console.log('✅ TaskPersistenceService created');
    
    // Try to load all tasks (same as CLI command)
    console.log('\n🔄 Loading all tasks...');
    const tasks = await persistenceService.getAllTasks();
    
    console.log(`\n📊 Found ${tasks.length} tasks:`);
    tasks.forEach(task => {
      console.log(`   📋 ${task.id}`);
      console.log(`      Description: ${task.description}`);
      console.log(`      Status: ${task.status}`);
      console.log(`      Progress: ${task.progress}%`);
      console.log(`      Subtasks: ${task.subtasks.length}`);
      console.log('');
    });
    
    if (tasks.length === 0) {
      console.log('❌ No tasks found - same result as CLI command');
      console.log('\n🔧 Possible issues:');
      console.log('   1. CLI using different config/session');
      console.log('   2. Task files exist but not being read correctly');
      console.log('   3. File format or structure issue');
    } else {
      console.log('✅ Tasks found! CLI should show them.');
      console.log('   Issue might be with CLI command registration or UI display');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugTasksCommand();