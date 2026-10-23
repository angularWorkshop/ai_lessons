import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

let running = false;
let pending = false;
let timer;
function check() {
  if (running) { pending = true; return; }
  running = true;
  console.log('Checking exercise conditions...');
  const env = { ...process.env };
  // A surrounding Node test runner must not suppress this independent check.
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--test', 'tests/assignment.test.mjs'], { stdio: 'inherit', env });
  child.on('error', error => { console.error(error.message); });
  child.on('close', code => {
    console.log(code === 0 ? 'ASSIGNMENT STATUS: COMPLETED' : 'ASSIGNMENT STATUS: NOT COMPLETED');
    running = false;
    if (pending) { pending = false; check(); }
  });
}
// Watch directories too: editors can save by replacing the file atomically.
for (const directory of ['src', 'tests']) watch(directory, () => {
  clearTimeout(timer);
  timer = setTimeout(check, 150);
});
check();
