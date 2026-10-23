import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { labs } from '../labs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('edutec-ai-test-'));
  fs.rmSync(directory, { recursive: true });
}

for (const id of ['01-task-boundaries', '30-structured-results']) test(`${id}: saving an answer changes runner status from NOT COMPLETED to COMPLETED`, async () => {
  const lab = labs.find(l => l.id === id);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'edutec-ai-test-'));
  fs.cpSync(path.join(root, 'generated', id, 'starter'), directory, { recursive: true });
  const child = spawn(process.execPath, ['scripts/stackblitz-status.mjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      let text = '';
      let saved = false;
      const timer = setTimeout(() => { reject(new Error('Runner timed out: ' + text)); }, 10000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', chunk => {
        text += chunk;
        if (!saved && text.includes('ASSIGNMENT STATUS: NOT COMPLETED')) {
          saved = true;
          const file = path.join(directory, 'src', lab.file);
          fs.writeFileSync(file + '.next', lab.executable ? lab.answer : JSON.stringify(lab.answer));
          fs.renameSync(file + '.next', file);
        }
        if (saved && /ASSIGNMENT STATUS: COMPLETED/.test(text)) { clearTimeout(timer); resolve(); }
      });
      child.stderr.on('data', chunk => { text += chunk; });
    });
  } finally {
    const closed = new Promise(resolve => child.once('close', resolve));
    child.kill();
    await closed;
    cleanup(directory);
  }
});

test('real capstone source fails initially and the reference implementation passes unchanged tests', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'edutec-ai-test-'));
  try {
    fs.cpSync(path.join(root, 'capstone-project'), directory, { recursive: true });
    const run = () => spawnSync(process.execPath, ['--test', 'tests/tags.test.mjs'], { cwd: directory, encoding: 'utf8', timeout: 10000, env: childEnv });
    const starter = run();
    assert.equal(starter.status, 1);
    assert.match(starter.stdout, /AssertionError/);
    fs.copyFileSync(path.join(root, 'capstone-pack/answer-tags.mjs'), path.join(directory, 'src/tags.mjs'));
    const answer = run();
    assert.equal(answer.status, 0, answer.stdout);
    assert.match(answer.stdout, /# pass 4/);
  } finally { cleanup(directory); }
});
