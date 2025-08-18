# 🚀 **Automatic Agentic Mode Guide**

## ✨ **New Improved Behavior: No More Command Prefixes!**

You're absolutely right! The agentic patterns now work **automatically** when enabled. No need to type `/react` or `/plan` for every query.

## 📋 **How It Works Now**

### **Before (Manual):**
```bash
/react enable
/react "Analyze this codebase"          # Had to prefix every query
/react "Debug the login issue"          # Tedious!
/react "Implement user profiles"
```

### **After (Automatic):**
```bash
/react enable                           # Enable once
Analyze this codebase                   # Works automatically!
Debug the login issue                   # No prefix needed!
Implement user profiles                 # Just natural language!
```

## ⚙️ **Setup Instructions**

### 1. **Enable ReAct Mode:**
```bash
npm run start:interactive
/react enable
```

### 2. **Enable Planning Mode:**
```bash
/plan enable
```

### 3. **Now Use Natural Language:**
```bash
# These automatically trigger ReAct reasoning:
Analyze the project structure
Debug the authentication flow
Fix the TypeScript errors
Optimize the database queries

# These automatically trigger Planning:
Implement user authentication
Create a REST API with testing
Set up CI/CD pipeline
Refactor the entire frontend
```

## 🎯 **Smart Activation Logic**

### **ReAct Automatically Activates For:**
- Any query longer than 3 characters
- Complex analysis, debugging, or reasoning tasks
- Excludes simple commands like `/help`, `yes`, `no`

### **Planning Automatically Activates For:**
- Queries containing: `implement`, `create`, `build`, `develop`, `setup`
- Queries containing: `configure`, `refactor`, `optimize`, `fix`, `debug`
- Complex queries longer than 50 characters
- Multi-step implementation tasks

### **Simple Queries Stay Normal:**
- `/help`, `/quit`, `/clear`
- Single word responses: `yes`, `no`, `y`, `n`
- Very short queries (under 3 characters)

## 🔄 **Workflow Examples**

### **Development Workflow:**
```bash
# 1. Enable modes once
/react enable
/plan enable

# 2. Use natural language for everything
Analyze this React application                    # → ReAct
Implement user authentication with JWT           # → Planning  
Debug the failing unit tests                     # → ReAct
Create a dashboard with charts and filters       # → Planning
Fix the performance issues in the API            # → ReAct
```

### **Code Review Workflow:**
```bash
/react enable

Review this pull request for issues              # → ReAct
Check for security vulnerabilities               # → ReAct  
Suggest improvements for code quality            # → ReAct
```

### **Project Setup Workflow:**
```bash
/plan enable

Set up a new Next.js project with TypeScript    # → Planning
Configure ESLint, Prettier, and testing         # → Planning
Create the initial project structure            # → Planning
```

## 🎛️ **Configuration & Control**

### **Check Status:**
```bash
/react        # Shows current ReAct status
/plan         # Shows current Planning status
```

### **View Configuration:**
```bash
/react config # Detailed ReAct settings
/plan config  # Detailed Planning settings
```

### **Manual Override (Optional):**
```bash
/react "specific task"    # Force ReAct for this query
/plan "specific goal"     # Force Planning for this query
```

### **Disable When Needed:**
```bash
/react disable           # Turn off automatic ReAct
/plan disable           # Turn off automatic Planning
```

## 💡 **Pro Tips**

### **1. Start Sessions Efficiently:**
```bash
# Old way (manual)
/react enable
/react "analyze the codebase"

# New way (automatic)  
/react enable
analyze the codebase              # Just ask naturally!
```

### **2. Mix and Match:**
```bash
/react enable
/plan enable

# ReAct for analysis
What are the main components in this app?

# Planning for implementation  
Add user authentication to this app

# ReAct for debugging
Why is the login form not working?
```

### **3. Context Persistence:**
```bash
/react enable

# All these work automatically in sequence:
Analyze the database schema
Find performance bottlenecks  
Suggest optimization strategies
Implement the top 3 optimizations
```

## ⚡ **Benefits of Automatic Mode**

### **✅ Advantages:**
- **Natural Conversation:** No need to remember prefixes
- **Seamless Workflow:** Modes activate intelligently
- **Less Typing:** More time coding, less time on commands
- **Context Awareness:** Modes persist across queries
- **Smart Detection:** Right mode for the right task

### **🔧 Flexibility:**
- **Always Override:** Can still use `/react "task"` if needed
- **Easy Toggle:** Enable/disable modes as needed
- **Configuration:** Adjust behavior via settings
- **Fallback:** Graceful handling when modes fail

## 🧪 **Testing the New Behavior**

### **Quick Test:**
```bash
# 1. Start CLI
npm run start:interactive

# 2. Enable modes
/react enable
/plan enable

# 3. Test automatic activation
Analyze this codebase                    # Should show ReAct thinking
Implement a user dashboard               # Should show planning steps
Fix the TypeScript compilation errors    # Should show ReAct reasoning
```

### **Expected Output:**
- **ReAct queries:** Show thought → action → observation → reflection cycles
- **Planning queries:** Show structured steps with dependencies
- **Simple queries:** Process normally without modes

---

## 🎉 **Summary: Much Better UX!**

The agentic patterns now work like **intelligent assistants** that automatically choose the right approach:

- **Enable once** → **Use naturally**  
- **No prefixes** → **Just ask questions**
- **Smart activation** → **Right mode for the task**
- **Better workflow** → **More productive development**

This makes the AI feel more like a **collaborative partner** rather than a command-line tool!