import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from '../src/agent.ts';
import { editFileTool, findAll, lineAt, MAX_DIFF_LINES, notFoundMessage, shortDiff } from '../src/code-tools/edit-file.ts';
import { codeTools } from '../src/code-tools/index.ts';
import { Mutex } from '../src/code-tools/mutex.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox, type Tool } from '../src/tools.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const DISCOUNT = 'export function applyPromo(sum: number) {\n  if (sum > 1000) {\n    return sum * 0.9;\n  }\n  return sum;\n}\n';

async function call(tool: Tool, args: unknown) {
  return new Toolbox().register(tool).execute({ id: 'call_1', name: tool.name, arguments: JSON.stringify(args) });
}

let project: TempProject;
let edit: Tool;
const read = (file: string) => readFile(path.join(project.root, file), 'utf8');

before(async () => {
  project = await tempProject();
  edit = editFileTool(project.root);
});
after(() => project.remove());

describe('Шаг 1 / Step 1. Где фрагмент', () => {
  it('findAll: все вхождения, без перекрытий', () => {
    assert.deepEqual(findAll('a-b-a-b', 'a'), [0, 4]);
    assert.deepEqual(findAll('aaaa', 'aa'), [0, 2]);
    assert.deepEqual(findAll('abc', 'x'), []);
  });

  it('lineAt: номер строки с 1', () => {
    assert.equal(lineAt('one\ntwo\nthree', 0), 1);
    assert.equal(lineAt('one\ntwo\nthree', 4), 2);
    assert.equal(lineAt('one\ntwo\nthree', 9), 3);
  });
});

describe('Шаг 2 / Step 2. edit_file: ровно одно совпадение', () => {
  it('одно совпадение — файл изменён, остальное на месте', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const result = await call(edit, { path: 'src/discount.ts', old_str: 'sum > 1000', new_str: 'sum >= 1000' });
    assert.equal(result.isError, false, result.content);
    assert.equal(await read('src/discount.ts'), DISCOUNT.replace('sum > 1000', 'sum >= 1000'));
    assert.match(result.content, /^Изменён src\/discount\.ts/);
  });

  it('0 совпадений — ошибка, файл не тронут', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const result = await call(edit, { path: 'src/discount.ts', old_str: 'sum > 5000', new_str: 'sum >= 5000' });
    assert.equal(result.isError, true);
    assert.match(result.content, /old_str не найден в src\/discount\.ts/);
    assert.equal(await read('src/discount.ts'), DISCOUNT);
  });

  it('0 совпадений: подсказки про номера строк и про отступы', () => {
    assert.match(notFoundMessage('a.ts', DISCOUNT, '2\t  if (sum > 1000) {'), /номера строк/);
    assert.match(notFoundMessage('a.ts', DISCOUNT, 'if (sum > 1000) {\n  return sum * 0.9;'), /пробелы или отступы/);
    assert.doesNotMatch(notFoundMessage('a.ts', DISCOUNT, 'nothing'), /номера|отступы/);
  });

  it('несколько совпадений — ошибка: сколько и на каких строках', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const result = await call(edit, { path: 'src/discount.ts', old_str: 'return sum', new_str: 'return Math.round(sum)' });
    assert.equal(result.isError, true);
    assert.match(result.content, /встречается в src\/discount\.ts 2 раз \(строки 3, 5\)/);
    assert.match(result.content, /соседние строки/);
    assert.equal(await read('src/discount.ts'), DISCOUNT);
  });

  it('$ в new_str — это текст, а не шаблон замены', async () => {
    await project.write('src/price.ts', "export const price = (n: number) => n + ' руб.';\n");
    const result = await call(edit, { path: 'src/price.ts', old_str: "n + ' руб.'", new_str: "'$' + n" });
    assert.equal(result.isError, false, result.content);
    assert.equal(await read('src/price.ts'), "export const price = (n: number) => '$' + n;\n");
  });

  it('нет файла, одинаковые old_str и new_str, путь за корень — ошибки', async () => {
    assert.match((await call(edit, { path: 'src/nope.ts', old_str: 'a', new_str: 'b' })).content, /нет.*пустой old_str/);
    assert.match((await call(edit, { path: 'src/discount.ts', old_str: 'sum', new_str: 'sum' })).content, /одинаковые/);
    assert.match((await call(edit, { path: '../outside/secret.txt', old_str: 'a', new_str: 'b' })).content, /выходит за корень/);
    assert.match((await call(edit, { path: '.env', old_str: '', new_str: 'KEY=1' })).content, /секрет/);
  });
});

