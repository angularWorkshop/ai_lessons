// Eval агента поддержки: прогнать набор вопросов, оценить каждый ответ по правилам, свести в отчёт.
import { estimateCost, PRICE, type Price, type Usage } from './llm.ts';
import type { SupportResult } from './support-agent.ts';

export type Outcome = 'answer' | 'refuse' | 'ticket';

export interface EvalCase {
  id: string;
  question: string;
  /** answer — ответить по базе, refuse — честно отказать, ticket — передать специалисту. */
  expect: Outcome;
  /** answer: ссылка хотя бы на одну из этих статей обязательна — факт бывает в двух статьях. */
  sources?: string[];
  /** answer: факты, которые должны быть в ответе. Пробелы и регистр не важны. */
  mustInclude?: string[];
  /** ticket: какой приоритет должен быть у обращения. */
  priority?: 'normal' | 'urgent';
}

export interface CaseCheck {
  id: string;
  expect: Outcome;
  /** Что сделал агент. error — упал провайдер или сам прогон. */
  got: Outcome | 'error';
  /** Всё, что не так. Пусто — кейс пройден. */
  problems: string[];
  pass: boolean;
  sources: string[];
  /** Источники, которых нет в ожидаемых. Не провал, но повод посмотреть. */
  extraSources: string[];
  steps: number;
  usage: Usage;
  /** Что увидел клиент и что написала модель до проверок harness — для разбора провалов. */
  answer: string;
  draft: string;
}

export interface Rate {
  passed: number;
  total: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  /** Кейсы answer: ответ верный целиком. */
  answers: Rate;
  /** Кейсы answer: в sources есть нужная статья. */
  sources: Rate;
  /** Кейсы ticket: обращение заведено с нужным приоритетом. */
  escalations: Rate;
  /** Кейсы refuse: агент не ответил и не завёл обращение. */
  refusals: Rate;
  /** Обращения там, где их не ждали: каждое — работа живого человека впустую. */
  falseTickets: number;
  errors: number;
  usage: Usage;
  cost: number;
  avgSteps: number;
}

// Шаг 1: что сделал агент, по тем же правилам, что видит клиент.
export function outcomeOf(result: SupportResult): Outcome | 'error' {
  if (result.stopReason === 'error') return 'error';
  if (result.ticket) return 'ticket';
  return result.sources.length > 0 ? 'answer' : 'refuse';
}

// «2 990 ₽» и «2990₽», «PDF» и «pdf» — одно и то же.
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '');

// Шаг 1
export function scoreCase(item: EvalCase, result: SupportResult): CaseCheck {
  const got = outcomeOf(result);
  const problems: string[] = [];
  if (got !== item.expect) {
    problems.push(`ждали ${item.expect}, получили ${got}`);
  }
  if (item.expect === 'answer' && got === 'answer') {
    const expected = item.sources ?? [];
    if (expected.length > 0 && !expected.some((source) => result.sources.includes(source))) {
      problems.push(`нет источника ${expected.join(' или ')}`);
    }
    const answer = normalize(result.answer);
    const absent = (item.mustInclude ?? []).filter((fact) => !answer.includes(normalize(fact)));
    if (absent.length > 0) problems.push(`в ответе нет «${absent.join('», «')}»`);
  }
  if (item.expect === 'ticket' && result.ticket && item.priority && result.ticket.priority !== item.priority) {
    problems.push(`приоритет ${result.ticket.priority}, ждали ${item.priority}`);
  }
  return {
    id: item.id,
    expect: item.expect,
    got,
    problems,
    pass: problems.length === 0,
    sources: result.sources,
    extraSources: result.sources.filter((source) => !(item.sources ?? []).includes(source)),
    steps: result.steps,
    usage: result.usage,
    answer: result.answer,
    draft: result.draft,
  };
}

// Шаг 2
export async function runEval(
  cases: EvalCase[],
  ask: (question: string) => Promise<SupportResult>,
  onCase?: (check: CaseCheck) => void,
): Promise<CaseCheck[]> {
  const checks: CaseCheck[] = [];
  // По одному: у шлюза 30 запросов в минуту, а порядок в отчёте должен совпадать с набором.
  for (const item of cases) {
    let check: CaseCheck;
    try {
      check = scoreCase(item, await ask(item.question));
    } catch (error) {
      // Один упавший кейс не роняет весь прогон.
      const message = error instanceof Error ? error.message : String(error);
      check = {
        id: item.id,
        expect: item.expect,
        got: 'error',
        problems: [message],
        pass: false,
        sources: [],
        extraSources: [],
        steps: 0,
        usage: { input: 0, output: 0 },
        answer: '',
        draft: '',
      };
    }
    checks.push(check);
    onCase?.(check);
  }
  return checks;
}

// Шаг 3
export function summarize(checks: CaseCheck[], price: Price = PRICE): EvalSummary {
  const rate = (list: CaseCheck[], ok: (check: CaseCheck) => boolean): Rate => ({ passed: list.filter(ok).length, total: list.length });
  const byExpect = (outcome: Outcome) => checks.filter((check) => check.expect === outcome);
  const answers = byExpect('answer');
  const usage = checks.reduce((sum, check) => ({ input: sum.input + check.usage.input, output: sum.output + check.usage.output }), { input: 0, output: 0 });
  return {
    total: checks.length,
    passed: checks.filter((check) => check.pass).length,
    answers: rate(answers, (check) => check.pass),
    sources: rate(answers, (check) => check.got === 'answer' && !check.problems.some((problem) => problem.startsWith('нет источника'))),
    escalations: rate(byExpect('ticket'), (check) => check.pass),
    refusals: rate(byExpect('refuse'), (check) => check.pass),
    falseTickets: checks.filter((check) => check.got === 'ticket' && check.expect !== 'ticket').length,
    errors: checks.filter((check) => check.got === 'error').length,
    usage,
    cost: estimateCost(usage, price),
    avgSteps: checks.length === 0 ? 0 : checks.reduce((sum, check) => sum + check.steps, 0) / checks.length,
  };
}

// Шаг 3: что починилось и что сломалось между двумя прогонами. Только кейсы, которые есть в обоих.
export function compareRuns(before: CaseCheck[], after: CaseCheck[]): { fixed: string[]; broken: string[] } {
  const was = new Map(before.map((check) => [check.id, check.pass]));
  const common = after.filter((check) => was.has(check.id));
  return {
    fixed: common.filter((check) => check.pass && !was.get(check.id)).map((check) => check.id),
    broken: common.filter((check) => !check.pass && was.get(check.id)).map((check) => check.id),
  };
}

export function formatSummary(summary: EvalSummary): string {
  const show = (rate: Rate) => `${rate.passed}/${rate.total}`;
  const percent = summary.total === 0 ? 0 : Math.round((summary.passed / summary.total) * 100);
  return [
    `Верно: ${summary.passed}/${summary.total} (${percent}%)`,
    `  ответы по базе ${show(summary.answers)} · ссылки ${show(summary.sources)} · эскалации ${show(summary.escalations)} · честные отказы ${show(summary.refusals)}`,
    `  лишние обращения ${summary.falseTickets} · ошибки ${summary.errors}`,
    `  шагов в среднем ${summary.avgSteps.toFixed(1)} · вход ${summary.usage.input} · выход ${summary.usage.output} · $${summary.cost.toFixed(5)} · $${(summary.cost / Math.max(summary.total, 1)).toFixed(6)} за вопрос`,
  ].join('\n');
}
