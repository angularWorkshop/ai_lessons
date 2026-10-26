// Тема 15.3: eval агента поддержки — оценка ответа, прогон набора, сводка с ценой, сравнение прогонов.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareRuns, runEval, scoreCase, summarize, type CaseCheck, type EvalCase } from '../src/eval.ts';
import { createSupportAgent, type SupportResult } from '../src/support-agent.ts';
import { freshData } from './support/data.ts';
import { ScriptedProvider, textReply, toolReply } from './support/scripted.ts';

const REFUND: EvalCase = {
  id: 'refund',
  question: 'Можно вернуть деньги?',
  expect: 'answer',
  sources: ['billing/refund.md'],
  mustInclude: ['14', '5–10 рабочих'],
};
const HACKED: EvalCase = { id: 'hacked', question: 'Меня взломали', expect: 'ticket', priority: 'urgent' };
const WEATHER: EvalCase = { id: 'weather', question: 'Погода?', expect: 'refuse' };

function result(extra: Partial<SupportResult> = {}): SupportResult {
  return { answer: '', draft: '', sources: [], stopReason: 'done', steps: 3, usage: { input: 1000, output: 100 }, ...extra };
}

const ticket = (priority: 'normal' | 'urgent') => ({
  id: 'T-1043',
  status: 'open' as const,
  priority,
  summary: 'Взлом аккаунта',
  question: 'Меня взломали',
  createdAt: new Date().toISOString(),
});

describe('Шаг 1 / Step 1. scoreCase: оценка одного ответа', () => {
  it('верный ответ: источник есть, факты есть — пробелы и регистр не важны', () => {
    const check = scoreCase(REFUND, result({ answer: 'Да, в течение 14 дней. Деньги придут за 5–10  РАБОЧИХ дней.', sources: ['billing/refund.md'] }));
    assert.equal(check.got, 'answer');
    assert.deepEqual(check.problems, []);
    assert.equal(check.pass, true);
  });

  it('факта нет в ответе — провал с понятной причиной', () => {
    const check = scoreCase(REFUND, result({ answer: 'Да, можно вернуть.', sources: ['billing/refund.md'] }));
    assert.equal(check.pass, false);
    assert.match(check.problems.join('\n'), /14/);
  });

  it('нужный источник — хотя бы один из списка; чужие источники — в extraSources', () => {
    const either: EvalCase = { ...REFUND, sources: ['billing/refund.md', 'billing/plans.md'], mustInclude: [] };
    const ok = scoreCase(either, result({ answer: 'Да', sources: ['billing/plans.md', 'billing/cancel.md'] }));
    assert.equal(ok.pass, true);
    assert.deepEqual(ok.extraSources, ['billing/cancel.md']);

    const wrong = scoreCase(REFUND, result({ answer: 'Да, 14 дней, 5–10 рабочих', sources: ['billing/cancel.md'] }));
    assert.equal(wrong.pass, false);
    assert.match(wrong.problems.join('\n'), /refund\.md/);
  });

  it('что сделал агент: ticket, answer, refuse или error', () => {
    assert.equal(scoreCase(HACKED, result({ ticket: ticket('urgent'), sources: ['account/password.md'] })).got, 'ticket');
    assert.equal(scoreCase(WEATHER, result({ answer: 'В базе нет ответа' })).got, 'refuse');
    assert.equal(scoreCase(WEATHER, result({ stopReason: 'error', answer: 'Не получилось ответить: 502' })).got, 'error');
  });

  it('ждали отказ, а агент ответил или завёл обращение — провал', () => {
    assert.equal(scoreCase(WEATHER, result({ answer: 'Завтра +5 [sync/offline.md]', sources: ['sync/offline.md'] })).pass, false);
    assert.equal(scoreCase(WEATHER, result({ ticket: ticket('normal') })).pass, false);
    assert.equal(scoreCase(WEATHER, result({ answer: 'В базе нет ответа' })).pass, true);
  });

  it('обращение с не тем приоритетом — провал', () => {
    assert.equal(scoreCase(HACKED, result({ ticket: ticket('urgent') })).pass, true);
    const check = scoreCase(HACKED, result({ ticket: ticket('normal') }));
    assert.equal(check.pass, false);
    assert.match(check.problems.join('\n'), /urgent/);
  });
});

