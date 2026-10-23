import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { runLab } from '../runtime.mjs';
const config = JSON.parse(fs.readFileSync(new URL('../src/policy.json', import.meta.url)));
const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url)));
for (const [name, input, expected] of cases) test(name, () => {
  assert.deepEqual(runLab('01-task-boundaries', config, input), expected);
});
