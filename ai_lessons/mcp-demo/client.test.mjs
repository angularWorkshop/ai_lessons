import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real SDK connection initializes, discovers add, executes it, rejects invalid input and an unknown tool', async () => {
  const client = new Client({ name: 'edutec-test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['add']);
    const result = await client.callTool({ name: 'add', arguments: { a: 2, b: 3 } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), { value: 5 });
    for (const request of [{ name: 'add', arguments: { a: '2', b: 3 } }, { name: 'shell', arguments: { command: 'anything' } }]) {
      let rejected = false;
      try { rejected = (await client.callTool(request)).isError === true; } catch { rejected = true; }
      assert.equal(rejected, true, 'Invalid requests must not succeed');
    }
    const overflow = await client.callTool({ name: 'add', arguments: { a: Number.MAX_VALUE, b: Number.MAX_VALUE } });
    assert.equal(overflow.isError, true);
  } finally { await client.close(); await transport.close(); }
});
