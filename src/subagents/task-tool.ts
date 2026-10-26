// Субагент как инструмент: task(description, prompt) запускает дочернего Agent с чистой историей.
// Ребёнок видит только свой system и prompt, работает своими инструментами в своих лимитах,
// а родителю возвращает одну строку — итоговый ответ. Всё, что ребёнок прочитал по дороге, остаётся у него.
import { z } from 'zod';
import { Agent, type AgentEvent, type AgentLimits, type AgentRun } from '../agent.ts';
import type { Provider } from '../provider.ts';
import type { Tool, Toolbox } from '../tools.ts';

export const TASK_TOOL = 'task';

// Шаг 1: аргументы. description — для человека в терминале, prompt — всё, что узнает ребёнок.
// TODO: шаг 1 — обе строки непустые, description не длиннее 60 символов, у обоих полей .describe() для модели.
export const TaskArgs = z.object({
  description: z.string(),
  prompt: z.string(),
});

export type TaskInput = z.infer<typeof TaskArgs>;

export interface SubagentOptions {
  /** Модель ребёнка. Обычно та же, что у родителя, в тестах — свой ScriptedProvider. */
  provider: Provider;
  /** Инструменты ребёнка. task среди них не нужен: иначе ребёнок начнёт плодить своих детей. */
  toolbox: Toolbox;
  system: string;
  /** Лимиты одного ребёнка. Не заданы — DEFAULT_SUBAGENT_LIMITS. */
  limits?: AgentLimits;
  /** События ребёнка вместе с именем подзадачи: так их можно отличить в терминале. */
  onEvent?: (event: AgentEvent, description: string) => void;
  /** Итог каждого ребёнка: токены для учёта, причина остановки для логов. */
  onRun?: (run: AgentRun, description: string) => void;
}

/** Ребёнку хватает меньшего, чем родителю: одна узкая задача. */
export const DEFAULT_SUBAGENT_LIMITS: AgentLimits = { maxSteps: 10 };

// Шаг 3: что вернуть родителю. Обычный конец — только ответ. Лимит — ответ с пометкой.
// Ошибка и отмена — исключение: Toolbox превратит его в результат с isError.
export function subagentResult(run: AgentRun): string {
  throw new Error('TODO: шаг 3');
}

// Шаг 2: инструмент. Новый Agent на каждый вызов, история с нуля, сигнал — от родителя.
export function taskTool(options: SubagentOptions): Tool<TaskInput> {
  const { provider, toolbox, system, limits = DEFAULT_SUBAGENT_LIMITS, onEvent, onRun } = options;
  return {
    name: TASK_TOOL,
    description:
      'Запускает субагента с чистым контекстом для отдельной подзадачи и возвращает только его итоговый ответ. ' +
      'Отдавай ему то, что требует много чтения, а тебе нужен только вывод.',
    schema: TaskArgs,
    async run({ description, prompt }, ctx) {
      throw new Error('TODO: шаги 2 и 4');
    },
  };
}
