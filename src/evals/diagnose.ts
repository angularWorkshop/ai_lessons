// Типичные провалы агента, найденные по трейсу: зацикливание, лишние чтения, ошибки инструментов,
// обрезка, лимиты и правки без проверки. Это подсказка, куда смотреть, а не приговор.
import type { TaskRun } from './runner.ts';
import { describeCall, parseArgs, toolResults, type TraceEvent } from './trace.ts';

export type FindingKind = 'loop' | 'limit' | 'tool_error' | 'truncated' | 'reread' | 'unverified';

export interface Finding {
  kind: FindingKind;
  /** Сколько раз это случилось в прогоне: лишних чтений, ошибок, повторов. */
  count: number;
  detail: string;
}

export const FINDING_LABELS: Record<FindingKind, string> = {
  loop: 'зацикливание',
  limit: 'лимит',
  tool_error: 'ошибки инструментов',
  truncated: 'обрезка',
  reread: 'лишние чтения',
  unverified: 'правки без проверки',
};

/** Столько одинаковых вызовов с одинаковым результатом — уже круг, а не работа. */
export const LOOP_REPEATS = 3;

/** Метки обрезки из наших инструментов: Toolbox (тема 3.2), run_command (5.3), read_file (5.1). */
const TRUNCATION_MARKS = ['…[обрезано', '…[пропущено', '…[строка обрезана]'];

const firstLine = (text: string) => text.split('\n')[0].slice(0, 120);

// Шаг 2: один и тот же вызов с тем же результатом раз за разом. Модель не узнаёт ничего нового.
function findLoops(trace: TraceEvent[]): Finding[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const result of toolResults(trace)) {
    const key = `${result.name} ${JSON.stringify(parseArgs(result.args))}\n${result.content}`;
    const entry = seen.get(key) ?? { label: describeCall(result.name, result.args), count: 0 };
    entry.count++;
    seen.set(key, entry);
  }
  return [...seen.values()]
    .filter((entry) => entry.count >= LOOP_REPEATS)
    .map((entry) => ({ kind: 'loop', count: entry.count, detail: `${entry.label} ×${entry.count} с одинаковым результатом` }));
}

// Шаг 2: файл прочитан снова, хотя его никто не менял. Каждое такое чтение — лишний контекст на всех следующих шагах.
function findRereads(trace: TraceEvent[]): Finding[] {
  const fresh = new Set<string>(); // прочитаны и с тех пор не менялись
  const extra = new Map<string, number>();
  for (const result of toolResults(trace)) {
    const path = parseArgs(result.args).path;
    if (typeof path !== 'string' || result.isError) continue;
    if (result.name === 'edit_file') {
      fresh.delete(path);
    } else if (result.name === 'read_file') {
      if (fresh.has(path)) extra.set(path, (extra.get(path) ?? 0) + 1);
      fresh.add(path);
    }
  }
  const total = [...extra.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const files = [...extra].map(([path, count]) => `${path} ×${count}`).join(', ');
  return [{ kind: 'reread', count: total, detail: `перечитаны без правок: ${files}` }];
}

// Шаг 2: ошибки инструментов, по инструменту. Первая строка первой ошибки — обычно уже ответ на «почему».
function findToolErrors(trace: TraceEvent[]): Finding[] {
  const byTool = new Map<string, string[]>();
  for (const result of toolResults(trace)) {
    if (result.isError) byTool.set(result.name, [...(byTool.get(result.name) ?? []), result.content]);
  }
  return [...byTool].map(([tool, errors]) => ({
    kind: 'tool_error',
    count: errors.length,
    detail: `${tool} ×${errors.length}: ${firstLine(errors[0])}`,
  }));
}

// Шаг 2: модель увидела не весь вывод. Если упавший тест был в пропущенной середине, она чинила вслепую.
function findTruncation(trace: TraceEvent[]): Finding[] {
  const cut = toolResults(trace).filter(
    (result) => result.chars > result.content.length || TRUNCATION_MARKS.some((mark) => result.content.includes(mark)),
  );
  if (cut.length === 0) return [];
  const calls = [...new Set(cut.map((result) => describeCall(result.name, result.args)))].join(', ');
  return [{ kind: 'truncated', count: cut.length, detail: `вывод обрезан: ${calls}` }];
}

// Шаг 2: последняя удачная правка — и после неё ни одного запуска тестов.
function findUnverified(trace: TraceEvent[]): Finding[] {
  const results = toolResults(trace);
  let lastEdit = -1;
  results.forEach((result, index) => {
    if (result.name === 'edit_file' && !result.isError) lastEdit = index;
  });
  if (lastEdit === -1) return [];
  const checked = results.slice(lastEdit + 1).some((result) => result.name === 'run_command' && !result.isError);
  return checked ? [] : [{ kind: 'unverified', count: 1, detail: 'после последней правки тесты не запускались' }];
}

// Шаг 2: все находки одного прогона. Порядок — от самых серьёзных к расходам.
export function diagnose(run: TaskRun): Finding[] {
  const trace = run.trace ?? [];
  const findings: Finding[] = [];
  if (run.stopReason === 'repeated_call') {
    findings.push({ kind: 'loop', count: 1, detail: 'агент остановлен: один и тот же вызов несколько раз подряд' });
  }
  findings.push(...findLoops(trace));
  if (run.stopReason === 'max_steps' || run.stopReason === 'budget') {
    findings.push({ kind: 'limit', count: 1, detail: `остановлен по ${run.stopReason}` });
  }
  if (run.stopReason === 'truncated') {
    findings.push({ kind: 'truncated', count: 1, detail: 'ответ модели обрезан по max_tokens' });
  }
  findings.push(...findToolErrors(trace), ...findTruncation(trace), ...findRereads(trace), ...findUnverified(trace));
  return findings;
}
