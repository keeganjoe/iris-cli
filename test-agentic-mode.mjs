#!/usr/bin/env node

/**
 * Test script to verify agentic mode is properly loaded
 */

async function testAgenticMode() {
  try {
    console.log('🔍 Testing agentic mode configuration...\n');
    
    // Import CLI config loading
    const { loadCliConfig } = await import('./packages/cli/dist/src/config/config.js');
    const { loadSettings } = await import('./packages/cli/dist/src/config/settings.js');
    
    console.log('✅ Successfully imported config loaders');
    
    // Load settings
    const settings = await loadSettings();
    console.log('✅ Settings loaded');
    console.log(`   agenticMode setting: ${settings.agenticMode}`);
    
    // Mock argv for config loading
    const mockArgv = {
      promptInteractive: false,
      checkpointing: false,
      experimentalAcp: false,
      listExtensions: false
    };
    
    // Load full CLI config
    const config = await loadCliConfig(mockArgv);
    console.log('✅ Config created');
    
    // Test agentic mode
    const agenticModeEnabled = config.getAgenticMode();
    console.log(`   Config.getAgenticMode(): ${agenticModeEnabled}`);
    
    if (agenticModeEnabled) {
      console.log('\n🎉 **Agentic Mode is ENABLED!**');
      console.log('');
      console.log('✅ The CLI will now:');
      console.log('   - Automatically create tasks for complex requests');
      console.log('   - Use AgenticTurn for intelligent planning');
      console.log('   - Provide persistent task management'); 
      console.log('   - Support task recovery and checkpointing');
    } else {
      console.log('\n❌ **Agentic Mode is DISABLED**');
      console.log('');
      console.log('Check your ~/.gemini/settings.json file:');
      console.log('Make sure it contains: "agenticMode": true');
    }
    
    // Test task services
    const { TaskPersistenceService } = await import('./packages/core/dist/index.js');
    const persistence = new TaskPersistenceService(config);
    const existingTasks = await persistence.getAllTasks();
    console.log(`\n📋 Found ${existingTasks.length} existing tasks in system`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testAgenticMode();