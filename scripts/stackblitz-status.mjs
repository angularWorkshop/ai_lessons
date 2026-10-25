import { spawn } from 'node:child_process';
import { watch, writeFileSync } from 'node:fs';

let running = false;
let pending = false;
let timer;

function check() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  console.log('Проверяю задание...');
  const env = { ...process.env };
  // Внешний node --test не должен глушить эту проверку.
  delete env.NODE_TEST_CONTEXT;
  // CLI tsx сам подбирает флаги под версию Node, поэтому не зовём node --import напрямую.
  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', 'tests/llm.test.ts', 'tests/session.test.ts'], { stdio: 'inherit', env });
  child.on('error', (error) => console.error(error.message));
  child.on('close', (code) => {
    console.log(code === 0 ? 'ASSIGNMENT STATUS: COMPLETED' : 'ASSIGNMENT STATUS: NOT COMPLETED');
    running = false;
    if (pending) {
      pending = false;
      check();
    }
  });
}

// Следим за папками, а не файлами: редакторы сохраняют через замену файла.
for (const directory of ['src', 'tests']) {
  watch(directory, () => {
    clearTimeout(timer);
    timer = setTimeout(check, 150);
  });
}
// Метка для платформы: WebContainer запущен, можно класть в проект .env с ключом к модели.
writeFileSync('.edutec-ready', '');
console.log(`Node ${process.version}`);
check();
