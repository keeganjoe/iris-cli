# Interactive CLI Testing Guide

## Start the CLI and try these approaches:

```bash
npm start
```

Then test different ways to access task functionality:

### 1. Natural Language Approach
```
"Show me my tasks"
"List all tasks"
"I want to see task status"
"Help me resume a task"
"What tasks are available?"
```

### 2. Direct Command Testing
```
/tasks list
/tasks status
/tasks recover
/help tasks
```

### 3. Context-Based Requests
```
"I need to manage my agentic tasks"
"Check if there are any interrupted tasks to resume"
"Clean up old tasks"
```

### 4. Tool-Based Approach
Ask the AI to use the task management services directly:
```
"Use the TaskPersistenceService to check for saved tasks"
"Check the .gemini directory for task files"
```