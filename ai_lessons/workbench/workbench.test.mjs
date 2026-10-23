import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { runAssistant, executeAdd } from './agent.mjs';
import { retrieve, evidencePacket, cosine, demoCorpus } from './rag.mjs';
import { gradientStep, lowRankDelta } from './training-math.mjs';
import { localClient } from './local-client.mjs';

const call = (name = 'add', args = { a: 2, b: 3 }) => ({ tool_calls: [{ function: { name, arguments: args } }] });
test('agent executes add and sends actual result into the second model request', async () => {
  let calls = 0;
  const result = await runAssistant({ question: '2+3', provider: async ({ messages }) => {
    calls++;
    if (calls === 1) return call();
    assert.deepEqual(messages.at(-1), { role: 'tool', tool_name: 'add', content: '{"value":5}' });
    assert.equal(messages.at(-2).tool_calls[0].function.name, 'add');
    return { content: '5' };
  } });
  assert.equal(calls, 2); assert.equal(result.status, 'answered'); assert.equal(result.answer, '5');
  assert.deepEqual(result.trace.filter(x => x.kind === 'tool'), [{ kind: 'tool', name: 'add', value: 5 }]);
});
test('unknown tool and missing approval stop before execution', async () => {
  for (const options of [{ provider: async () => call('shell') }, { provider: async () => call(), approved: [] }]) {
    const r = await runAssistant({ question: 'test', ...options });
    assert.equal(r.status, 'denied'); assert.equal(r.trace.some(x => x.kind === 'tool'), false);
  }
});
test('invalid arguments are not coerced or executed', async () => {
  assert.equal((await runAssistant({ question: 'test', provider: async () => call('add', { a: '2', b: 3 }) })).status, 'failed');
  assert.throws(() => executeAdd({ a: 1, b: 2, command: 'ignored?' }));
  assert.throws(() => executeAdd({ a: Number.MAX_VALUE, b: Number.MAX_VALUE }));
});
test('tool replay, unsupported parallel proposals, and exhausted budget stop', async () => {
  const replay = await runAssistant({ question: 'x', provider: async () => call() });
  assert.equal(replay.reason, 'repeated-call'); assert.equal(replay.trace.filter(x => x.kind === 'tool').length, 1);
  const multi = await runAssistant({ question: 'x', provider: async () => ({ tool_calls: [...call().tool_calls, ...call().tool_calls] }) });
  assert.equal(multi.reason, 'one-call-per-turn');
  const budget = await runAssistant({ question: 'x', maxModelCalls: 1, provider: async () => call() });
  assert.equal(budget.status, 'budget-exhausted');
});
test('a provider that never responds still reaches a deadline', async () => {
  const r = await runAssistant({ question: 'x', timeoutMs: 20, provider: async () => new Promise(() => {}) });
  assert.equal(r.status, 'timed-out');
});
test('empty model content cannot be a completed answer', async () => {
  assert.equal((await runAssistant({ question: 'x', provider: async () => ({ content: ' ' }) })).status, 'failed');
});
test('cosine and retrieval respect direction, tenancy, active revision, and model identity', () => {
  assert.equal(cosine([1, 0], [10, 0]), 1);
  assert.ok(Math.abs(cosine([1, 0], [1, 1]) - 1 / Math.sqrt(2)) < 1e-12);
  for (const [a, b] of [[[0, 0], [1, 0]], [[1], [1, 0]], [[NaN], [1]]]) assert.equal(cosine(a, b), null);
  const input = { query: [1, 0], model: 'teaching-vectors-v1', tenant: 'demo', documents: demoCorpus };
  assert.deepEqual(retrieve(input).map(d => d.id), ['reset']);
  assert.deepEqual(retrieve({ ...input, model: 'different-space' }), []);
  assert.deepEqual(retrieve({ ...input, tenant: '' }), []);
  assert.deepEqual(retrieve({ ...input, documents: demoCorpus.map(d => ({ ...d, active: false })) }), []);
});
test('RAG packet includes exact source and revision; no evidence abstains', () => {
  const found = retrieve({ query: [1, 0], model: 'teaching-vectors-v1', tenant: 'demo', documents: demoCorpus });
  const packet = evidencePacket(found);
  assert.equal(packet.status, 'evidence-only');
  assert.deepEqual(packet.sources, [{ id: 'reset', revision: '2', text: demoCorpus[0].text }]);
  assert.equal(evidencePacket(found, 2).status, 'abstain');
  assert.equal(evidencePacket([]).status, 'abstain');
  assert.equal(JSON.stringify(packet).includes('private-reset'), false);
});
test('real gradient step updates both parameters and decreases loss on this example', () => {
  const r = gradientStep({ x: 1, y: 1, weight: 0, bias: 0, rate: 0.5 });
  assert.equal(r.before.probability, 0.5); assert.deepEqual(r.gradient, { weight: -0.5, bias: -0.5 });
  assert.equal(r.after.weight, 0.25); assert.equal(r.after.bias, 0.25);
  assert.ok(r.after.loss < r.before.loss); assert.ok(Math.abs(r.after.loss - 0.47407698418) < 1e-9);
  assert.throws(() => gradientStep({ x: 1, y: 2, weight: 0, bias: 0, rate: 1 }));
});
test('analytic weight gradient agrees with a numerical finite difference', () => {
  const x = { x: 0.7, y: 0, weight: 0.2, bias: -0.1, rate: 0.1 }, eps = 1e-5;
  const numerical = (gradientStep({ ...x, weight: x.weight + eps }).before.loss - gradientStep({ ...x, weight: x.weight - eps }).before.loss) / (2 * eps);
  assert.ok(Math.abs(numerical - gradientStep(x).gradient.weight) < 1e-8);
});
test('low-rank matrix product has the expected shape and scaling', () => {
  assert.deepEqual(lowRankDelta([[1, 2, 3]], [[2], [4]], 1), [[2, 4, 6], [4, 8, 12]]);
  assert.deepEqual(lowRankDelta([[1, 0], [0, 1]], [[2, 3]], 4), [[4, 6]]);
  assert.throws(() => lowRankDelta([[1, 2]], [[1, 2]]));
});
test('local adapter rejects nonlocal destinations and credential-bearing paths', () => {
  for (const baseUrl of ['https://example.com', 'http://127.0.0.1.example.com', 'http://u:pass@localhost', 'http://localhost/proxy', 'http://localhost/?key=x']) {
    assert.throws(() => localClient({ baseUrl, model: 'demo:local' }));
  }
  assert.throws(() => localClient({ model: '' }));
});
test('actual HTTP adapter checks request shape, failure, redirect, malformed and incomplete replies; server is a stub', async t => {
  let mode = 'ok', seen;
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    seen = { path: req.url, body: JSON.parse(text) };
    if (mode === 'redirect') { res.writeHead(302, { Location: 'https://example.com' }).end(); return; }
    if (mode === 'error') { res.writeHead(503).end(); return; }
    if (mode === 'timeout') return;
    if (mode === 'large') { res.end('x'.repeat(1024 * 1024 + 1)); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/embed' ? { model: 'demo:local', embeddings: mode === 'bad' ? [[1], [1, 2]] : [[1, 0], [0, 1]] } :
      { done: mode !== 'partial', message: { content: 'test stub' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = localClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'demo:local', timeoutMs: 150 });
  assert.deepEqual(await client.embed(['a', 'b']), [[1, 0], [0, 1]]);
  assert.equal(seen.path, '/api/embed'); assert.equal(seen.body.truncate, false);
  assert.equal((await client.chat({ messages: [{ role: 'user', content: 'x' }], tools: [] })).content, 'test stub');
  assert.equal(seen.body.stream, false); assert.equal(seen.body.options.num_predict, 128);
  for (mode of ['error', 'redirect', 'partial', 'timeout', 'large']) await assert.rejects(() => client.chat({ messages: [], tools: [] }));
  mode = 'bad'; await assert.rejects(() => client.embed(['a', 'b']));
});
