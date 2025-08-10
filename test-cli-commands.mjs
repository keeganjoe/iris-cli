#!/usr/bin/env node

/**
 * Test script to verify CLI command loading
 */

async function testCliCommands() {
  try {
    console.log('🔍 Testing CLI command loading...');
    
    // Import the BuiltinCommandLoader
    const { BuiltinCommandLoader } = await import('./packages/cli/dist/src/services/BuiltinCommandLoader.js');
    console.log('✅ Successfully imported BuiltinCommandLoader');
    
    // Create mock config with all required methods
    const mockConfig = {
      getGeminiDir: () => process.env.HOME + '/.gemini',
      getWorkingDir: () => process.cwd(),
      getSessionId: () => 'test-session',
      getIdeMode: () => false,
      getIdeModeFeature: () => false,
      getProjectRoot: () => process.cwd()
    };
    
    // Create loader
    const loader = new BuiltinCommandLoader(mockConfig);
    console.log('✅ BuiltinCommandLoader created');
    
    // Load commands
    const commands = await loader.loadCommands(new AbortController().signal);
    console.log(`✅ Loaded ${commands.length} commands`);
    
    // Find tasks command
    const tasksCommand = commands.find(cmd => cmd.name === 'tasks');
    if (tasksCommand) {
      console.log('✅ Found tasks command!');
      console.log(`   Name: ${tasksCommand.name}`);
      console.log(`   Description: ${tasksCommand.description}`);
      console.log(`   Subcommands: ${tasksCommand.subCommands?.length || 0}`);
      
      if (tasksCommand.subCommands) {
        console.log('   Available subcommands:');
        tasksCommand.subCommands.forEach(sub => {
          console.log(`     - ${sub.name}: ${sub.description}`);
        });
      }
    } else {
      console.log('❌ Tasks command not found!');
      console.log('Available commands:');
      commands.forEach(cmd => {
        console.log(`   - ${cmd.name}: ${cmd.description || 'No description'}`);
      });
    }
    
    console.log('\n🎯 Command loading test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testCliCommands();