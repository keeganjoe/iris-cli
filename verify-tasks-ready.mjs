#!/usr/bin/env node

/**
 * Quick verification that tasks system is ready
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

async function verifyTasksReady() {
  console.log('🔍 Verifying tasks system is ready...\n');
  
  const checks = [];
  
  // 1. Check if task files exist
  const tasksDir = join(homedir(), '.gemini', 'tasks');
  if (existsSync(tasksDir)) {
    const { readdirSync } = await import('fs');
    const files = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    checks.push(`✅ Task files exist: ${files.length} tasks found`);
  } else {
    checks.push('❌ Tasks directory not found');
  }
  
  // 2. Check if TaskPersistenceService can load tasks
  try {
    const coreModule = await import('./packages/core/dist/index.js');
    const { TaskPersistenceService } = coreModule;
    
    const mockConfig = {
      getGeminiDir: () => join(homedir(), '.gemini'),
      getWorkingDir: () => process.cwd(),
      getSessionId: () => 'verify-session'
    };
    
    const persistence = new TaskPersistenceService(mockConfig);
    const tasks = await persistence.getAllTasks();
    checks.push(`✅ TaskPersistenceService works: ${tasks.length} tasks loaded`);
  } catch (error) {
    checks.push(`❌ TaskPersistenceService error: ${error.message}`);
  }
  
  // 3. Check if tasksCommand built file exists
  const tasksCommandFile = './packages/cli/dist/src/ui/commands/tasksCommand.js';
  if (existsSync(tasksCommandFile)) {
    checks.push('✅ tasksCommand.js built successfully');
  } else {
    checks.push('❌ tasksCommand.js not found in build output');
  }
  
  // 4. Check if BuiltinCommandLoader includes tasks
  const loaderFile = './packages/cli/dist/src/services/BuiltinCommandLoader.js';
  if (existsSync(loaderFile)) {
    const { readFileSync } = await import('fs');
    const content = readFileSync(loaderFile, 'utf8');
    if (content.includes('tasksCommand')) {
      checks.push('✅ BuiltinCommandLoader includes tasksCommand');
    } else {
      checks.push('❌ tasksCommand not found in BuiltinCommandLoader');
    }
  } else {
    checks.push('❌ BuiltinCommandLoader.js not found');
  }
  
  // Print results
  checks.forEach(check => console.log(check));
  
  const allPassed = checks.every(check => check.startsWith('✅'));
  
  if (allPassed) {
    console.log('\n🎉 **Everything is ready!**');
    console.log('');
    console.log('**Next steps:**');
    console.log('1. Exit your current CLI session (Ctrl+C)');
    console.log('2. Start fresh: npm start');
    console.log('3. Try: /help (should show tasks command)');
    console.log('4. Use: /tasks list');
  } else {
    console.log('\n⚠️ **Issues found** - troubleshooting needed');
  }
}

verifyTasksReady().catch(console.error);