import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { localSmoke } from '../local-smoke.mjs';
import { doctor } from '../agent-os-example/doctor.mjs';
import { isLoopbackEndpoint } from '../extension-runtime.mjs';

test('local endpoints do not accept remote hosts or credentials', async () => {
  for (const url of ['https://example.com', 'http://127.0.0.1.example.com', 'http://user:secret@localhost', 'file:///local', 'not a url']) {
    assert.equal(isLoopbackEndpoint(url), false);
    await assert.rejects(() => localSmoke({ model: 'demo', baseUrl: url }));
  }
  for (const url of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434']) assert.equal(isLoopbackEndpoint(url), true);
  for (const suffix of ['/cloud-proxy', '/?token=secret', '/#model']) {
    await assert.rejects(() => localSmoke({ model: 'demo', baseUrl: 'http://localhost:11434' + suffix }));
  }
});

test('smoke validates actual HTTP responses, missing model, redirects, and failure; server is a stub, not an LLM', async t => {
  let mode = 'ok', calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, method: req.method, body });
    if (mode === 'redirect') { res.writeHead(302, { Location: 'https://example.com' }).end(); return; }
    if (mode === 'error') { res.writeHead(503).end(); return; }
    if (mode === 'timeout') return;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/tags' ? { models: mode === 'missing' ? [] : [{ name: 'demo:local' }] } :
      { done: mode !== 'partial', message: { content: mode === 'empty' ? '' : 'Hello from a test stub' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const result = await localSmoke({ baseUrl, model: 'demo:local' });
  assert.equal(result.status, 'ready');
  assert.equal(calls[0].path, '/api/tags');
  assert.equal(calls[1].path, '/api/chat');
  assert.equal(JSON.parse(calls[1].body).stream, false);
  assert.equal(JSON.parse(calls[1].body).model, 'demo:local');
  for (mode of ['missing', 'redirect', 'error', 'partial', 'empty', 'timeout']) {
    calls = [];
    await assert.rejects(() => localSmoke({ baseUrl, model: 'demo:local', timeoutMs: 50 }));
    if (mode === 'missing') assert.equal(calls.length, 1);
  }
});

test('sanitized agent OS example passes its file/profile doctor', () => {
  const result = doctor();
  assert.deepEqual(result.missing, []);
  assert.equal(result.ready, true);
  assert.equal(result.executesCommands, false);
});
