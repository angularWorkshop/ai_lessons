import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { AgentEvent } from '../src/agent.ts';
import { codeAgent } from '../src/evals/agent-under-test.ts';
import { compareRuns, formatComparison, meanNoise, noiseOf } from '../src/evals/compare.ts';
import { diagnose, type FindingKind } from '../src/evals/diagnose.ts';
import { runTask, type TaskRun } from '../src/evals/runner.ts';
import { loadRuns, runsFile, saveRuns } from '../src/evals/store.ts';
import { costBreakdown, findingStats, suiteReport } from '../src/evals/suite-report.ts';
import { TASKS } from '../src/evals/tasks.ts';
import { recordTrace, TRACE_CONTENT_CHARS, type TraceEvent } from '../src/evals/trace.ts';
import { assistantMessage } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';

const call = (id: string, name: string, args: unknown) => ({ id, name, arguments: JSON.stringify(args) });

describe('Шаг 1 / Step 1. Трейс из onEvent', () => {
  it('recordTrace: события агента → записи со временем от начала прогона', () => {
    const times = [1000, 1000, 1200, 1500, 1500, 2600, 3000];
    const recorder = recordTrace(() => times.shift()!);
    const read = call('c1', 'read_file', { path: 'src/a.js' });
    const events: AgentEvent[] = [
      { type: 'step', step: 1 },
      { type: 'text_delta', text: 'Чита' },
      { type: 'assistant', message: assistantMessage('Читаю', [read]), usage: { input: 900, output: 20 } },
      { type: 'tool_call', call: read },
      { type: 'tool_result', call: read, result: { content: '1\tconst a = 1;', isError: false } },
      { type: 'stop', reason: 'done' },
    ];
    events.forEach(recorder.onEvent);
    assert.deepEqual(recorder.events, [
      { t: 0, type: 'step', step: 1 },
      { t: 500, type: 'assistant', text: 'Читаю', calls: 1, usage: { input: 900, output: 20 } },
      { t: 500, type: 'tool_call', id: 'c1', name: 'read_file', args: '{"path":"src/a.js"}' },
      { t: 1600, type: 'tool_result', id: 'c1', name: 'read_file', args: '{"path":"src/a.js"}', isError: false, chars: 14, content: '1\tconst a = 1;' },
      { t: 2000, type: 'stop', reason: 'done' },
    ]);
  });

  it('длинный результат — первые TRACE_CONTENT_CHARS символов, но chars — полная длина', () => {
    const recorder = recordTrace(() => 0);
    const run = call('c2', 'run_command', { command: 'npm', args: ['test'] });
    recorder.onEvent({ type: 'tool_result', call: run, result: { content: 'x'.repeat(5000), isError: true } });
    const [event] = recorder.events;
    assert.equal(event.type, 'tool_result');
    assert.equal(event.type === 'tool_result' && event.chars, 5000);
    assert.equal(event.type === 'tool_result' && event.content.length, TRACE_CONTENT_CHARS);
    assert.equal(event.type === 'tool_result' && event.isError, true);
  });

  it('runTask пишет трейс каждого прогона, а onEvent снаружи получает те же события', async () => {
    const promo = TASKS.find((task) => task.id === 'promo-threshold')!;
    const provider = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/discount.js' } }]),
      textReply('Готово'),
    ]);
    const seen: string[] = [];
    const run = await runTask(promo, codeAgent(provider), { onEvent: (event) => seen.push(event.type) });
    const types = (run.trace ?? []).map((event) => event.type);
    assert.deepEqual(types, ['step', 'assistant', 'tool_call', 'tool_result', 'step', 'assistant', 'stop']);
    assert.deepEqual(seen, types);
    const result = run.trace?.find((event) => event.type === 'tool_result');
    assert.match(result?.type === 'tool_result' ? result.content : '', /sum > promo\.threshold/);
  });
});

let nextId = 0;
function result(name: string, args: unknown, content = 'ok', isError = false): TraceEvent {
  const id = `t${++nextId}`;
  return { t: 0, type: 'tool_result', id, name, args: JSON.stringify(args), isError, chars: content.length, content };
}
const read = (file: string) => result('read_file', { path: file }, `1\t${file}`);
const edit = (file: string, n = 1) => result('edit_file', { path: file, old_str: `a${n}`, new_str: `b${n}` }, `Изменён ${file}`);
const npmTest = (output: string) => result('run_command', { command: 'npm', args: ['test'] }, `$ npm test\nкод выхода: 1\n${output}`);

