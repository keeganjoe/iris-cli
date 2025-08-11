# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
- `npm run build` - Build all packages
- `npm run build:all` - Build main packages, sandbox, and VSCode extension
- `npm run build:packages` - Build all workspace packages
- `npm run bundle` - Generate git commit info and create bundled distribution
- `npm test` - Run tests in all packages
- `npm run test:ci` - Run tests with coverage across all packages
- `npm run test:e2e` - Run end-to-end integration tests
- `npm run test:integration:all` - Run all integration tests (none, docker, podman)

### Code Quality
- `npm run lint` - Lint TypeScript and integration test files
- `npm run lint:fix` - Auto-fix linting issues
- `npm run lint:ci` - Lint with zero warnings for CI
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type-check all packages
- `npm run preflight` - Complete pre-commit check (clean, install, format, lint, build, typecheck, test)

### Development
- `npm start` - Start the CLI in development mode
- `npm run debug` - Start with Node.js debugger
- `npm run clean` - Clean build artifacts

### Single Package Commands
Within each package (`packages/cli`, `packages/core`, `packages/test-utils`):
- `npm run build` - Build this package
- `npm run test` - Run tests for this package
- `npm run test:ci` - Run tests with coverage
- `npm run typecheck` - Type-check this package
- `npm run lint` - Lint this package
- `npm run format` - Format this package

## Using OpenAI Provider

### Setup
Set the OpenAI API key environment variable:
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
```

### Authentication
When starting the CLI, select "Use OpenAI API Key" from the authentication dialog, or set the default:
```bash
export GEMINI_DEFAULT_AUTH_TYPE="openai-api-key"
```

### Supported Models
- `gpt-4o` (default)
- `gpt-4o-mini`
- `o1-preview`
- `o1-mini`
- Custom models via configuration

### Features
- Full function calling support (compatible with existing tools)
- Streaming responses
- Token counting (estimated)
- Embeddings support
- All existing CLI tools work seamlessly

## Architecture Overview

This is a monorepo containing the Gemini CLI, a command-line AI workflow tool with the following structure:

### Core Packages
1. **`packages/cli`** - Frontend React-based terminal UI using Ink
   - Handles user input/output and display
   - Contains UI components, themes, and command processors
   - React/JSX components for terminal rendering
   - Slash command processing and completion systems

2. **`packages/core`** - Backend logic and API integration
   - Gemini API client and prompt construction
   - Tool registration and execution engine
   - File system operations, git integration, shell execution
   - MCP (Model Context Protocol) client integration
   - Telemetry and logging systems
   - Workspace context and memory management

3. **`packages/test-utils`** - Shared testing utilities
4. **`packages/vscode-ide-companion`** - VSCode extension for IDE integration

### Key Directories
- `docs/` - Comprehensive documentation including architecture, CLI usage, tools
- `scripts/` - Build scripts, telemetry utilities, and development tools
- `integration-tests/` - End-to-end test suites

### Tool System
The CLI extends Gemini's capabilities through tools in `packages/core/src/tools/`:
- File operations (`read-file.ts`, `write-file.ts`, `edit.ts`)
- Shell execution (`shell.ts`)
- Web capabilities (`web-fetch.ts`, `web-search.ts`)
- Development tools (`grep.ts`, `glob.ts`, `ls.ts`)
- MCP server integration (`mcp-client.ts`, `mcp-tool.ts`)

## Technology Stack

- **Language**: TypeScript with strict configuration
- **Frontend**: React + Ink (terminal UI library)
- **Testing**: Vitest with jsdom environment
- **Linting**: ESLint with TypeScript, React plugins
- **Bundling**: esbuild for production builds
- **Package Manager**: npm with workspaces
- **Authentication**: Google Auth Library with OAuth2

## Development Patterns

### Testing
- Test files use `.test.ts` or `.test.tsx` extensions
- Tests run with Vitest in jsdom environment
- Coverage reports generated in `coverage/` directories
- Snapshot testing for React components
- Integration tests in `/integration-tests/` directory

### Code Organization
- Strict TypeScript configuration with composite builds
- ESM modules throughout (`"type": "module"`)
- License headers required on all source files
- Shared types and utilities across packages
- Clear separation between CLI (frontend) and Core (backend)

### Configuration Files
- `tsconfig.json` - Root TypeScript configuration with project references
- `eslint.config.js` - ESLint configuration with React/TypeScript rules
- `vitest.config.ts` - Test configuration in each package
- `esbuild.config.js` - Production bundling configuration

## Important Implementation Details

### Authentication
- Supports Google OAuth, API keys (Gemini API and Vertex AI)
- OpenAI API key authentication
- OAuth token storage and refresh handling
- MCP server authentication integration

### Sandbox Execution
- Docker/Podman sandbox support for secure tool execution
- Configurable sandbox images per version
- macOS sandbox profiles for different security levels

### Memory and Context Management
- Workspace context discovery and management
- Git integration for repository context
- Memory import/export functionality
- File search and crawl caching systems

### Multi-Provider Support
- **Google Gemini**: Primary provider with full feature support
- **OpenAI**: Full integration with GPT models (gpt-4o, gpt-4o-mini, o1-preview, etc.)
- Provider-agnostic tool system works across all supported models
- Easy switching between providers via environment variables or CLI auth

### MCP Integration
- Model Context Protocol server management
- Add/list/remove MCP servers via commands
- OAuth provider integration for MCP servers
- Tool integration through MCP protocol