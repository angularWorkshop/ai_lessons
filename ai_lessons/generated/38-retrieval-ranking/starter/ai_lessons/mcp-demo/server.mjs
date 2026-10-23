import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'edutec-add-only', version: '1.0.0' });
server.registerTool('add', {
  description: 'Add two finite numbers. This server exposes no file, network, or shell tool.',
  inputSchema: { a: z.number().finite(), b: z.number().finite() },
  annotations: { readOnlyHint: true },
}, async ({ a, b }) => {
  const value = a + b;
  if (!Number.isFinite(value)) return { isError: true, content: [{ type: 'text', text: 'result-overflow' }] };
  return { content: [{ type: 'text', text: JSON.stringify({ value }) }] };
});
// stdout is reserved for MCP frames; do not add console.log here.
await server.connect(new StdioServerTransport());
