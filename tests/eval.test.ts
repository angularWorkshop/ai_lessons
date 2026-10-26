import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMIT_TYPES } from '../src/commit.ts';
import { CommitTypeSchema, EVAL_CASES, EXAMPLES } from '../src/commit-cases.ts';
import { findLeaks, formatReport, runEval, type EvalCase, type EvalReport } from '../src/eval.ts';
import { fewShotMessages } from '../src/few-shot.ts';

// Модель здесь не нужна: вместо неё — обычная функция, которая отвечает по таблице.

const SYSTEM = 'Ты выбираешь type Conventional Commits для git diff.';

describe('Шаг 1 / Step 1. fewShotMessages', () => {
  it('без примеров: system и вопрос', () => {
    assert.deepEqual(fewShotMessages(SYSTEM, [], 'diff A'), [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'diff A' },
    ]);
  });

  it('каждый пример — пара user/assistant, вопрос в самом конце', () => {
    const examples = [
      { input: 'diff 1', output: '{"type":"build"}' },
      { input: 'diff 2', output: '{"type":"fix"}' },
    ];
    assert.deepEqual(fewShotMessages(SYSTEM, examples, 'diff A'), [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'diff 1' },
      { role: 'assistant', content: '{"type":"build"}' },
      { role: 'user', content: 'diff 2' },
      { role: 'assistant', content: '{"type":"fix"}' },
      { role: 'user', content: 'diff A' },
    ]);
  });
});

const cases: EvalCase<string, string>[] = [
  { id: 'a', input: 'diff a', expected: 'build' },
  { id: 'b', input: 'diff b', expected: 'fix' },
  { id: 'c', input: 'diff c', expected: 'test' },
  { id: 'd', input: 'diff d', expected: 'docs' },
];

const answers: Record<string, string> = { 'diff a': 'chore', 'diff b': 'fix', 'diff c': 'test', 'diff d': 'docs' };
const model = async (input: string) => answers[input];

describe('Шаг 2 / Step 2. runEval считает долю верных', () => {
  it('passed, total, accuracy', async () => {
    const report = await runEval(cases, model);
    assert.equal(report.total, 4);
    assert.equal(report.passed, 3);
    assert.equal(report.errors, 0);
    assert.equal(report.accuracy, 0.75);
  });

  it('results — по кейсу на строку, в порядке набора', async () => {
    const report = await runEval(cases, model);
    assert.deepEqual(report.results, [
      { id: 'a', expected: 'build', actual: 'chore', ok: false },
      { id: 'b', expected: 'fix', actual: 'fix', ok: true },
      { id: 'c', expected: 'test', actual: 'test', ok: true },
      { id: 'd', expected: 'docs', actual: 'docs', ok: true },
    ]);
  });

  it('кейсы идут по одному, а не все сразу', async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    await runEval(cases, async (input) => {
      running++;
      peak = Math.max(peak, running);
      order.push(input);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return answers[input];
    });
    assert.equal(peak, 1, 'одновременно выполнялось больше одного кейса');
    assert.deepEqual(order, ['diff a', 'diff b', 'diff c', 'diff d']);
  });

  it('сравнение можно передать своё', async () => {
    const report = await runEval(cases, model, (actual, expected) => actual === expected || actual === 'chore');
    assert.equal(report.passed, 4);
  });
});

describe('Шаг 3 / Step 3. Упавший кейс не роняет прогон', () => {
  const flaky = async (input: string) => {
    if (input === 'diff b') {
      throw new Error('LLM API ответил 502');
    }
    return answers[input];
  };

  it('ошибка записывается в результат кейса, прогон идёт дальше', async () => {
    const report = await runEval(cases, flaky);
    assert.equal(report.results.length, 4);
    assert.deepEqual(report.results[1], { id: 'b', expected: 'fix', error: 'LLM API ответил 502', ok: false });
    assert.equal(report.results[3].ok, true);
  });

  it('ошибки считаются отдельно и не дают верных', async () => {
    const report = await runEval(cases, flaky);
    assert.equal(report.passed, 2);
    assert.equal(report.errors, 1);
    assert.equal(report.accuracy, 0.5);
  });

  it('пустой набор: accuracy 0, а не NaN', async () => {
    const report = await runEval([], model);
    assert.deepEqual(report, { total: 0, passed: 0, errors: 0, accuracy: 0, results: [] });
  });
});

describe('Шаг 4 / Step 4. findLeaks: примеры не попадают в проверку', () => {
  it('пример с тем же текстом, что и кейс, — утечка', () => {
    assert.deepEqual(findLeaks([{ input: 'diff c' }], cases), ['c']);
  });

  it('отличия только в пробелах и переводах строк — всё равно утечка', () => {
    assert.deepEqual(findLeaks([{ input: '  diff\n\n  a ' }, { input: 'diff d' }], cases), ['a', 'd']);
  });

  it('нет совпадений — пустой список', () => {
    assert.deepEqual(findLeaks([{ input: 'diff z' }], cases), []);
  });

  it('в наборе курса утечек нет, id уникальны, ожидания и ответы примеров — настоящие type', () => {
    assert.deepEqual(findLeaks(EXAMPLES, EVAL_CASES), []);
    assert.equal(new Set(EVAL_CASES.map((item) => item.id)).size, EVAL_CASES.length);
    for (const item of EVAL_CASES) {
      assert.ok((COMMIT_TYPES as readonly string[]).includes(item.expected), item.id);
    }
    // Ответ в примере — ровно то, что модель должна прислать сама.
    for (const example of EXAMPLES) {
      assert.ok(CommitTypeSchema.safeParse(JSON.parse(example.output)).success, example.output);
    }
  });
});

describe('Шаг 5 / Step 5. formatReport', () => {
  it('заголовок со счётом и процентом, ниже — только ошибки', () => {
    const report: EvalReport<string> = {
      total: 4,
      passed: 2,
      errors: 1,
      accuracy: 0.5,
      results: [
        { id: 'a', expected: 'build', actual: 'chore', ok: false },
        { id: 'b', expected: 'fix', error: 'LLM API ответил 502', ok: false },
        { id: 'c', expected: 'test', actual: 'test', ok: true },
        { id: 'd', expected: 'docs', actual: 'docs', ok: true },
      ],
    };
    assert.equal(
      formatReport('Без примеров', report),
      'Без примеров: 2/4 (50%)\n  ✖ a: ожидали build, получили chore\n  ✖ b: ошибка — LLM API ответил 502',
    );
  });

  it('процент округляется до целого', () => {
    const report: EvalReport<string> = { total: 14, passed: 12, errors: 0, accuracy: 12 / 14, results: [] };
    assert.equal(formatReport('С примерами', report), 'С примерами: 12/14 (86%)');
  });
});
