import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PRICE } from '../src/commands.ts';
import { codeAgent } from '../src/evals/agent-under-test.ts';
import { testsCheck, testSummary, type Check } from '../src/evals/checks.ts';
import { formatSuite, summarize } from '../src/evals/report.ts';
import { runSuite, runTask, type AgentFactory, type TaskRun } from '../src/evals/runner.ts';
import { TASKS, type EvalTask } from '../src/evals/tasks.ts';
import { copyDir, prepareWorkdir } from '../src/evals/workspace.ts';
import { estimateCost, LlmError } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';

const promo = TASKS.find((task) => task.id === 'promo-threshold')!;
const BUG = 'if (sum > promo.threshold) {';
const FIX = 'if (sum >= promo.threshold) {';

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'edutec-evals-test-'));
}

/** Агент для кода на сценарии. Снаружи видно, в какой папке он работал. */
function scriptedAgent(...script: ConstructorParameters<typeof ScriptedProvider>[0]) {
  const provider = new ScriptedProvider(script);
  const dirs: string[] = [];
  const inner = codeAgent(provider);
  const factory: AgentFactory = (dir, onEvent) => {
    dirs.push(dir);
    return inner(dir, onEvent);
  };
  return { provider, dirs, factory };
}

const fixPromo = () => [
  toolReply([{ name: 'read_file', args: { path: 'src/discount.js' } }], { usage: { input: 900, output: 20 } }),
  toolReply([{ name: 'edit_file', args: { path: 'src/discount.js', old_str: BUG, new_str: FIX } }], { usage: { input: 1200, output: 40 } }),
  textReply('Порог теперь включительно: sum >= threshold.', { usage: { input: 1400, output: 15 } }),
];

