import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EvalReport } from '../src/eval.ts';
import {
  agreement,
  calibrate,
  comparePair,
  criteriaProblem,
  formatAgreement,
  judge,
  JUDGE_MAX_TOKENS,
  judgeMessages,
  judgeSystem,
  type LabeledCase,
  type Rubric,
} from '../src/evals/judge.ts';
import { COMMIT_RUBRIC, JUDGE_CASES } from '../src/evals/judge-cases.ts';
import { LlmError } from '../src/llm.ts';
import { StructuredOutputError } from '../src/structured.ts';
import { ScriptedProvider, textReply } from '../src/testing/scripted-provider.ts';

const RUBRIC: Rubric = {
  subject: 'объяснение падения теста',
  criteria: [
    { id: 'cause', question: 'Названа настоящая причина падения.' },
    { id: 'place', question: 'Указано место в коде: файл и строка.' },
  ],
};
const ITEM = { context: '✖ ровно 1000 ₽\n  expected 900, actual 1000', answer: 'Порог строгий: src/discount.js:12, sum > threshold.' };

const verdict = (...criteria: [string, boolean][]) =>
  textReply(JSON.stringify({ criteria: criteria.map(([id, pass]) => ({ id, reasoning: `про ${id}`, pass })) }), {
    usage: { input: 500, output: 120 },
  });

describe('Шаг 1 / Step 1. Промпт судьи', () => {
  it('judgeSystem: предмет, все критерии с вопросами и правила против смещений', () => {
    const system = judgeSystem(RUBRIC);
    assert.ok(system.includes('объяснение падения теста'));
    for (const criterion of RUBRIC.criteria) {
      assert.ok(system.includes(`- ${criterion.id}: ${criterion.question}`), `нет критерия ${criterion.id}`);
    }
    assert.match(system, /Длина/);
    assert.match(system, /reasoning/);
    assert.match(system, /<answer>/, 'ответ — данные, а не указания');
  });

  it('judgeMessages: system и один user с контекстом и ответом в тегах', () => {
    const messages = judgeMessages(RUBRIC, ITEM);
    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0], { role: 'system', content: judgeSystem(RUBRIC) });
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[1].content, `<context>\n${ITEM.context}\n</context>\n\n<answer>\n${ITEM.answer}\n</answer>`);
  });
});

