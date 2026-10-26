import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { grepTool, MAX_MATCHES, searchText } from '../src/code-tools/grep.ts';
import { codeTools } from '../src/code-tools/index.ts';
import { listFilesTool, MAX_ENTRIES } from '../src/code-tools/list-files.ts';
import { MAX_FILE_BYTES, numberLines, readFileTool } from '../src/code-tools/read-file.ts';
import { PathError, safePath } from '../src/code-tools/safe-path.ts';
import { Toolbox, type Tool } from '../src/tools.ts';
import { SHOP, tempProject, type TempProject } from './support/temp-project.ts';

// Вызов инструмента так, как его увидит модель: через Toolbox, с аргументами-JSON.
async function call(tool: Tool, args: unknown) {
  return new Toolbox().register(tool).execute({ id: 'call_1', name: tool.name, arguments: JSON.stringify(args) });
}

let project: TempProject;
before(async () => {
  project = await tempProject(SHOP);
});
after(() => project.remove());

describe('Шаг 1 / Step 1. safePath', () => {
  it('путь от корня → абсолютный путь внутри проекта', async () => {
    assert.equal(await safePath(project.root, 'src/cart.ts'), path.join(project.root, 'src', 'cart.ts'));
    assert.equal(await safePath(project.root, './src/../src/cart.ts'), path.join(project.root, 'src', 'cart.ts'));
    assert.equal(await safePath(project.root, '.'), project.root);
  });

  it('файла ещё нет — путь всё равно годится: edit_file будет создавать новые', async () => {
    assert.equal(await safePath(project.root, 'src/new/file.ts'), path.join(project.root, 'src', 'new', 'file.ts'));
  });

  it('.. за корень — PathError', async () => {
    await assert.rejects(safePath(project.root, '../outside/secret.txt'), (error: Error) => {
      assert.ok(error instanceof PathError, `ждали PathError, пришло ${error.name}: ${error.message}`);
      assert.match(error.message, /выходит за корень/);
      return true;
    });
    await assert.rejects(safePath(project.root, 'src/../../outside'), /выходит за корень/);
  });

  it('абсолютный путь и пустой путь — PathError с подсказкой', async () => {
    await assert.rejects(safePath(project.root, '/etc/passwd'), /абсолютный путь/);
    await assert.rejects(safePath(project.root, path.join(project.root, 'src/cart.ts')), /абсолютный путь/);
    await assert.rejects(safePath(project.root, '  '), /пустой/);
  });

  it('.env и .env.local не отдаём', async () => {
    await assert.rejects(safePath(project.root, '.env'), /секрет/);
    await assert.rejects(safePath(project.root, 'config/.env.local'), /секрет/);
    assert.ok(await safePath(project.root, 'src/env.ts'));
  });

  it('ссылка наружу и ссылка на .env — PathError', async (t) => {
    if (!(await project.link(project.outside, 'shared'))) {
      t.skip('файловая система не умеет символические ссылки');
      return;
    }
    await project.link(path.join(project.root, '.env'), 'notes.txt');
    await project.link(path.join(project.outside, 'missing.txt'), 'dangling.txt');
    await assert.rejects(safePath(project.root, 'shared/secret.txt'), /ссылка за пределы/);
    await assert.rejects(safePath(project.root, 'shared/new.txt'), /ссылка за пределы/);
    await assert.rejects(safePath(project.root, 'notes.txt'), /секрет/);
    await assert.rejects(safePath(project.root, 'dangling.txt'), PathError);
  });
});

describe('Шаг 2 / Step 2. read_file', () => {
  it('numberLines: номер, табуляция, текст; номера выровнены', () => {
    assert.equal(numberLines(['a', 'b'], 9), ' 9\ta\n10\tb');
    assert.equal(numberLines(['x'.repeat(600)], 1), `1\t${'x'.repeat(500)}…[строка обрезана]`);
  });

  it('файл целиком — с номерами строк', async () => {
    const result = await call(readFileTool(project.root), { path: 'src/discount.ts' });
    assert.equal(result.isError, false, result.content);
    assert.equal(
      result.content,
      '1\t// Скидка 10% от 1000 ₽\n2\texport function applyPromo(sum: number) {\n3\t  if (sum > 1000) {\n' +
        '4\t    return sum * 0.9;\n5\t  }\n6\t  return sum;\n7\t}',
    );
  });

  it('offset и limit: кусок файла и подсказка, откуда читать дальше', async () => {
    const result = await call(readFileTool(project.root), { path: 'src/discount.ts', offset: 3, limit: 2 });
    assert.equal(result.content, '3\t  if (sum > 1000) {\n4\t    return sum * 0.9;\n…показаны строки 3–4 из 7. Дальше — offset=5');
    const tooFar = await call(readFileTool(project.root), { path: 'src/discount.ts', offset: 50 });
    assert.equal(tooFar.isError, true);
    assert.match(tooFar.content, /всего 7 строк/);
  });

  it('по умолчанию — не больше 200 строк', async () => {
    await project.write('long.txt', Array.from({ length: 450 }, (_, i) => `строка ${i + 1}`).join('\n'));
    const result = await call(readFileTool(project.root), { path: 'long.txt' });
    const lines = result.content.split('\n');
    assert.equal(lines.length, 201);
    assert.equal(lines[199], '200\tстрока 200');
    assert.match(lines[200], /из 450\. Дальше — offset=201/);
  });

  it('большой, бинарный, папка, чужой путь — ошибки, понятные модели', async () => {
    await project.write('big.log', 'x'.repeat(MAX_FILE_BYTES + 1));
    await project.write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    const big = await call(readFileTool(project.root), { path: 'big.log' });
    assert.equal(big.isError, true);
    assert.match(big.content, /КБ.*grep/);
    assert.match((await call(readFileTool(project.root), { path: 'logo.png' })).content, /бинарный/);
    assert.match((await call(readFileTool(project.root), { path: 'src' })).content, /папка.*list_files/);
    assert.match((await call(readFileTool(project.root), { path: '../outside/secret.txt' })).content, /выходит за корень/);
    assert.match((await call(readFileTool(project.root), { path: '.env' })).content, /секрет/);
  });
});

