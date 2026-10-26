// Субагент как инструмент: task(description, prompt) запускает дочернего Agent с чистой историей.
// Ребёнок видит только свой system и prompt, работает своими инструментами в своих лимитах,
// а родителю возвращает одну строку — итоговый ответ. Всё, что ребёнок прочитал по дороге, остаётся у него.
import { z } from 'zod';
import { Agent, type AgentEvent, type AgentLimits, type AgentRun } from '../agent.ts';
import type { Provider } from '../provider.ts';
import type { Tool, Toolbox } from '../tools.ts';

export const TASK_TOOL = 'task';

// Шаг 1: аргументы. description — для человека в терминале, prompt — всё, что узнает ребёнок.
export const TaskArgs = z.object({
  description: z.string().min(1).max(60).describe('Короткое имя подзадачи, 2–5 слов: «Ревью src/math.ts». Его видит человек'),
  prompt: z
    .string()
    .min(1)
    .describe('Полное задание для субагента. Он не видит ни задачу пользователя, ни твою историю — только этот текст. Напиши, что сделать и в каком виде вернуть ответ'),
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
  switch (run.stopReason) {
    case 'done':
      return run.answer || 'Субагент закончил, но ничего не ответил.';
    case 'aborted':
      throw new Error('субагент остановлен');
    case 'error':
      throw new Error(`субагент не получил ответа от модели: ${run.answer}`);
    default:
      return `[Субагент остановлен: ${run.stopReason}. Задача может быть сделана не полностью.]\n${run.answer}`;
  }
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
      const child = new Agent({
        provider,
        toolbox,
        system,
        limits,
        // Шаг 4: Ctrl+C у родителя останавливает и ребёнка.
        signal: ctx.signal,
        onEvent: onEvent && ((event) => onEvent(event, description)),
      });
      const run = await child.run(prompt);
      onRun?.(run, description);
      return subagentResult(run);
    },
  };
}