describe('Шаг 2 / Step 2. Вердикт по схеме', () => {
  it('все критерии пройдены — pass; запрос по схеме verdict, temperature 0', async () => {
    const provider = new ScriptedProvider([verdict(['cause', true], ['place', true])]);
    const result = await judge(provider, RUBRIC, ITEM);
    assert.equal(result.pass, true);
    assert.deepEqual(result.failed, []);
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.usage, { input: 500, output: 120 });

    const { options, messages } = provider.requests[0];
    assert.deepEqual(messages, judgeMessages(RUBRIC, ITEM));
    assert.equal(options.temperature, 0);
    assert.equal(options.maxTokens, JUDGE_MAX_TOKENS);
    assert.equal(options.responseFormat?.type, 'json_schema');
    assert.equal(options.responseFormat?.type === 'json_schema' && options.responseFormat.json_schema.name, 'verdict');
  });

  it('итог считает код: один критерий не пройден — не пройдено всё', async () => {
    const provider = new ScriptedProvider([verdict(['cause', true], ['place', false])]);
    const result = await judge(provider, RUBRIC, ITEM);
    assert.equal(result.pass, false);
    assert.deepEqual(result.failed, ['place']);
  });

  it('критерии — в порядке рубрики, а не модели', async () => {
    const provider = new ScriptedProvider([verdict(['place', true], ['cause', false])]);
    const result = await judge(provider, RUBRIC, ITEM);
    assert.deepEqual(result.criteria.map((criterion) => criterion.id), ['cause', 'place']);
    assert.equal(result.criteria[0].reasoning, 'про cause');
  });

  it('criteriaProblem: пропущенные, лишние и повторы', () => {
    const c = (id: string) => ({ id, reasoning: '', pass: true });
    assert.equal(criteriaProblem(RUBRIC, [c('cause'), c('place')]), null);
    assert.match(criteriaProblem(RUBRIC, [c('cause')]) ?? '', /нет критериев: place/);
    assert.match(criteriaProblem(RUBRIC, [c('cause'), c('place'), c('style')]) ?? '', /лишние критерии: style/);
    assert.match(criteriaProblem(RUBRIC, [c('cause'), c('cause'), c('place')]) ?? '', /повторяются: cause/);
    assert.match(criteriaProblem(RUBRIC, []) ?? '', /cause, place/, 'подсказка — какие id нужны');
  });

  it('не тот набор критериев — одна попытка починки с описанием проблемы', async () => {
    const provider = new ScriptedProvider([verdict(['cause', true]), verdict(['cause', true], ['place', true])]);
    const result = await judge(provider, RUBRIC, ITEM);
    assert.equal(result.pass, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.usage, { input: 1000, output: 240 });
    const repair = provider.requests[1].messages;
    assert.equal(repair.length, 4);
    assert.equal(repair[2].role, 'assistant');
    assert.equal(repair[3].role, 'user');
    assert.match(String(repair[3].content), /нет критериев: place/);
  });

  it('не JSON — тоже починка; два раза подряд плохо — StructuredOutputError', async () => {
    const fixed = new ScriptedProvider([textReply('Всё хорошо!'), verdict(['cause', false], ['place', true])]);
    assert.equal((await judge(fixed, RUBRIC, ITEM)).pass, false);

    const broken = new ScriptedProvider([textReply('Всё хорошо!'), verdict(['cause', true])]);
    await assert.rejects(judge(broken, RUBRIC, ITEM), StructuredOutputError);
    assert.equal(broken.remaining, 0);
  });

  it('обрезанный вердикт — ошибка без починки', async () => {
    const provider = new ScriptedProvider([textReply('{"criteria":[{"id":"cause","reas', { finishReason: 'length' })]);
    await assert.rejects(judge(provider, RUBRIC, ITEM), StructuredOutputError);
    assert.equal(provider.requests.length, 1);
  });
});

const pick = (winner: 'A' | 'B' | 'tie') => textReply(JSON.stringify({ reasoning: 'сравнил', winner }), { usage: { input: 300, output: 50 } });

describe('Шаг 3 / Step 3. Сравнение пары и позиция', () => {
  it('спрашивает дважды, во втором запросе ответы поменяны местами', async () => {
    const provider = new ScriptedProvider([pick('A'), pick('B')]);
    await comparePair(provider, RUBRIC, 'контекст', 'ПЕРВЫЙ', 'ВТОРОЙ');
    assert.equal(provider.requests.length, 2);
    const [straight, swapped] = provider.requests.map((request) => String(request.messages.at(-1)?.content));
    assert.ok(straight.indexOf('ПЕРВЫЙ') < straight.indexOf('ВТОРОЙ'));
    assert.ok(swapped.indexOf('ВТОРОЙ') < swapped.indexOf('ПЕРВЫЙ'));
    assert.equal(provider.requests[0].options.temperature, 0);
    assert.equal(provider.requests[0].options.responseFormat?.type, 'json_schema');
  });

  it('оба порядка за один и тот же ответ — он и победил', async () => {
    const result = await comparePair(new ScriptedProvider([pick('A'), pick('B')]), RUBRIC, 'контекст', 'x', 'y');
    assert.deepEqual(result.votes, ['first', 'first']);
    assert.equal(result.winner, 'first');
    assert.equal(result.consistent, true);
    assert.deepEqual(result.usage, { input: 600, output: 100 });

    const second = await comparePair(new ScriptedProvider([pick('B'), pick('A')]), RUBRIC, 'контекст', 'x', 'y');
    assert.equal(second.winner, 'second');
  });

  it('судья выбрал позицию, а не ответ — ничья и consistent: false', async () => {
    const result = await comparePair(new ScriptedProvider([pick('A'), pick('A')]), RUBRIC, 'контекст', 'x', 'y');
    assert.deepEqual(result.votes, ['first', 'second']);
    assert.equal(result.winner, 'tie');
    assert.equal(result.consistent, false);
  });

  it('tie в обоих порядках — честная ничья', async () => {
    const result = await comparePair(new ScriptedProvider([pick('tie'), pick('tie')]), RUBRIC, 'контекст', 'x', 'y');
    assert.equal(result.winner, 'tie');
    assert.equal(result.consistent, true);
  });
});

