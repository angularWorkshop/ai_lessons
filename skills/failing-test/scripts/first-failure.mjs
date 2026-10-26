// Достаёт из вывода node --test первое падение: от строки «test at …» до следующего падения.
// Запуск: node skills/failing-test/scripts/first-failure.mjs < test-output.txt
import { readFileSync } from 'node:fs';

const text = readFileSync(0, 'utf8');
const start = text.indexOf('✖ failing tests:');
if (start === -1) {
  console.log('Падений нет: в выводе нет блока «✖ failing tests:».');
  process.exit(0);
}

const lines = text.slice(start).split('\n').slice(1);
const first = lines.findIndex((line) => line.startsWith('test at '));
if (first === -1) {
  console.log(text.slice(start).trim());
  process.exit(0);
}
const next = lines.findIndex((line, i) => i > first && line.startsWith('test at '));
const block = lines.slice(first, next === -1 ? undefined : next);
// Стек внутри node:internal разбирать не нужно — он одинаковый у всех падений.
console.log(block.filter((line) => !line.includes('node:internal') && !line.includes('node:async_hooks')).join('\n').trim());
