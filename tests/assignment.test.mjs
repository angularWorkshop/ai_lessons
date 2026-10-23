import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { runLab } from '../runtime.mjs';
const config = JSON.parse(fs.readFileSync(new URL('../src/capstone.json', import.meta.url)));
const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url)));
for (const [name, input, expected] of cases) test(name, () => {
  assert.deepEqual(runLab('26-local-capstone', config, input), expected);
});
