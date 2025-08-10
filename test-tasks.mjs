#!/usr/bin/env node

/**
 * Test script for the new task management functionality
 * This script demonstrates how to use the task commands
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

console.log('🧪 Testing Gemini CLI Task Management System\n');

// Helper function to run CLI commands
async function runCliCommand(command, timeout = 10000) {
  return new Promise((resolve, reject) => {
    console.log(`📝 Running: ${command}`);
    
    const child = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`✅ Command completed with code: ${code}`);
      resolve({ code, output, errorOutput });
    });
    
    // Send the command after a brief delay
    setTimeout(() => {
      child.stdin.write(command + '\n');
      // For interactive commands, send quit after a delay
      setTimeout(() => {
        child.stdin.write('/quit\n');
      }, 2000);
    }, 1000);
    
    // Timeout handling
    setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, timeout);
  });
}

// Test functions
async function testTaskCommands() {
  const commands = [
    '/help tasks',  // Check if tasks command is registered
    '/tasks list',  // List existing tasks (should be empty initially)
    '/tasks recover', // Check for recovery recommendations
  ];
  
  for (const command of commands) {
    try {
      const result = await runCliCommand(command);
      console.log(`Result for "${command}":`);
      console.log(result.output);
      console.log('---\n');
    } catch (error) {
      console.error(`❌ Error running "${command}":`, error.message);
    }
  }
}

// Create a sample task scenario
async function createTestScenario() {
  console.log('🏗️  Creating test scenario...\n');
  
  // Create test directory structure
  const testDir = './test-task-scenario';
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  
  // Create a sample project to work with
  writeFileSync(join(testDir, 'package.json'), JSON.stringify({
    "name": "test-project",
    "version": "1.0.0",
    "description": "Test project for agentic tasks",
    "main": "index.js",
    "scripts": {
      "test": "echo 'Tests would run here'"
    }
  }, null, 2));
  
  writeFileSync(join(testDir, 'README.md'), `# Test Project

This is a test project for demonstrating agentic task management.

## Features
- Task persistence
- Progress tracking  
- Session recovery
`);
  
  writeFileSync(join(testDir, 'index.js'), `// Sample application
console.log('Hello from test project!');

function main() {
  // TODO: Implement main functionality
  console.log('Application running...');
}

if (require.main === module) {
  main();
}

module.exports = { main };
`);
  
  console.log('✅ Test scenario created in:', testDir);
  return testDir;
}

// Main test execution
async function main() {
  try {
    console.log('🚀 Starting task management tests...\n');
    
    // Create test scenario
    const testDir = await createTestScenario();
    
    // Test basic task commands
    await testTaskCommands();
    
    console.log(`
📋 Manual Testing Instructions:

1. **Start the CLI in agentic mode:**
   \`\`\`
   npm start
   \`\`\`

2. **Test available task commands:**
   \`\`\`
   /help tasks
   /tasks list
   /tasks recover
   \`\`\`

3. **Create a complex task that can be interrupted:**
   \`\`\`
   Create a web application with user authentication and a database backend
   \`\`\`
   (This should trigger agentic planning if agentic mode is enabled)

4. **During task execution, interrupt with Ctrl+C**

5. **Restart the CLI and test recovery:**
   \`\`\`
   /tasks list        # Should show the interrupted task
   /tasks status <task-id>  # Show detailed status
   /tasks recover     # Show recovery recommendations  
   /tasks resume <task-id>  # Resume the task
   \`\`\`

6. **Test task management:**
   \`\`\`
   /tasks abandon <task-id> --confirm  # Clean up tasks
   \`\`\`

🔧 **Configuration Notes:**
- Agentic mode must be enabled in settings
- Tasks are stored in ~/.gemini/tasks/
- Checkpoints are created every 30 seconds during execution
- Recovery plans are generated based on interruption type

🐛 **Troubleshooting:**
- If commands aren't recognized, ensure the build completed successfully
- Check ~/.gemini/tasks/ directory for persisted task files
- Use /memory show to check current memory state
- Enable debug mode for detailed logging

🧪 **Advanced Testing:**
1. Create multiple concurrent tasks
2. Test different interruption scenarios (Ctrl+C, system crash, timeout)
3. Verify checkpoint integrity with long-running tasks
4. Test recovery with different strategies
5. Validate task progress persistence across sessions
`);
    
    console.log('\n✅ Task management test setup completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);