describe('Шаг 2 / Step 2. runEval: прогон набора', () => {
  it('прогоняет кейсы по порядку и сохраняет ответ и черновик модели для разбора', async () => {
    const asked: string[] = [];
    const checks = await runEval([REFUND, WEATHER], async (question) => {
      asked.push(question);
      return question === REFUND.question
        ? result({ answer: 'Да, 14 дней, 5–10 рабочих', draft: 'черновик', sources: ['billing/refund.md'] })
        : result({ answer: 'Нет ответа', draft: 'Завтра солнечно' });
    });
    assert.deepEqual(asked, [REFUND.question, WEATHER.question]);
    assert.deepEqual(checks.map((check) => [check.id, check.pass]), [['refund', true], ['weather', true]]);
    assert.equal(checks[1].draft, 'Завтра солнечно');
  });

  it('упавший кейс не роняет прогон: got = error, остальные идут дальше', async () => {
    const seen: string[] = [];
    const checks = await runEval(
      [HACKED, WEATHER],
      async (question) => {
        if (question === HACKED.question) throw new Error('сеть упала');
        return result({ answer: 'Нет ответа' });
      },
      (check) => seen.push(check.id),
    );
    assert.equal(checks[0].got, 'error');
    assert.equal(checks[0].pass, false);
    assert.match(checks[0].problems.join('\n'), /сеть упала/);
    assert.equal(checks[1].pass, true);
    assert.deepEqual(seen, ['hacked', 'weather'], 'onCase вызывается на каждый кейс по мере готовности');
  });

  it('работает с настоящим агентом на заготовленной модели', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'search_kb', args: { query: 'возврат' } }]),
      toolReply([{ name: 'read_article', args: { path: 'billing/refund.md' } }]),
      textReply('Да, в течение 14 дней [billing/refund.md]. Деньги придут за 5–10 рабочих дней [billing/refund.md].'),
    ]);
    const agent = createSupportAgent({ provider, dataDir: freshData() });
    const [check] = await runEval([REFUND], (question) => agent.run(question));
    assert.equal(check.pass, true, check.problems.join('; '));
    assert.equal(check.steps, 3);
  });
});

describe('Шаг 3 / Step 3. Сводка, цена и сравнение прогонов', () => {
  const check = (id: string, expect: CaseCheck['expect'], got: CaseCheck['got'], pass: boolean, extra: Partial<CaseCheck> = {}): CaseCheck => ({
    id,
    expect,
    got,
    pass,
    problems: pass ? [] : ['что-то не так'],
    sources: [],
    extraSources: [],
    steps: 2,
    usage: { input: 1_000_000, output: 100_000 },
    answer: '',
    draft: '',
    ...extra,
  });

  it('доли по видам кейсов, лишние обращения, ошибки', () => {
    const summary = summarize([
      check('a1', 'answer', 'answer', true),
      check('a2', 'answer', 'answer', false, { problems: ['в ответе нет «14»'] }),
      check('a3', 'answer', 'refuse', false),
      check('r1', 'refuse', 'ticket', false),
      check('t1', 'ticket', 'ticket', true),
      check('t2', 'ticket', 'error', false),
    ]);
    assert.equal(summary.total, 6);
    assert.equal(summary.passed, 2);
    assert.deepEqual(summary.answers, { passed: 1, total: 3 });
    assert.deepEqual(summary.sources, { passed: 2, total: 3 }, 'ссылки верны у a1 и a2: у a2 не хватает факта, а не источника');
    assert.deepEqual(summary.escalations, { passed: 1, total: 2 });
    assert.deepEqual(summary.refusals, { passed: 0, total: 1 });
    assert.equal(summary.falseTickets, 1);
    assert.equal(summary.errors, 1);
  });

  it('токены, цена и шаги: вход и выход по своей цене', () => {
    const summary = summarize([check('a', 'answer', 'answer', true, { steps: 3 }), check('b', 'refuse', 'refuse', true, { steps: 1 })], {
      inputPerMillion: 0.03,
      outputPerMillion: 0.13,
    });
    assert.deepEqual(summary.usage, { input: 2_000_000, output: 200_000 });
    assert.ok(Math.abs(summary.cost - (2 * 0.03 + 0.2 * 0.13)) < 1e-9, `цена ${summary.cost}`);
    assert.equal(summary.avgSteps, 2);
  });

  it('compareRuns: что починилось и что сломалось; новые кейсы не считаются', () => {
    const before = [check('a', 'answer', 'refuse', false), check('b', 'answer', 'answer', true), check('c', 'refuse', 'refuse', true)];
    const after = [check('a', 'answer', 'answer', true), check('b', 'answer', 'refuse', false), check('c', 'refuse', 'refuse', true), check('d', 'answer', 'refuse', false)];
    assert.deepEqual(compareRuns(before, after), { fixed: ['a'], broken: ['b'] });
  });
});

describe('Шаг 4 / Step 4. Итерация: сначала база, потом ответ', () => {
  it('первый запрос требует вызова инструмента — ответить «из головы» нельзя; дальше модель решает сама', async () => {
    const provider = new ScriptedProvider([toolReply([{ name: 'search_kb', args: { query: 'погода' } }]), textReply('Нет ответа.')]);
    await createSupportAgent({ provider, dataDir: freshData() }).run('Какая погода завтра?');
    assert.equal(provider.requests[0].options.toolChoice, 'required');
    assert.equal(provider.requests[1].options.toolChoice ?? 'auto', 'auto');

    // Если шаг всего один, он же последний: toolChoice none важнее.
    const single = new ScriptedProvider([textReply('Нет ответа.')]);
    await createSupportAgent({ provider: single, dataDir: freshData(), maxSteps: 1 }).run('Вопрос');
    assert.equal(single.requests[0].options.toolChoice, 'none');
  });
});
