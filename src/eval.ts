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
  const results: CaseResult<O>[] = [];

  // По одному: лимит шлюза — 30 запросов в минуту, а порядок в отчёте должен совпадать с набором.
  for (const item of cases) {
    try {
      const actual = await run(item.input);
      results.push({ id: item.id, expected: item.expected, actual, ok: isCorrect(actual, item.expected) });
    } catch (error) {
      // Шаг 3: один упавший кейс не должен ронять весь прогон.
      results.push({ id: item.id, expected: item.expected, error: (error as Error).message, ok: false });
    }
  }

  const passed = results.filter((result) => result.ok).length;
  return {
    total: results.length,
    passed,
    errors: results.filter((result) => result.error !== undefined).length,
    accuracy: results.length === 0 ? 0 : passed / results.length,
    results,
  };
}

// Шаг 4: пример, который попал и в промпт, и в проверку, проверяет память, а не промпт.
export function findLeaks(examples: { input: string }[], cases: EvalCase<string, unknown>[]): string[] {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const seen = new Set(examples.map((example) => normalize(example.input)));
  return cases.filter((item) => seen.has(normalize(item.input))).map((item) => item.id);
}

// Шаг 5: отчёт, который читает человек. Верные кейсы не печатаем — смотреть нужно на ошибки.
export function formatReport(title: string, report: EvalReport<unknown>): string {
  const percent = Math.round(report.accuracy * 100);
  const lines = [`${title}: ${report.passed}/${report.total} (${percent}%)`];
  for (const result of report.results) {
    if (result.ok) {
      continue;
    }
    if (result.error !== undefined) {
      lines.push(`  ✖ ${result.id}: ошибка — ${result.error}`);
    } else {
      lines.push(`  ✖ ${result.id}: ожидали ${String(result.expected)}, получили ${String(result.actual)}`);
    }
  }
  return lines.join('\n');
}
