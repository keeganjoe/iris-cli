#!/usr/bin/env node

// Simple MCP server for testing
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: "test-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "test_tool",
        description: "A simple test tool",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "A test message",
            },
          },
          required: ["message"],
        },
      },
    ],
  };
});

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "test_tool") {
    return {
      content: [
        {
          type: "text",
          text: `Test tool called with message: ${request.params.arguments.message}`,
        },
      ],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);