describe('Шаг 3 / Step 3. list_files', () => {
  it('весь проект: по алфавиту, папки с /, без node_modules, .git и .env', async () => {
    const shop = await tempProject(SHOP);
    try {
      const result = await call(listFilesTool(shop.root), {});
      assert.equal(result.isError, false, result.content);
      assert.equal(result.content, 'package.json\nsrc/\nsrc/cart.ts\nsrc/discount.ts\ntests/\ntests/cart.test.ts');
    } finally {
      await shop.remove();
    }
  });

  it('одна папка', async () => {
    const result = await call(listFilesTool(project.root), { path: 'src' });
    assert.equal(result.content, 'src/cart.ts\nsrc/discount.ts');
  });

  it(`больше ${MAX_ENTRIES} записей — обрезка с подсказкой`, async () => {
    const many = await tempProject();
    try {
      for (let i = 0; i < MAX_ENTRIES + 30; i++) {
        await many.write(`gen/file-${String(i).padStart(3, '0')}.ts`, '');
      }
      const lines = (await call(listFilesTool(many.root), {})).content.split('\n');
      assert.equal(lines.length, MAX_ENTRIES + 1);
      assert.match(lines.at(-1)!, /ещё 31/);
    } finally {
      await many.remove();
    }
  });

  it('файл вместо папки и путь за корень — ошибки', async () => {
    assert.match((await call(listFilesTool(project.root), { path: 'src/cart.ts' })).content, /read_file/);
    assert.match((await call(listFilesTool(project.root), { path: '..' })).content, /выходит за корень/);
  });
});

describe('Шаг 4 / Step 4. grep', () => {
  it('searchText: номер строки с 1, текст без отступов', () => {
    assert.deepEqual(searchText('a.ts', 'one\n  two\nthree two', /two/), [
      { file: 'a.ts', line: 2, text: 'two' },
      { file: 'a.ts', line: 3, text: 'three two' },
    ]);
  });

  it('путь:строка: текст по всему проекту, без node_modules и .env', async () => {
    const result = await call(grepTool(project.root), { pattern: 'applyPromo' });
    assert.equal(result.isError, false, result.content);
    assert.equal(
      result.content,
      "src/cart.ts:1: import { applyPromo } from './discount.ts';\nsrc/cart.ts:4: return applyPromo(sum);\n" +
        'src/discount.ts:2: export function applyPromo(sum: number) {',
    );
    // Слово promo есть в .env, но секреты grep не читает.
    assert.doesNotMatch((await call(grepTool(project.root), { pattern: 'secret_promo' })).content, /edt_/);
  });

  it('регулярное выражение, ignoreCase, path к файлу', async () => {
    const result = await call(grepTool(project.root), { pattern: 'SUM > \\d+', ignoreCase: true, path: 'src/discount.ts' });
    assert.equal(result.content, 'src/discount.ts:3: if (sum > 1000) {');
  });

  it('нет совпадений — не ошибка; сломанный pattern — ошибка', async () => {
    const none = await call(grepTool(project.root), { pattern: 'nothing_here' });
    assert.equal(none.isError, false);
    assert.match(none.content, /Совпадений с nothing_here нет/);
    const broken = await call(grepTool(project.root), { pattern: 'total(' });
    assert.equal(broken.isError, true);
    assert.match(broken.content, /не регулярное выражение/);
  });

  it(`больше ${MAX_MATCHES} совпадений — обрезка с подсказкой`, async () => {
    const many = await tempProject({ 'log.txt': Array.from({ length: MAX_MATCHES + 5 }, () => 'TODO').join('\n') });
    try {
      const lines = (await call(grepTool(many.root), { pattern: 'TODO' })).content.split('\n');
      assert.equal(lines.length, MAX_MATCHES + 1);
      assert.match(lines.at(-1)!, /ещё 5 совпадений/);
    } finally {
      await many.remove();
    }
  });

  it('codeTools: инструменты чтения от одного корня', async () => {
    const toolbox = new Toolbox();
    for (const tool of codeTools(project.root)) toolbox.register(tool);
    const names = toolbox.specs().map((spec) => spec.function.name);
    for (const name of ['list_files', 'read_file', 'grep']) {
      assert.ok(names.includes(name), `в codeTools нет ${name}: ${names.join(', ')}`);
    }
  });
});