describe('Шаг 3 / Step 3. Новый файл и короткий diff', () => {
  it('diff: целые строки вокруг правки и номер первой', () => {
    const index = DISCOUNT.indexOf('> 1000');
    assert.equal(shortDiff(DISCOUNT, index, '> 1000', '>= 1000'), '@@ строка 2\n-  if (sum > 1000) {\n+  if (sum >= 1000) {');
  });

  it('diff многострочной правки; длинный — обрезан', () => {
    const index = DISCOUNT.indexOf('    return sum * 0.9;');
    assert.equal(
      shortDiff(DISCOUNT, index, '    return sum * 0.9;\n  }', '    return sum * 0.9;\n  } // скидка'),
      '@@ строка 3\n-    return sum * 0.9;\n-  }\n+    return sum * 0.9;\n+  } // скидка',
    );
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const diff = shortDiff('x\n', 0, 'x', long).split('\n');
    assert.equal(diff.filter((line) => line.startsWith('+')).length, MAX_DIFF_LINES + 1);
    assert.match(diff.at(-1)!, /^\+…ещё 25 строк/);
  });

  it('edit_file отдаёт модели diff', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const result = await call(edit, { path: 'src/discount.ts', old_str: 'sum > 1000', new_str: 'sum >= 1000' });
    assert.equal(result.content, 'Изменён src/discount.ts\n@@ строка 2\n-  if (sum > 1000) {\n+  if (sum >= 1000) {');
  });

  it('пустой old_str — новый файл, папки создаются', async () => {
    const result = await call(edit, { path: 'src/utils/round.ts', old_str: '', new_str: 'export const round = Math.round;\n' });
    assert.equal(result.isError, false, result.content);
    assert.equal(result.content, 'Создан src/utils/round.ts, строк: 1');
    assert.equal(await read('src/utils/round.ts'), 'export const round = Math.round;\n');
  });

  it('пустой old_str для существующего файла — ошибка, файл не перезаписан', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const result = await call(edit, { path: 'src/discount.ts', old_str: '', new_str: 'всё заново' });
    assert.equal(result.isError, true);
    assert.match(result.content, /уже есть/);
    assert.equal(await read('src/discount.ts'), DISCOUNT);
  });
});

describe('Шаг 4 / Step 4. Две правки за шаг', () => {
  it('Mutex: задачи по одной, в порядке очереди; ошибка не ломает очередь', async () => {
    const lock = new Mutex();
    const log: string[] = [];
    const job = (name: string, ms: number, fail = false) =>
      lock.run(async () => {
        log.push(`start ${name}`);
        await delay(ms);
        log.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      });
    const results = await Promise.allSettled([job('a', 20), job('b', 5, true), job('c', 1)]);
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  });

  it('модель правит один файл двумя вызовами в одном шаге — обе правки на месте', async () => {
    await project.write('src/discount.ts', DISCOUNT);
    const toolbox = new Toolbox();
    for (const tool of codeTools(project.root)) toolbox.register(tool);
    const provider = new ScriptedProvider([
      toolReply([
        { name: 'edit_file', args: { path: 'src/discount.ts', old_str: 'sum > 1000', new_str: 'sum >= 1000' } },
        { name: 'edit_file', args: { path: 'src/discount.ts', old_str: 'sum * 0.9', new_str: 'Math.round(sum * 90) / 100' } },
      ]),
      textReply('Готово'),
    ]);
    const run = await new Agent({ provider, toolbox, system: 'Ты — агент.' }).run('Почини скидку');
    assert.equal(run.stopReason, 'done');
    assert.equal(
      await read('src/discount.ts'),
      DISCOUNT.replace('sum > 1000', 'sum >= 1000').replace('sum * 0.9', 'Math.round(sum * 90) / 100'),
    );
  });
});
