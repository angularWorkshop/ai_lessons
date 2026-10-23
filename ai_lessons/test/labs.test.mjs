import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labs } from '../labs.mjs';
import { runLab, orchestrate } from '../runtime.mjs';

for (const lab of labs) {
  const answer = lab.executable ? (await import(`data:text/javascript,${encodeURIComponent(lab.answer)}`)).solve :
    input => runLab(lab.id, structuredClone(lab.answer), input);
  const starter = lab.executable ? (await import(`data:text/javascript,${encodeURIComponent(lab.starter)}`)).solve :
    input => runLab(lab.id, structuredClone(lab.starter), input);
  for (const [name, input, expected] of lab.cases) test(`${lab.id}: ${name}`, () => {
    assert.deepEqual(answer(structuredClone(input)), expected);
  });
  test(`${lab.id}: starter is observably incomplete, not a broken test environment`, () => {
    assert.ok(lab.cases.some(([, input, expected]) => {
      try { assert.deepEqual(starter(structuredClone(input)), expected); return false; }
      catch (error) { assert.equal(error.code, 'ERR_ASSERTION'); return true; }
    }));
  });
}
test('orchestrator stops for high risk, missing result, and exhausted round budget', () => {
  const config = labs.find(l => l.id === '16-orchestrator').answer;
  const input = { goal: 'Fix', acceptance: ['Test'], allowed: true, runs: [{ highRisk: true }] };
  assert.equal(orchestrate(config, input).status, 'approval');
  assert.equal(orchestrate(config, { ...input, runs: [] }).status, 'blocked');
  assert.equal(orchestrate({ ...config, maxCalls: 0 }, input).status, 'budget');
});
test('path policies reject absolute, drive-qualified, and traversal paths', () => {
  const config = labs.find(l => l.id === '05-tool-permissions').answer;
  for (const path of ['/src/file', 'C:/src/file', 'src/../outside', 'src\\file', 'src//file']) {
    assert.equal(runLab('05-tool-permissions', config, { tool: 'read', path }), 'deny');
  }
});
