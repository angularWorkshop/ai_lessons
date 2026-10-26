import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import {
  looksSecret,
  MEMORY_INTRO,
  MemoryStore,
  memorySection,
  rememberTool,
  type MemoryItem,
} from '../src/context/memory.ts';
import { buildSystemPrompt } from '../src/prompt.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

let dir: string;
let counter = 0;
// Каждому тесту — свой файл памяти в своей папке .agent.
const memoryFile = () => path.join(dir, `case-${++counter}`, '.agent', 'memory.json');

// Часы, которые двигает тест.
function clock(start = '2026-10-26T10:00:00.000Z') {
  let now = new Date(start);
  return {
    now: () => now,
    addDays: (days: number) => {
      now = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'memory-'));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('Шаг 1 / Step 1. Чтение файла памяти', () => {
  it('файла нет — память пустая', async () => {
    assert.deepEqual(await new MemoryStore(memoryFile()).load(), []);
  });

  it('читает записи из { version: 1, items }', async () => {
    const file = memoryFile();
    const items: MemoryItem[] = [{ id: 'm1', text: 'Аня живёт в Новосибирске', createdAt: '2026-10-01T00:00:00.000Z' }];
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ version: 1, items }));
    assert.deepEqual(await new MemoryStore(file).load(), items);
  });

  it('битый JSON или чужой формат — ошибка с путём к файлу', async () => {
    const file = memoryFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{ "version": 1, "items": [');
    await assert.rejects(new MemoryStore(file).load(), (error: Error) => error.message.includes(file) && /повреждён/.test(error.message));

    await writeFile(file, JSON.stringify({ version: 2, items: [] }));
    await assert.rejects(new MemoryStore(file).load(), /повреждён/);
  });
});

describe('Шаг 2 / Step 2. Запись', () => {
  it('add создаёт папку и файл, выдаёт id по порядку и ставит дату', async () => {
    const file = memoryFile();
    const store = new MemoryStore(file, { now: clock().now });
    assert.deepEqual(await store.add('  Аня пишет на TypeScript  '), {
      id: 'm1',
      text: 'Аня пишет на TypeScript',
      createdAt: '2026-10-26T10:00:00.000Z',
    });
    assert.equal((await store.add('Тесты — npm test')).id, 'm2');

    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.items.map((item: MemoryItem) => item.id), ['m1', 'm2']);
  });

  it('после записи в папке нет временных файлов', async () => {
    const file = memoryFile();
    const store = new MemoryStore(file);
    await store.add('Факт один');
    await store.add('Факт два');
    assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
  });

  it('тот же факт ещё раз — не дубль: id прежний, дата новая', async () => {
    const time = clock();
    const store = new MemoryStore(memoryFile(), { now: time.now });
    await store.add('Аня живёт в Новосибирске');
    time.addDays(3);
    const again = await store.add('аня  живёт в новосибирске');
    assert.equal(again.id, 'm1');
    assert.equal(again.createdAt, time.now().toISOString());
    assert.equal((await store.load()).length, 1);
  });

  it('больше maxItems — уходят самые старые', async () => {
    const store = new MemoryStore(memoryFile(), { maxItems: 2 });
    await store.add('Первый');
    await store.add('Второй');
    await store.add('Третий');
    assert.deepEqual((await store.load()).map((item) => item.text), ['Второй', 'Третий']);
  });

  it('битый файл add не перезаписывает', async () => {
    const file = memoryFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'не json');
    await assert.rejects(new MemoryStore(file).add('Факт'), /повреждён/);
    assert.equal(await readFile(file, 'utf8'), 'не json');
  });

  it('пустой факт — ошибка', async () => {
    await assert.rejects(new MemoryStore(memoryFile()).add('   '), /Пустой/);
  });
});

describe('Шаг 3 / Step 3. Устаревание', () => {
  it('active не отдаёт факты старше ttlDays, load отдаёт всё', async () => {
    const time = clock();
    const store = new MemoryStore(memoryFile(), { now: time.now, ttlDays: 30 });
    await store.add('Старый факт');
    time.addDays(20);
    await store.add('Новый факт');
    time.addDays(15);

    assert.deepEqual((await store.active()).map((item) => item.text), ['Новый факт']);
    assert.equal((await store.load()).length, 2);
  });

  it('при следующей записи просроченные удаляются из файла', async () => {
    const time = clock();
    const store = new MemoryStore(memoryFile(), { now: time.now, ttlDays: 30 });
    await store.add('Старый факт');
    time.addDays(31);
    await store.add('Свежий факт');
    assert.deepEqual((await store.load()).map((item) => item.text), ['Свежий факт']);
  });

  it('replaces заменяет устаревший факт, id не переиспользуется', async () => {
    const store = new MemoryStore(memoryFile());
    await store.add('Аня живёт в Новосибирске');
    await store.add('Аня пишет на TypeScript');
    const moved = await store.add('Аня переехала в Москву', 'm1');
    assert.equal(moved.id, 'm3');
    assert.deepEqual((await store.load()).map((item) => item.id), ['m2', 'm3']);

    const last = await store.add('Аня пишет на Go', 'm3');
    assert.equal(last.id, 'm4');
  });

  it('replaces с несуществующим id — ошибка, файл не меняется', async () => {
    const file = memoryFile();
    const store = new MemoryStore(file);
    await store.add('Факт');
    const before = await readFile(file, 'utf8');
    await assert.rejects(store.add('Другой факт', 'm9'), /m9/);
    assert.equal(await readFile(file, 'utf8'), before);
  });
});