function traced(trace: TraceEvent[], extra: Partial<TaskRun> = {}): TaskRun {
  return {
    task: 'email-check',
    attempt: 1,
    pass: false,
    detail: 'тесты: 8/9',
    stopReason: 'done',
    steps: trace.length,
    usage: { input: 1000, output: 100 },
    cost: 0.001,
    ms: 1000,
    trace,
    ...extra,
  };
}
const kinds = (run: TaskRun): FindingKind[] => diagnose(run).map((finding) => finding.kind);

describe('Шаг 2 / Step 2. Типичные провалы', () => {
  it('зацикливание: тот же вызов с тем же результатом три раза', () => {
    const findings = diagnose(traced([edit('a.js'), npmTest('✖ email'), npmTest('✖ email'), npmTest('✖ email')]));
    const loop = findings.find((finding) => finding.kind === 'loop');
    assert.ok(loop, JSON.stringify(findings));
    assert.equal(loop.count, 3);
    assert.match(loop.detail, /run_command npm test ×3/);
  });

  it('тесты после каждой правки — не зацикливание: результат каждый раз новый', () => {
    const run = traced([edit('a.js', 1), npmTest('✖ 1'), edit('a.js', 2), npmTest('✖ 2'), edit('a.js', 3), npmTest('ok')]);
    assert.ok(!kinds(run).includes('loop'));
  });

  it('остановка repeated_call — тоже зацикливание', () => {
    assert.ok(kinds(traced([], { stopReason: 'repeated_call' })).includes('loop'));
  });

  it('лимит шагов и бюджета; обрезанный ответ модели', () => {
    assert.ok(kinds(traced([], { stopReason: 'max_steps' })).includes('limit'));
    assert.ok(kinds(traced([], { stopReason: 'budget' })).includes('limit'));
    assert.ok(kinds(traced([], { stopReason: 'truncated' })).includes('truncated'));
    assert.deepEqual(kinds(traced([])), [], 'пустой трейс и done — находок нет');
  });

  it('лишние чтения: файл перечитан, хотя его не меняли', () => {
    const findings = diagnose(traced([read('src/users.js'), read('tests/u.js'), read('src/users.js'), read('src/users.js')]));
    const reread = findings.find((finding) => finding.kind === 'reread');
    assert.equal(reread?.count, 2);
    assert.match(reread?.detail ?? '', /src\/users\.js ×2/);
  });

  it('чтение после правки — не лишнее', () => {
    assert.ok(!kinds(traced([read('a.js'), edit('a.js'), read('a.js'), npmTest('ok')])).includes('reread'));
  });

  it('ошибки инструментов — по инструменту, с первой строкой первой ошибки', () => {
    const findings = diagnose(
      traced([
        result('run_command', { command: 'npm test' }, 'Ошибка: команды npm test нет в белом списке\nещё', true),
        result('run_command', { command: 'npm test' }, 'Ошибка: опять', true),
        result('edit_file', { path: 'a.js' }, 'old_str не найден в a.js', true),
      ]),
    );
    const errors = findings.filter((finding) => finding.kind === 'tool_error');
    assert.deepEqual(
      errors.map((finding) => [finding.count, finding.detail]),
      [
        [2, 'run_command ×2: Ошибка: команды npm test нет в белом списке'],
        [1, 'edit_file ×1: old_str не найден в a.js'],
      ],
    );
  });

  it('обрезка: метка наших инструментов или результат длиннее сохранённого', () => {
    const marked = result('run_command', { command: 'npm', args: ['test'] }, 'начало\n…[пропущено 9000 символов из 12000]…\nконец');
    assert.ok(kinds(traced([marked])).includes('truncated'));
    const long = { ...read('big.js'), chars: 9000 } as TraceEvent;
    assert.ok(kinds(traced([long])).includes('truncated'));
  });

  it('правки без проверки: после последней правки ни одного запуска', () => {
    assert.ok(kinds(traced([read('a.js'), edit('a.js')])).includes('unverified'));
    assert.ok(kinds(traced([edit('a.js'), npmTest('ok'), edit('b.js')])).includes('unverified'));
    assert.ok(!kinds(traced([edit('a.js'), npmTest('ok')])).includes('unverified'));
    assert.ok(!kinds(traced([read('a.js')])).includes('unverified'), 'без правок проверять нечего');
  });
});

