// Eval агента поддержки: прогнать набор вопросов, оценить каждый ответ по правилам, свести в отчёт.
import { PRICE, type Price, type Usage } from './llm.ts';
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

// Шаг 1
export function scoreCase(item: EvalCase, result: SupportResult): CaseCheck {
  throw new Error('TODO: шаг 1');
}

// Шаг 2
export async function runEval(
  cases: EvalCase[],
  ask: (question: string) => Promise<SupportResult>,
  onCase?: (check: CaseCheck) => void,
): Promise<CaseCheck[]> {
  throw new Error('TODO: шаг 2');
}

// Шаг 3
export function summarize(checks: CaseCheck[], price: Price = PRICE): EvalSummary {
  throw new Error('TODO: шаг 3');
}

// Шаг 3: что починилось и что сломалось между двумя прогонами. Только кейсы, которые есть в обоих.
export function compareRuns(before: CaseCheck[], after: CaseCheck[]): { fixed: string[]; broken: string[] } {
  throw new Error('TODO: шаг 3');
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