describe('Шаг 1 / Step 1. Рабочая копия', () => {
  it('copyDir копирует вложенные папки и заменяет существующие файлы', async () => {
    const base = await tempDir();
    try {
      await mkdir(path.join(base, 'from/src/deep'), { recursive: true });
      await writeFile(path.join(base, 'from/a.txt'), 'новый');
      await writeFile(path.join(base, 'from/src/deep/b.txt'), 'b');
      await mkdir(path.join(base, 'to'));
      await writeFile(path.join(base, 'to/a.txt'), 'старый');
      await writeFile(path.join(base, 'to/keep.txt'), 'остался');

      await copyDir(path.join(base, 'from'), path.join(base, 'to'));
      assert.equal(await readFile(path.join(base, 'to/a.txt'), 'utf8'), 'новый');
      assert.equal(await readFile(path.join(base, 'to/src/deep/b.txt'), 'utf8'), 'b');
      assert.equal(await readFile(path.join(base, 'to/keep.txt'), 'utf8'), 'остался', 'чужие файлы не трогаем');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('prepareWorkdir: копия project/ во временной папке, без check/ и solution/', async () => {
    const workdir = await prepareWorkdir(promo.fixture);
    try {
      assert.ok(path.isAbsolute(workdir.dir));
      assert.ok(!workdir.dir.startsWith(promo.fixture), 'копия — не внутри фикстуры');
      const source = await readFile(path.join(workdir.dir, 'src/discount.js'), 'utf8');
      assert.ok(source.includes(BUG));
      assert.ok(existsSync(path.join(workdir.dir, 'package.json')));
      assert.ok(!existsSync(path.join(workdir.dir, 'check')), 'тесты проверки агент не видит');
      assert.ok(!existsSync(path.join(workdir.dir, 'solution')), 'решение агент не видит');
    } finally {
      await workdir.remove();
    }
    assert.ok(!existsSync(workdir.dir), 'remove удаляет копию');
  });

  it('правки в копии не трогают фикстуру, у каждого прогона своя папка', async () => {
    const first = await prepareWorkdir(promo.fixture);
    const second = await prepareWorkdir(promo.fixture);
    try {
      assert.notEqual(first.dir, second.dir);
      await writeFile(path.join(first.dir, 'src/discount.js'), 'испорчено');
      const original = await readFile(path.join(promo.fixture, 'project/src/discount.js'), 'utf8');
      assert.ok(original.includes(BUG));
      assert.ok((await readFile(path.join(second.dir, 'src/discount.js'), 'utf8')).includes(BUG));
    } finally {
      await first.remove();
      await second.remove();
    }
  });
});

const TAP = `TAP version 13
# Subtest: сумма
ok 1 - сумма
  ---
  duration_ms: 0.5
  ...
# Subtest: порог
not ok 2 - порог
  ---
  duration_ms: 0.7
  ...
# Subtest: группа
    # Subtest: вложенный
    not ok 1 - вложенный
      ---
      ...
not ok 3 - группа
1..3
# tests 3
# suites 0
# pass 1
# fail 2
# cancelled 0
`;

describe('Шаг 2 / Step 2. Проверка тестами', () => {
  it('testSummary: итог и имена упавших из TAP', () => {
    assert.deepEqual(testSummary(TAP), { tests: 3, pass: 1, fail: 2, failed: ['порог', 'вложенный', 'группа'] });
    assert.deepEqual(testSummary(''), { tests: 0, pass: 0, fail: 0, failed: [] });
  });

  it('нетронутая задача не решена: тест «ровно 1000 ₽» падает', async () => {
    const workdir = await prepareWorkdir(promo.fixture);
    try {
      const result = await testsCheck()({ dir: workdir.dir, fixture: promo.fixture });
      assert.equal(result.pass, false);
      assert.match(result.detail, /тесты: 3\/5/);
      assert.match(result.detail, /«WELCOME: ровно 1000 ₽ — скидка уже действует»/);
    } finally {
      await workdir.remove();
    }
  });

  it('тесты проверки кладутся поверх: поправленный агентом тест не спасает', async () => {
    const workdir = await prepareWorkdir(promo.fixture);
    try {
      // «Решение» нечестного агента: выкинуть падающий тест.
      await writeFile(path.join(workdir.dir, 'tests/discount.test.js'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
      const result = await testsCheck()({ dir: workdir.dir, fixture: promo.fixture });
      assert.equal(result.pass, false);
    } finally {
      await workdir.remove();
    }
  });

  it('с исправленным кодом проверка проходит', async () => {
    const workdir = await prepareWorkdir(promo.fixture);
    try {
      const file = path.join(workdir.dir, 'src/discount.js');
      await writeFile(file, (await readFile(file, 'utf8')).replace(BUG, FIX));
      assert.deepEqual(await testsCheck()({ dir: workdir.dir, fixture: promo.fixture }), { pass: true, detail: 'тесты: 5/5' });
    } finally {
      await workdir.remove();
    }
  });

  it('проект без тестов не считается решённым', async () => {
    const dir = await tempDir();
    try {
      await writeFile(path.join(dir, 'package.json'), '{ "type": "module" }\n');
      const result = await testsCheck()({ dir, fixture: path.join(dir, 'нет-такой') });
      assert.deepEqual(result, { pass: false, detail: 'тестов не нашлось' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('набор задач: каждая проверка падает на нетронутом проекте и проходит на эталоне', async () => {
    assert.ok(TASKS.length >= 5, 'в наборе 5–6 задач');
    assert.equal(new Set(TASKS.map((task) => task.id)).size, TASKS.length, 'id не повторяются');
    for (const task of TASKS) {
      const before = await prepareWorkdir(task.fixture);
      try {
        const result = await task.check({ dir: before.dir, fixture: task.fixture });
        assert.equal(result.pass, false, `${task.id}: проверка проходит без агента — она ничего не меряет`);
      } finally {
        await before.remove();
      }
      const solved = await prepareWorkdir(task.fixture);
      try {
        await copyDir(path.join(task.fixture, 'solution'), solved.dir);
        const result = await task.check({ dir: solved.dir, fixture: task.fixture });
        assert.equal(result.pass, true, `${task.id}: эталон не проходит проверку — ${result.detail}`);
      } finally {
        await solved.remove();
      }
    }
  });
});

const failingCheck: Check = async () => {
  throw new Error('проверку не должны были звать');
};

describe('Шаг 3 / Step 3. Один прогон', () => {
  it('агент чинит баг в копии — задача решена, метрики посчитаны', async () => {
    const { provider, dirs, factory } = scriptedAgent(...fixPromo());
    const times = [1000, 4500];
    const run = await runTask(promo, factory, { clock: () => times.shift()! });

    assert.equal(provider.remaining, 0);
    assert.equal(run.task, 'promo-threshold');
    assert.equal(run.attempt, 1);
    assert.equal(run.pass, true, run.detail);
    assert.equal(run.detail, 'тесты: 5/5');
    assert.equal(run.stopReason, 'done');
    assert.equal(run.steps, 3);
    assert.deepEqual(run.usage, { input: 3500, output: 75 });
    assert.equal(run.cost, estimateCost({ input: 3500, output: 75 }, PRICE));
    assert.equal(run.ms, 3500);
    assert.equal(run.error, undefined);

    assert.equal(dirs.length, 1, 'на прогон — один агент');
    assert.ok(!existsSync(dirs[0]), 'копию после прогона удалили');
    const original = await readFile(path.join(promo.fixture, 'project/src/discount.js'), 'utf8');
    assert.ok(original.includes(BUG), 'фикстура не изменилась');
  });

  it('агент работает в копии: read_file видит файлы задачи', async () => {
    const { provider, factory } = scriptedAgent(...fixPromo());
    await runTask(promo, factory);
    const toolMessage = provider.requests[1].messages.at(-1);
    assert.equal(toolMessage?.role, 'tool');
    assert.match(String(toolMessage?.content), /sum > promo\.threshold/);
  });

  it('«Готово» без правок — не решено: проверяем файлы, а не ответ', async () => {
    const { factory } = scriptedAgent(textReply('Готово, всё починил!', { usage: { input: 800, output: 10 } }));
    const run = await runTask(promo, factory);
    assert.equal(run.stopReason, 'done');
    assert.equal(run.pass, false);
    assert.match(run.detail, /тесты: 3\/5/);
  });

  it('ошибка шлюза — не провал, а непроверенный прогон', async () => {
    const error = new LlmError('LLM API ответил 401: {"error":{"code":"invalid_api_key"}}\n<html>…</html>', { status: 401, retryable: false });
    const { factory } = scriptedAgent(error);
    const run = await runTask({ ...promo, check: failingCheck }, factory);
    assert.equal(run.stopReason, 'error');
    assert.equal(run.pass, false);
    assert.equal(run.detail, 'не проверено');
    assert.equal(run.error, 'LLM API ответил 401: {"error":{"code":"invalid_api_key"}}', 'только первая строка');
  });

  it('лимит шагов — всё равно проверяем: файлы могли быть уже в порядке', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'edit_file', args: { path: 'src/discount.js', old_str: BUG, new_str: FIX } }]),
      textReply('Поправил порог, тесты запустить не успел.'),
    ]);
    const run = await runTask(promo, codeAgent(provider, { limits: { maxSteps: 2 } }));
    assert.equal(run.stopReason, 'max_steps');
    assert.equal(run.pass, true, run.detail);
  });

  it('упавшая проверка — не решено, причина в detail', async () => {
    const { factory } = scriptedAgent(textReply('Готово'));
    const run = await runTask({ ...promo, check: async () => Promise.reject(new Error('нет файла config.json\nстек')) }, factory);
    assert.equal(run.pass, false);
    assert.equal(run.detail, 'проверка упала: нет файла config.json');
  });

  it('keep: копия остаётся, путь — в результате', async () => {
    const { factory } = scriptedAgent(textReply('Готово'));
    const run = await runTask(promo, factory, { keep: true, attempt: 2 });
    try {
      assert.equal(run.attempt, 2);
      assert.ok(run.dir && existsSync(path.join(run.dir, 'src/discount.js')));
    } finally {
      if (run.dir) await rm(run.dir, { recursive: true, force: true });
    }
  });
});

function fakeRun(task: string, attempt: number, pass: boolean, extra: Partial<TaskRun> = {}): TaskRun {
  return {
    task,
    attempt,
    pass,
    detail: pass ? 'тесты: 3/3' : 'тесты: 2/3',
    stopReason: 'done',
    steps: 4,
    usage: { input: 1000, output: 100 },
    cost: 0.001,
    ms: 2000,
    ...extra,
  };
}

describe('Шаг 4 / Step 4. Набор и метрики', () => {
  it('runSuite: каждая задача runs раз, по очереди, прогоны пронумерованы', async () => {
    let active = 0;
    let maxActive = 0;
    const seen: string[] = [];
    const factory: AgentFactory = (dir, onEvent) =>
      codeAgent(
        new ScriptedProvider([
          async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
            return textReply('Готово');
          },
        ]),
      )(dir, onEvent);
    const pass: Check = async () => ({ pass: true, detail: 'ok' });
    const tasks: EvalTask[] = [
      { ...promo, id: 'a', check: pass },
      { ...promo, id: 'b', check: pass },
    ];
    const runs = await runSuite(tasks, factory, { runs: 3, onRun: (run) => seen.push(`${run.task}#${run.attempt}`) });
    assert.deepEqual(
      runs.map((run) => `${run.task}#${run.attempt}`),
      ['a#1', 'a#2', 'a#3', 'b#1', 'b#2', 'b#3'],
    );
    assert.deepEqual(seen, ['a#1', 'a#2', 'a#3', 'b#1', 'b#2', 'b#3'], 'onRun — после каждого прогона');
    assert.equal(maxActive, 1, 'прогоны идут по одному');
  });

  it('runSuite по умолчанию — один прогон на задачу', async () => {
    const factory: AgentFactory = (dir, onEvent) => codeAgent(new ScriptedProvider([textReply('Готово')]))(dir, onEvent);
    const runs = await runSuite([{ ...promo, check: async () => ({ pass: false, detail: 'нет' }) }], factory);
    assert.equal(runs.length, 1);
  });

  it('summarize: доля решённых без ошибок, всегда / хоть раз / плавают', () => {
    const runs = [
      fakeRun('a', 1, true),
      fakeRun('a', 2, true, { steps: 6 }),
      fakeRun('b', 1, true),
      fakeRun('b', 2, false),
      fakeRun('c', 1, false),
      fakeRun('c', 2, false, { error: '429', detail: 'не проверено', stopReason: 'error', steps: 1 }),
    ];
    const summary = summarize(runs);
    assert.equal(summary.runs, 6);
    assert.equal(summary.errors, 1);
    assert.equal(summary.passed, 3);
    assert.equal(summary.passRate, 3 / 5, 'ошибка шлюза не входит в знаменатель');
    assert.equal(summary.solvedAlways, 1);
    assert.equal(summary.solvedOnce, 2);
    assert.deepEqual(summary.flaky, ['b']);
    assert.equal(summary.steps, (4 + 6 + 4 + 4 + 4) / 5, 'шаги — по проверенным прогонам');
    assert.deepEqual(summary.usage, { input: 6000, output: 600 });
    assert.ok(Math.abs(summary.cost - 0.006) < 1e-12);
    assert.equal(summary.ms, 12000);

    assert.deepEqual(
      summary.tasks.map((task) => [task.task, task.marks, task.passed, task.errors]),
      [
        ['a', '✓✓', 2, 0],
        ['b', '✓✗', 1, 0],
        ['c', '✗!', 0, 1],
      ],
    );
    assert.equal(summary.tasks[0].steps, 5);
  });

  it('summarize: пустой набор и одни ошибки — не NaN', () => {
    assert.equal(summarize([]).passRate, 0);
    const onlyErrors = summarize([fakeRun('a', 1, false, { error: '502' })]);
    assert.equal(onlyErrors.passRate, 0);
    assert.equal(onlyErrors.solvedAlways, 0, 'непроверенная задача не «решена всегда»');
    assert.deepEqual(onlyErrors.flaky, []);
  });
});

describe('Шаг 5 / Step 5. Отчёт', () => {
  it('formatSuite: строка на задачу и итог', () => {
    const text = formatSuite(
      summarize([
        fakeRun('promo-threshold', 1, true),
        fakeRun('promo-threshold', 2, true),
        fakeRun('slugify', 1, true),
        fakeRun('slugify', 2, false),
        fakeRun('rename-calc', 1, false, { error: '429' }),
      ]),
    );
    const lines = text.split('\n');
    assert.match(lines[0], /^promo-threshold {2}✓✓ {2}2\/2 · шагов 4\.0 · токенов 2200 · \$0\.0020 · 4\.0 с$/);
    assert.match(lines[1], /^slugify {10}✓✗ {2}1\/2/);
    assert.match(lines[2], /^rename-calc {6}! {2}0\/0/);
    assert.ok(text.includes('Решено прогонов: 3/4 (75%) · задач всегда: 1/3 · хоть раз: 2/3'), text);
    assert.ok(text.includes('Плавают: slugify'), text);
    assert.ok(text.includes('Не проверено из-за ошибок: 1'), text);
    assert.ok(text.includes('токенов: вход 5000 · выход 500 · $0.0050 · 10.0 с'), text);
  });

  it('без плавающих задач и ошибок — без лишних строк', () => {
    const text = formatSuite(summarize([fakeRun('a', 1, true)]));
    assert.ok(!text.includes('Плавают'));
    assert.ok(!text.includes('Не проверено'));
  });
});
