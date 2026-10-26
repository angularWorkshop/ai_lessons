// Падение посреди задачи и восстановление: npm run crash-demo
// 1. harness чинит тест в playground/, и сразу после первой правки процесс убивает SIGKILL — как при падении или закрытой вкладке.
//    Убивает хук scripts/crash-after-edit.mjs: он живёт внутри процесса агента. SIGKILL нельзя перехватить —
//    ни finally, ни обработчики не успевают. Остаётся только то, что уже на диске.
// 2. Смотрим, что на диске: журнал сессии и снимок файла.
// 3. harness --continue: журнал восстанавливает историю, checkpoint говорит, что задача успела поменять.
import { spawn } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { parseJournal } from './session.ts';

const ROOT = path.resolve('playground');

function run(args: string[]): Promise<{ code: number | null; signal: string | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--env-file=.env', 'src/harness/cli.ts', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        output += `${line}\n`;
        console.log(`  │ ${line}`);
      });
    }
    child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
}

await new Promise((resolve) => spawn(process.execPath, ['scripts/reset-playground.mjs'], { stdio: 'inherit' }).on('close', resolve));

// Локальный слой настроек (12.2) подключает хук-убийцу только на первый запуск.
const local = path.join(ROOT, '.agent/settings.local.json');
await writeFile(local, JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'edit_file', module: '../scripts/crash-after-edit.mjs' }] } }));

console.log('\n=== 1. Задача, которую убьют после первой правки');
const first = await run(['--mode', 'auto', '-p', 'Почини падающий тест в проекте.']);
await rm(local);
const id = /сессия> (\S+)/.exec(first.output)?.[1];
console.log(`процесс завершился: код ${first.code}, сигнал ${first.signal}`);
if (!id) process.exit(1);

console.log('\n=== 2. Что осталось на диске');
const journal = path.join(ROOT, '.agent/sessions', `${id}.jsonl`);
const { records } = parseJournal(await readFile(journal, 'utf8'), journal);
console.log(`${path.relative(process.cwd(), journal)}: ${records.map((record) => (record.type === 'message' ? record.message.role : record.type)).join(' → ')}`);
const dir = path.join(ROOT, '.agent/checkpoints', id);
for (const name of await readdir(dir).catch(() => [])) {
  const snapshots = (await readFile(path.join(dir, name), 'utf8')).trim().split('\n').map((line) => JSON.parse(line).path);
  console.log(`${path.relative(process.cwd(), path.join(dir, name))}: снимки ${snapshots.join(', ')}`);
}

console.log('\n=== 3. harness --continue');
await run(['--continue', '--mode', 'auto', '-p', 'Продолжи прерванную задачу.']);
