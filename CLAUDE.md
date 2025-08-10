# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Development
- `npm run build` - Build the project using the main build script
- `npm run build:all` - Build everything including sandbox and vscode extension
- `npm run build:packages` - Build all workspace packages
- `npm run bundle` - Generate bundle with git commit info and copy assets
- `npm start` - Start the development server
- `npm run debug` - Start with debug mode and inspector

### Testing
- `npm test` - Run tests for all workspace packages
- `npm run test:ci` - Run CI tests including scripts tests
- `npm run test:e2e` - Run end-to-end tests with verbose output
- `npm run test:integration:all` - Run all integration tests (none, docker, podman)
- `npm run test:integration:sandbox:none` - Run integration tests without sandbox
- `npm run test:scripts` - Run tests specifically for scripts

### Code Quality
- `npm run lint` - Run ESLint on TypeScript and integration test files
- `npm run lint:fix` - Auto-fix linting issues
- `npm run lint:ci` - Run linting for CI with zero warnings tolerance
- `npm run format` - Format code using Prettier
- `npm run typecheck` - Run TypeScript type checking for all packages
- `npm run preflight` - Complete pre-commit checks (clean, install, format, lint, build, typecheck, test)

### Authentication and Setup
- `npm run auth` - Set up both npm and docker authentication
- `npm run auth:npm` - Authenticate with Google Artifact Registry for npm
- `npm run auth:docker` - Configure Docker authentication with gcloud

### Utilities
- `npm run clean` - Clean build artifacts
- `npm run generate` - Generate git commit info
- `npm run telemetry` - Run telemetry scripts

## Architecture Overview

This is the **Gemini CLI** - a command-line AI workflow tool that connects to tools, understands code, and accelerates workflows. The architecture follows a modular design with two main packages:

### Core Packages
1. **CLI Package (`packages/cli/`)** - Frontend user interface
   - Handles user input and output presentation
   - Manages history, themes, and CLI configuration
   - Contains React-based terminal UI components
   - Implements various CLI commands and their processing

2. **Core Package (`packages/core/`)** - Backend processing engine  
   - API client for Google Gemini API
   - Tool registration and execution logic
   - Prompt construction and conversation management
   - State management and configuration handling

### Key Components
- **Tools System** (`packages/core/src/tools/`) - Extensible tool modules for file system operations, shell commands, web fetching, MCP integration
- **MCP Integration** - Model Context Protocol support for external tool servers
- **IDE Integration** - VSCode companion extension in `packages/vscode-ide-companion/`
- **Telemetry System** - Comprehensive usage and performance tracking
- **Authentication** - OAuth2 and API key authentication with Google services

### Important Implementation Details
- Built with TypeScript and uses workspaces for package management
- React-based terminal UI using Ink-like architecture
- Sandbox execution environment with configurable security policies (macOS sandbox profiles in `packages/cli/src/utils/`)
- Extensible theme system with multiple built-in themes
- Memory management and conversation checkpointing
- Integration test suite covering file system, shell, MCP, and web search operations

### Development Workflow
- Uses ESBuild for bundling with custom build scripts
- Vitest for unit testing with comprehensive test coverage
- ESLint + Prettier for code quality
- Workspace-based monorepo structure
- Docker and Podman sandbox support for secure execution
- GitHub Actions integration for automated workflows

## Key Files and Directories
- `packages/cli/src/gemini.tsx` - Main CLI application entry point
- `packages/core/src/core/client.ts` - Gemini API client implementation  
- `packages/core/src/tools/` - All available tool implementations
- `integration-tests/` - End-to-end integration test suite
- `scripts/` - Build, deployment, and utility scripts
- `docs/` - Comprehensive documentation including architecture, CLI usage, and tools API

## Authentication Requirements
The CLI requires authentication with Google services. Users can authenticate via:
- Personal Google account (60 requests/minute, 1000/day)
- Gemini API key from Google AI Studio 
- Vertex AI API key from Google Cloud
- See `docs/cli/authentication.md` for detailed setup instructions