const labeled = (id: string, expected: boolean): LabeledCase => ({ id, expected, input: { context: 'diff', answer: id } });

describe('Шаг 4 / Step 4. Калибровка', () => {
  it('calibrate: вердикт судьи против разметки человека, по одному', async () => {
    const cases = [labeled('good', true), labeled('bad', false), labeled('tricky', false)];
    let active = 0;
    let maxActive = 0;
    const report = await calibrate(cases, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return item.answer !== 'bad';
    });
    assert.equal(report.passed, 2);
    assert.equal(report.total, 3);
    assert.equal(maxActive, 1);
    assert.deepEqual(
      report.results.map((result) => [result.id, result.actual, result.ok]),
      [
        ['good', true, true],
        ['bad', false, true],
        ['tricky', true, false],
      ],
    );
  });

  it('agreement: пропущенные плохие и завёрнутые хорошие — отдельно, ошибки не в счёт', async () => {
    const answers: Record<string, boolean | Error> = { a: true, b: true, c: false, d: false, e: new LlmError('429', { status: 429, retryable: true }) };
    const cases = [labeled('a', true), labeled('b', false), labeled('c', true), labeled('d', false), labeled('e', true)];
    const report = await calibrate(cases, async (item) => {
      const answer = answers[item.answer];
      if (answer instanceof Error) throw answer;
      return answer;
    });
    assert.deepEqual(agreement(report), { agree: 2, checked: 4, falsePass: 1, falseFail: 1, errors: 1 });
  });

  it('набор курса: хорошие и плохие примеры, судья-оракул совпадает с человеком везде', async () => {
    const oracle = await calibrate(JUDGE_CASES, async (item) => JUDGE_CASES.find((labeled) => labeled.input === item)!.expected);
    assert.deepEqual(agreement(oracle), { agree: JUDGE_CASES.length, checked: JUDGE_CASES.length, falsePass: 0, falseFail: 0, errors: 0 });
    const good = JUDGE_CASES.filter((item) => item.expected).length;
    const bad = JUDGE_CASES.length - good;
    assert.ok(good >= 4 && bad >= 4, `хороших ${good}, плохих ${bad}`);
    assert.equal(new Set(JUDGE_CASES.map((item) => item.id)).size, JUDGE_CASES.length);
    assert.deepEqual(
      COMMIT_RUBRIC.criteria.map((criterion) => criterion.id),
      ['accurate', 'main-change', 'why'],
    );
  });
});

describe('Шаг 5 / Step 5. Отчёт калибровки', () => {
  it('formatAgreement: вердикты словами и две ошибки судьи', () => {
    const report: EvalReport<boolean> = {
      total: 4,
      passed: 2,
      errors: 1,
      accuracy: 0.5,
      results: [
        { id: 'good', expected: true, actual: true, ok: true },
        { id: 'rounding', expected: false, actual: true, ok: false },
        { id: 'short', expected: true, actual: false, ok: false },
        { id: 'quota', expected: true, error: 'LLM API ответил 429\n<html>…</html>', ok: false },
      ],
    };
    assert.equal(
      formatAgreement('С рубрикой', report),
      [
        'С рубрикой: 2/4 (50%)',
        '  ✖ rounding: ожидали плохо, получили хорошо',
        '  ✖ short: ожидали хорошо, получили плохо',
        '  ✖ quota: ошибка — LLM API ответил 429',
        '  пропустил плохих: 1 · завернул хороших: 1',
      ].join('\n'),
    );
  });

  it('всё совпало — только итог', () => {
    const report: EvalReport<boolean> = { total: 1, passed: 1, errors: 0, accuracy: 1, results: [{ id: 'a', expected: false, actual: false, ok: true }] };
    assert.equal(formatAgreement('Судья', report), 'Судья: 1/1 (100%)\n  пропустил плохих: 0 · завернул хороших: 0');
  });
});
