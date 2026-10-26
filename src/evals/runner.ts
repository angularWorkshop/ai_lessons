// Прогон агента на задачах набора: копия проекта → агент → проверка → метрики.
import type { Agent, AgentEvent, StopReason } from '../agent.ts';
import { PRICE } from '../commands.ts';
import { estimateCost, type Price, type Usage } from '../llm.ts';
import type { CheckResult } from './checks.ts';
import type { EvalTask } from './tasks.ts';
import { prepareWorkdir } from './workspace.ts';

/** Как собрать агента для одной задачи: корень — рабочая копия, onEvent — от раннера. */
export type AgentFactory = (dir: string, onEvent: (event: AgentEvent) => void) => Agent;

/** Один прогон одной задачи. */
export interface TaskRun {
  task: string;
  /** Номер прогона этой задачи, с 1. */
  attempt: number;
  /** Проверка прошла. */
  pass: boolean;
  /** Что сказала проверка. */
  detail: string;
  /** Агент не смог работать: сеть, ключ, квота. Такой прогон не решён и не провален — он не проверен. */
  error?: string;
  stopReason: StopReason;
  steps: number;
  usage: Usage;
  /** Цена в долларах. */
  cost: number;
  /** Сколько работал агент, мс. Проверка сюда не входит. */
  ms: number;
  /** Рабочая копия, если её оставили для разбора (keep). */
  dir?: string;
}

export interface RunTaskOptions {
  attempt?: number;
  price?: Price;
  /** События агента: прогресс в терминале, трейс. */
  onEvent?: (event: AgentEvent) => void;
  /** Не удалять рабочую копию: посмотреть глазами, что сделал агент. */
  keep?: boolean;
  /** Часы для замера времени. Тесты подставляют свои. */
  clock?: () => number;
}

/** Первая строка ошибки, не длиннее 200 символов: ошибка шлюза бывает целой HTML-страницей. */
export function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

// Шаг 3: один прогон. Проверяем файлы, а не ответ: агент мог написать «готово» и ничего не сделать.
export async function runTask(task: EvalTask, makeAgent: AgentFactory, options: RunTaskOptions = {}): Promise<TaskRun> {
  throw new Error('TODO: шаг 3');
}

export interface SuiteOptions extends Omit<RunTaskOptions, 'attempt'> {
  /** Сколько раз прогнать каждую задачу. */
  runs?: number;
  /** Прогон закончился — например, напечатать строку. */
  onRun?: (run: TaskRun) => void;
}

// Шаг 4: весь набор, по одному прогону за раз — у шлюза лимит запросов в минуту.
export async function runSuite(tasks: EvalTask[], makeAgent: AgentFactory, options: SuiteOptions = {}): Promise<TaskRun[]> {
  throw new Error('TODO: шаг 4');
}