function fakeRun(task: string, attempt: number, pass: boolean, extra: Partial<TaskRun> = {}): TaskRun {
  return traced([], { task, attempt, pass, detail: pass ? 'тесты: 3/3' : 'тесты: 2/3', cost: 0.001, steps: 5, ...extra });
}

describe('Шаг 3 / Step 3. Отчёт по набору', () => {
  it('saveRuns и loadRuns: JSONL туда и обратно, вместе с трейсом', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'edutec-runs-'));
    try {
      const file = path.join(dir, 'deep', 'base.jsonl');
      const runs = [fakeRun('a', 1, true, { trace: [read('a.js')] }), fakeRun('a', 2, false)];
      await saveRuns(file, runs);
      const text = await readFile(file, 'utf8');
      assert.equal(text.split('\n').filter(Boolean).length, 2, 'по строке на прогон');
      assert.deepEqual(await loadRuns(file), runs);

      await writeFile(file, `${JSON.stringify(runs[0])}\n{битая\n`);
      await assert.rejects(loadRuns(file), /:2/);
      assert.equal(runsFile('base'), path.join('.agent/evals', 'base.jsonl'), 'метка → .agent/evals/<метка>.jsonl');
      assert.equal(runsFile('tmp/x.jsonl'), 'tmp/x.jsonl');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('findingStats: в скольких прогонах, сколько всего и сколько в нерешённых', () => {
    const runs = [
      fakeRun('a', 1, true, { trace: [read('x.js'), read('x.js')] }),
      fakeRun('a', 2, false, { stopReason: 'max_steps', trace: [read('x.js'), read('x.js'), read('x.js'), edit('x.js')] }),
    ];
    const stats = findingStats(runs);
    const reread = stats.find((stat) => stat.kind === 'reread');
    assert.deepEqual(reread, { kind: 'reread', runs: 2, count: 3, inFailed: 2 });
    assert.deepEqual(stats.find((stat) => stat.kind === 'limit'), { kind: 'limit', runs: 1, count: 1, inFailed: 1 });
  });

  it('costBreakdown: всего, на нерешённые, за решённый прогон, самая дорогая задача', () => {
    const cost = costBreakdown([
      fakeRun('a', 1, true, { cost: 0.001 }),
      fakeRun('b', 1, false, { cost: 0.003 }),
      fakeRun('b', 2, true, { cost: 0.002 }),
    ]);
    assert.ok(Math.abs(cost.total - 0.006) < 1e-12);
    assert.ok(Math.abs(cost.failed - 0.003) < 1e-12);
    assert.ok(Math.abs(cost.perSolved - 0.003) < 1e-12);
    assert.equal(cost.priciest?.task, 'b');
  });

  it('suiteReport: итог, провалы с находками, непроверенные и стоимость', () => {
    const report = suiteReport([
      fakeRun('rename-calc', 1, false, { stopReason: 'max_steps', trace: [read('a.js'), edit('a.js')] }),
      fakeRun('rename-calc', 2, false),
      fakeRun('slugify', 1, true, { cost: 0.002 }),
      fakeRun('slugify', 2, false, { error: 'LLM API ответил 429', stopReason: 'error', detail: 'не проверено' }),
    ]);
    assert.match(report, /^rename-calc {2}✗✗/m, 'сначала — итог из темы 14.1');
    assert.match(report, /Не решены:\n {2}✗ rename-calc #1/);
    assert.match(report, / {4}лимит: остановлен по max_steps/);
    assert.match(report, / {4}правки без проверки: после последней правки тесты не запускались/);
    assert.match(report, /✗ rename-calc #2[^\n]*\n {4}по трейсу ничего не видно/);
    assert.match(report, /Не проверены:\n {2}! slugify #2/);
    assert.match(report, /Находки во всех 4 прогонах:\n {2}лимит: прогонов 1, всего 1, из них в нерешённых 1/);
    assert.match(report, /Стоимость: всего \$0\.0050 · на нерешённые \$0\.0030 \(60%\) · за решённый прогон \$0\.0050 · дороже всех slugify \(\$0\.0030\)$/);
  });
});

const runs = (task: string, passed: number, total: number, cost = 0.0005): TaskRun[] =>
  Array.from({ length: total }, (_, i) => fakeRun(task, i + 1, i < passed, { cost }));

describe('Шаг 4 / Step 4. Две версии и шум', () => {
  it('noiseOf: 18 из 18 — не ноль, больше прогонов — меньше шум', () => {
    assert.ok(noiseOf({ passed: 18, checked: 18 }, { passed: 18, checked: 18 }) > 0);
    const p = 13 / 14;
    assert.ok(Math.abs(noiseOf({ passed: 12, checked: 12 }, { passed: 12, checked: 12 }) - 2 * Math.sqrt((2 * p * (1 - p)) / 12)) < 1e-12);
    assert.ok(noiseOf({ passed: 30, checked: 60 }, { passed: 30, checked: 60 }) < noiseOf({ passed: 5, checked: 10 }, { passed: 5, checked: 10 }));
  });

  it('meanNoise: одинаковые значения — ноль, разброс — больше нуля', () => {
    assert.equal(meanNoise([1, 1, 1], [2, 2, 2]), 0);
    assert.ok(Math.abs(meanNoise([1, 3], [2, 2]) - 2 * Math.sqrt(2 / 2)) < 1e-12);
  });

  it('5/5 → 0/5 — хуже, за пределами шума', () => {
    const comparison = compareRuns(runs('rename-calc', 5, 5), runs('rename-calc', 0, 5));
    assert.equal(comparison.delta, -1);
    assert.equal(comparison.verdict, 'хуже');
    assert.deepEqual(comparison.tasks, [{ task: 'rename-calc', base: { passed: 5, checked: 5 }, next: { passed: 0, checked: 5 } }]);
  });

  it('12/12 → 9/12 на двенадцати прогонах — ещё в пределах шума', () => {
    const base = [...runs('a', 6, 6), ...runs('b', 6, 6)];
    const next = [...runs('a', 6, 6), ...runs('b', 3, 6)];
    const comparison = compareRuns(base, next);
    assert.equal(comparison.delta, -0.25);
    assert.equal(comparison.verdict, 'в пределах шума');
    assert.ok(Math.abs(comparison.noise) > 0.25);
  });

  it('ошибки шлюза не входят в доли; задачи — объединение двух наборов', () => {
    const base = [...runs('a', 1, 1), fakeRun('a', 2, false, { error: '502' })];
    const next = [...runs('a', 1, 1), ...runs('b', 1, 1)];
    const comparison = compareRuns(base, next);
    assert.deepEqual(comparison.base, { passed: 1, checked: 1 });
    assert.deepEqual(
      comparison.tasks.map((task) => [task.task, task.base.checked, task.next.checked]),
      [
        ['a', 1, 1],
        ['b', 0, 1],
      ],
    );
  });

  it('средние на прогон: шаги, токены, цена и шум цены', () => {
    const comparison = compareRuns(
      [fakeRun('a', 1, true, { steps: 10, cost: 0.001 }), fakeRun('a', 2, true, { steps: 6, cost: 0.003 })],
      [fakeRun('a', 1, true, { steps: 5, cost: 0.001 }), fakeRun('a', 2, true, { steps: 5, cost: 0.001 })],
    );
    assert.equal(comparison.baseAvg.steps, 8);
    assert.equal(comparison.nextAvg.steps, 5);
    assert.equal(comparison.baseAvg.tokens, 1100);
    assert.ok(Math.abs(comparison.nextAvg.cost - 0.001) < 1e-12);
    assert.ok(comparison.costNoise > 0);
  });
});

describe('Шаг 5 / Step 5. Сравнение для человека', () => {
  it('formatComparison: задачи со стрелками, доли с шумом и вердиктом, средние', () => {
    const base = [...runs('promo-threshold', 2, 2, 0.0005), ...runs('rename-calc', 2, 2, 0.001)];
    const next = [...runs('promo-threshold', 2, 2, 0.0005), ...runs('rename-calc', 0, 2, 0.0005)];
    const text = formatComparison(compareRuns(base, next), ['base', 'short']);
    const lines = text.split('\n');
    assert.equal(lines[0], 'base → short');
    assert.equal(lines[1], '  promo-threshold  2/2 → 2/2');
    assert.equal(lines[2], '  rename-calc      2/2 → 0/2  ↓');
    assert.match(text, /Решено: 4\/4 \(100%\) → 2\/4 \(50%\) · разница −50 п\.п\., шум ±\d+ п\.п\. — /);
    assert.match(text, /На прогон: шагов 5\.0 → 5\.0 · токенов 1100 → 1100 · \$0\.000750 → \$0\.000500 \(−33%\), шум ±\$0\.\d{6}/);
  });

  it('метки по умолчанию — base и next', () => {
    assert.equal(formatComparison(compareRuns(runs('a', 1, 1), runs('a', 1, 1))).split('\n')[0], 'base → next');
  });
});
