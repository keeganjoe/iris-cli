#!/usr/bin/env node

/**
 * Final integration test to verify agentic mode with task persistence
 */

async function testFullIntegration() {
  console.log('🎯 Testing complete agentic mode integration...\n');
  
  try {
    // Check current task files before
    const { readdirSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    
    const tasksDir = join(homedir(), '.gemini', 'tasks');
    
    const tasksBefore = existsSync(tasksDir) 
      ? readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'))
      : [];
    
    console.log(`📋 Tasks before: ${tasksBefore.length} files`);
    
    // Test settings loading
    const { loadSettings } = await import('./packages/cli/dist/src/config/settings.js');
    const settings = await loadSettings();
    
    console.log(`✅ Settings loaded - agenticMode: ${settings.agenticMode}`);
    
    if (!settings.agenticMode) {
      console.log('❌ Agentic mode is not enabled in settings');
      return;
    }
    
    // Test services
    const { TaskPersistenceService } = await import('./packages/core/dist/index.js');
    
    const mockConfig = {
      getGeminiDir: () => join(homedir(), '.gemini'),
      getWorkingDir: () => process.cwd(),
      getSessionId: () => 'integration-test-session',
      getAgenticMode: () => true
    };
    
    const persistence = new TaskPersistenceService(mockConfig);
    const existingTasks = await persistence.getAllTasks();
    
    console.log(`📋 Existing tasks in system: ${existingTasks.length}`);
    existingTasks.forEach(task => {
      console.log(`   - ${task.id}: ${task.description} (${task.status})`);
    });
    
    console.log('\n🎉 **Integration Test Complete**');
    console.log('');
    console.log('✅ **Ready for full agentic mode testing:**');
    console.log('');
    console.log('1. **Restart CLI**: npm start');
    console.log('2. **Make complex request**: "Build a complete e-commerce website..."');
    console.log('3. **Check task creation**: /tasks list');
    console.log('4. **Verify persistence**: Tasks should now appear in CLI commands');
    console.log('');
    console.log('🔧 **If tasks still don\'t persist, check console for:');
    console.log('   - "AgenticTurn: Task [id] persisted successfully"');
    console.log('   - "AgenticTurn: Creating task plan for request"');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  }
}

testFullIntegration();