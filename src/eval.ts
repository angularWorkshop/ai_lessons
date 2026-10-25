// Маленький eval: прогнать набор кейсов, сравнить с ожидаемым, посчитать долю верных.

export interface EvalCase<I, O> {
  id: string;
  input: I;
  expected: O;
}

export interface CaseResult<O> {
  id: string;
  expected: O;
  /** Что вернула программа. Нет, если запрос упал. */
  actual?: O;
  /** Текст ошибки, если запрос упал. */
  error?: string;
  ok: boolean;
}

export interface EvalReport<O> {
  total: number;
  passed: number;
  /** Сколько кейсов упало с ошибкой, а не ответило неверно. */
  errors: number;
  /** passed / total, от 0 до 1. */
  accuracy: number;
  results: CaseResult<O>[];
}

// Шаги 2–3
export async function runEval<I, O>(
  cases: EvalCase<I, O>[],
  run: (input: I) => Promise<O>,
  isCorrect: (actual: O, expected: O) => boolean = (actual, expected) => actual === expected,
): Promise<EvalReport<O>> {
  throw new Error('TODO: шаг 2');
}

// Шаг 4: пример, который попал и в промпт, и в проверку, проверяет память, а не промпт.
export function findLeaks(examples: { input: string }[], cases: EvalCase<string, unknown>[]): string[] {
  throw new Error('TODO: шаг 4');
}

// Шаг 5: отчёт, который читает человек. Верные кейсы не печатаем — смотреть нужно на ошибки.
export function formatReport(title: string, report: EvalReport<unknown>): string {
  throw new Error('TODO: шаг 5');
}
