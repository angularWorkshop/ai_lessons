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
  throw new Error('TODO: шаг 2');
}

// Шаг 2: файл прочитан снова, хотя его никто не менял. Каждое такое чтение — лишний контекст на всех следующих шагах.
function findRereads(trace: TraceEvent[]): Finding[] {
  throw new Error('TODO: шаг 2');
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
  throw new Error('TODO: шаг 2');
}

// Шаг 2: все находки одного прогона. Порядок — от самых серьёзных к расходам.
export function diagnose(run: TaskRun): Finding[] {
  throw new Error('TODO: шаг 2');
}