describe('Шаг 4 / Step 4. Инструмент remember и раздел промпта', () => {
  it('memorySection: вступление и факты с id и датой; пустая память — пустой раздел', () => {
    const items: MemoryItem[] = [
      { id: 'm1', text: 'Аня живёт в Новосибирске', createdAt: '2026-10-01T08:00:00.000Z' },
      { id: 'm4', text: 'Тесты — npm test', createdAt: '2026-10-20T08:00:00.000Z' },
    ];
    assert.deepEqual(memorySection(items), {
      title: 'Память',
      body: `${MEMORY_INTRO}\n- [m1] Аня живёт в Новосибирске (2026-10-01)\n- [m4] Тесты — npm test (2026-10-20)`,
    });
    assert.deepEqual(memorySection([]), { title: 'Память', body: '' });
    assert.equal(buildSystemPrompt({ role: 'Ты — агент.', sections: [memorySection([])] }), 'Ты — агент.');
  });

  it('looksSecret ловит ключи и пароли, но не обычные факты', () => {
    assert.ok(looksSecret('Мой ключ к API — sk-live-4f9a8b7c6d5e'));
    assert.ok(looksSecret('password: hunter22'));
    assert.ok(looksSecret('LLM_API_KEY=edt_abcdef123456'));
    assert.ok(looksSecret('-----BEGIN OPENSSH PRIVATE KEY-----'));
    assert.ok(!looksSecret('Аня живёт в Новосибирске'));
    assert.ok(!looksSecret('Токены считаем через usage'));
  });

  it('remember сохраняет факт и отвечает модели его id', async () => {
    const store = new MemoryStore(memoryFile());
    const toolbox = new Toolbox().register(rememberTool(store));
    const result = await toolbox.execute({ id: 'c1', name: 'remember', arguments: JSON.stringify({ fact: 'Аня живёт в Новосибирске' }) });
    assert.deepEqual(result, { content: 'Запомнил как m1.', isError: false });

    const replaced = await toolbox.execute({
      id: 'c2',
      name: 'remember',
      arguments: JSON.stringify({ fact: 'Аня живёт в Москве', replaces: 'm1' }),
    });
    assert.deepEqual(replaced, { content: 'Запомнил как m2. Запись m1 удалена.', isError: false });
    assert.deepEqual((await store.load()).map((item) => item.text), ['Аня живёт в Москве']);
  });

  it('секрет remember не сохраняет, а модель получает ошибку', async () => {
    const store = new MemoryStore(memoryFile());
    const toolbox = new Toolbox().register(rememberTool(store));
    const result = await toolbox.execute({ id: 'c1', name: 'remember', arguments: JSON.stringify({ fact: 'Ключ — sk-live-4f9a8b7c6d5e' }) });
    assert.equal(result.isError, true);
    assert.match(result.content, /секрет/);
    assert.deepEqual(await store.load(), []);
  });

  it('две сессии: факт из первой попадает в system второй', async () => {
    const store = new MemoryStore(memoryFile());
    const system = async () =>
      buildSystemPrompt({ role: 'Ты — ассистент.', sections: [memorySection(await store.active())] });
    const toolbox = () => new Toolbox().register(rememberTool(store));

    const first = new ScriptedProvider([
      toolReply([{ name: 'remember', args: { fact: 'Пользователь живёт в Новосибирске' } }]),
      textReply('Запомнила.'),
    ]);
    await new Agent({ provider: first, toolbox: toolbox(), system: await system() }).run('Я живу в Новосибирске');
    assert.ok(!first.requests[1].messages[0].content?.includes('Новосибирске'), 'в этой сессии system не меняется');

    const second = new ScriptedProvider([textReply('В Новосибирске 17:00')]);
    await new Agent({ provider: second, toolbox: toolbox(), system: await system() }).run('Который час?');
    assert.match(second.requests[0].messages[0].content ?? '', /## Память\n.*\n- \[m1\] Пользователь живёт в Новосибирске/);
    assert.equal(second.requests[0].messages.length, 2);
  });
});
