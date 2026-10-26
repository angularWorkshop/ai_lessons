// Вызовы инструментов в стриме приходят по кусочкам. Этот буфер собирает их обратно в целые ToolCall.
import type { ToolCall } from './llm.ts';

/**
 * Кусочек вызова из delta.tool_calls.
 * index — номер вызова в ответе: по нему кусочки разных вызовов не путаются.
 * id, type и name приходят один раз, в первом кусочке вызова. arguments — по частям, их надо склеить.
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

// Шаг 1
export class ToolCallBuffer {
  readonly #calls = new Map<number, ToolCall>();

  /** Добавить кусочки из одного чанка. */
  push(deltas: ToolCallDelta[]): void {
    throw new Error('TODO: шаг 1 — разложи кусочки по index: id и имя из первого, arguments склей');
  }

  /** Собранные вызовы по порядку index. Копии: буфер можно продолжать наполнять. */
  calls(): ToolCall[] {
    throw new Error('TODO: шаг 1 — верни собранные вызовы по порядку index');
  }
}
