/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Demo script showcasing the new agentic AI capabilities
 */

import { TaskPlannerService } from '../services/taskPlannerService.js';
import { AgenticTurn, AgenticEventType } from '../core/agenticTurn.js';
import { Config } from '../config/config.js';

/**
 * Demo: Task Planning and Decomposition
 */
export async function demoTaskPlanning() {
  console.log('=== Agentic AI Demo: Task Planning ===\n');

  // Mock config (in real usage, this would be properly initialized)
  const mockConfig = {
    getGeminiClient: () => ({
      generateJson: async () => ({
        complexity: 'complex',
        reasoning: 'Multi-step web development task',
        estimatedSubtasks: 4,
        description: 'Set up a complete React application with authentication',
        goals: [
          {
            id: 'goal_1',
            description: 'Working React application with routing',
            successCriteria: {
              description: 'Application runs and displays pages correctly',
              conditions: ['npm start works', 'routes are functional', 'components render']
            },
            validationMethod: 'tool_execution'
          }
        ],
        subtasks: [
          {
            description: 'Initialize new React project with Create React App',
            dependencies: [],
            requiredTools: ['shell_tool'],
            estimatedDuration: 30000,
            priority: 3,
            context: { command: 'npx create-react-app my-app' }
          },
          {
            description: 'Install additional dependencies (React Router, Auth libraries)',
            dependencies: ['subtask_1'],
            requiredTools: ['shell_tool'],
            estimatedDuration: 20000,
            priority: 2,
            context: { 
              packages: ['react-router-dom', 'firebase', '@auth0/auth0-react']
            }
          },
          {
            description: 'Set up basic routing structure',
            dependencies: ['subtask_2'],
            requiredTools: ['write_file', 'edit_file'],
            estimatedDuration: 40000,
            priority: 2,
            context: { 
              files: ['src/App.js', 'src/pages/Home.js', 'src/pages/Login.js']
            }
          },
          {
            description: 'Implement authentication system',
            dependencies: ['subtask_3'],
            requiredTools: ['write_file', 'edit_file'],
            estimatedDuration: 60000,
            priority: 3,
            context: {
              authProvider: 'Auth0',
              components: ['LoginButton', 'LogoutButton', 'Profile']
            }
          }
        ],
        priority: 3,
        estimatedDuration: 150000
      })
    }),
    getToolRegistry: () => Promise.resolve({
      getFunctionDeclarations: () => [
        { name: 'shell_tool', description: 'Execute shell commands' },
        { name: 'write_file', description: 'Write content to files' },
        { name: 'edit_file', description: 'Edit existing files' }
      ]
    }),
    getWorkingDir: () => '/demo/project'
  } as unknown as Config;

  const taskPlanner = new TaskPlannerService(mockConfig);

  try {
    console.log('🤖 Creating task plan for: "Set up a React app with authentication and routing"');
    
    const planningResult = await taskPlanner.createTaskPlan(
      'Set up a React app with authentication and routing, install necessary dependencies, and create a working login system',
      'User wants to build a modern web application',
      new AbortController().signal
    );

    console.log('\n✅ Task Plan Created Successfully!');
    console.log(`📊 Confidence Score: ${(planningResult.confidence * 100).toFixed(1)}%`);
    console.log(`📋 Main Task: ${planningResult.plan.task.description}`);
    console.log(`🎯 Goals: ${planningResult.plan.task.goals.length}`);
    console.log(`📝 Subtasks: ${planningResult.plan.task.subtasks.length}`);
    console.log(`⏱️  Estimated Duration: ${(planningResult.plan.resourceEstimates.totalDuration / 1000).toFixed(1)}s`);
    console.log(`🔧 Required Tools: ${planningResult.plan.resourceEstimates.toolsRequired.join(', ')}`);

    if (planningResult.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      planningResult.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log('\n📋 Subtask Breakdown:');
    planningResult.plan.task.subtasks.forEach((subtask, index) => {
      console.log(`   ${index + 1}. ${subtask.description}`);
      console.log(`      🔧 Tools: ${subtask.requiredTools.join(', ')}`);
      console.log(`      ⏱️  Duration: ${(subtask.estimatedDuration! / 1000).toFixed(1)}s`);
      console.log(`      🔗 Dependencies: ${subtask.dependencies.length > 0 ? subtask.dependencies.join(', ') : 'None'}`);
      console.log();
    });

    console.log('🎯 Goals:');
    planningResult.plan.task.goals.forEach((goal, index) => {
      console.log(`   ${index + 1}. ${goal.description}`);
      console.log(`      ✅ Success Criteria: ${goal.successCriteria.description}`);
      console.log(`      🔍 Validation: ${goal.validationMethod}`);
      console.log();
    });

  } catch (error) {
    console.error('❌ Task planning failed:', error);
  }
}

/**
 * Demo: Agentic Turn Event Types
 */
export function demoAgenticEventTypes() {
  console.log('\n=== Agentic AI Demo: Event Types ===\n');

  console.log('🎭 New Event Types for Agentic Execution:');
  console.log();

  const eventExamples = [
    {
      type: 'TaskPlanCreated',
      description: 'Emitted when a new task plan is generated',
      data: 'Contains the full task plan, confidence score, and warnings'
    },
    {
      type: 'TaskStarted', 
      description: 'Emitted when task execution begins',
      data: 'Contains the task details and metadata'
    },
    {
      type: 'TaskProgress',
      description: 'Emitted periodically to show progress updates',
      data: 'Contains progress percentage and current subtask info'
    },
    {
      type: 'SubtaskStarted',
      description: 'Emitted when a specific subtask begins execution',
      data: 'Contains subtask details and context'
    },
    {
      type: 'SubtaskCompleted',
      description: 'Emitted when a subtask finishes successfully',
      data: 'Contains completion status and results'
    },
    {
      type: 'GoalAchieved',
      description: 'Emitted when a task goal is successfully validated',
      data: 'Contains goal details and validation results'
    },
    {
      type: 'TaskCompleted',
      description: 'Emitted when the entire task finishes',
      data: 'Contains final results, statistics, and success status'
    }
  ];

  eventExamples.forEach((example, index) => {
    console.log(`${index + 1}. 📡 ${example.type}`);
    console.log(`   📝 ${example.description}`);
    console.log(`   💾 Data: ${example.data}`);
    console.log();
  });
}

/**
 * Demo: Configuration Options
 */
export function demoConfigurationOptions() {
  console.log('\n=== Agentic AI Demo: Configuration ===\n');

  console.log('⚙️  New Configuration Options:');
  console.log();

  const configOptions = [
    {
      option: 'agenticMode: boolean',
      description: 'Enable/disable agentic task planning and execution',
      default: 'false',
      impact: 'When enabled, complex requests trigger automatic task decomposition'
    },
    {
      option: 'TaskPlannerConfig.maxSubtasks',
      description: 'Maximum number of subtasks allowed in a plan',
      default: '20',
      impact: 'Prevents overly complex task plans that could be resource-intensive'
    },
    {
      option: 'TaskPlannerConfig.enableParallelExecution',
      description: 'Allow subtasks to run in parallel when possible',
      default: 'true',
      impact: 'Can significantly speed up execution for independent subtasks'
    },
    {
      option: 'TaskPlannerConfig.maxParallelTasks',
      description: 'Maximum number of subtasks to run simultaneously',
      default: '3',
      impact: 'Controls resource usage and system load during parallel execution'
    }
  ];

  configOptions.forEach((config, index) => {
    console.log(`${index + 1}. 🔧 ${config.option}`);
    console.log(`   📝 ${config.description}`);
    console.log(`   🎯 Default: ${config.default}`);
    console.log(`   💡 Impact: ${config.impact}`);
    console.log();
  });
}

/**
 * Demo: Usage Examples
 */
export function demoUsageExamples() {
  console.log('\n=== Agentic AI Demo: Usage Examples ===\n');

  console.log('💡 Example Requests That Trigger Agentic Mode:');
  console.log();

  const examples = [
    {
      request: '"Create a new Express.js API with authentication and database integration"',
      why: 'Contains "create" (complexity) + mentions multiple components (multi-step)',
      subtasks: ['Initialize Node.js project', 'Set up Express server', 'Add authentication middleware', 'Configure database connection', 'Create API routes']
    },
    {
      request: '"Build a React dashboard and then deploy it to AWS with CI/CD pipeline"',
      why: 'Contains "build" (complexity) + "and then" (multi-step indicator)',
      subtasks: ['Create React application', 'Build dashboard components', 'Set up AWS infrastructure', 'Configure CI/CD pipeline', 'Deploy application']
    },
    {
      request: '"Implement user management system with registration, login, profile editing, and admin features for a web application"',
      why: 'Contains "implement" (complexity) + long detailed request (>100 chars)',
      subtasks: ['Create user registration', 'Implement login system', 'Build profile editing', 'Add admin panel', 'Set up permissions']
    }
  ];

  examples.forEach((example, index) => {
    console.log(`${index + 1}. 📨 Request: ${example.request}`);
    console.log(`   🧠 Why Agentic: ${example.why}`);
    console.log(`   📋 Likely Subtasks:`);
    example.subtasks.forEach((subtask, i) => {
      console.log(`      ${i + 1}. ${subtask}`);
    });
    console.log();
  });

  console.log('❌ Example Requests That Use Regular Mode:');
  console.log();

  const simpleExamples = [
    '"Hello, how are you?"',
    '"What is the weather like today?"',
    '"Fix this small bug in my code"',
    '"Explain how JavaScript closures work"'
  ];

  simpleExamples.forEach((example, index) => {
    console.log(`${index + 1}. ${example} - Too simple, no task planning needed`);
  });
}

/**
 * Run the complete demo
 */
export async function runCompleteDemo() {
  console.log('🚀 Welcome to the Agentic AI Enhancement Demo!\n');
  console.log('This demo showcases Phase 1 of the Agentic AI implementation:');
  console.log('- Intelligent Task Planning and Decomposition');
  console.log('- Enhanced Turn execution with agentic capabilities');
  console.log('- New event types for progress tracking');
  console.log('- Configurable agentic behavior\n');

  await demoTaskPlanning();
  demoAgenticEventTypes();
  demoConfigurationOptions();
  demoUsageExamples();

  console.log('\n🎉 Phase 1 Implementation Complete!');
  console.log('\nWhat\'s Next in Future Phases:');
  console.log('- Phase 2: Enhanced Progress Management with persistence');
  console.log('- Phase 3: Goal-Oriented Validation with success criteria');
  console.log('- Phase 4: Smart Tool Orchestration with intelligent selection');
  console.log('- Phase 5: Resource Management and optimization');
  console.log('- Phase 6: Integration testing and production readiness');
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCompleteDemo().catch(console.error);
}