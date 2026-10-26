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
    for (const delta of deltas) {
      let call = this.#calls.get(delta.index);
      if (!call) {
        call = { id: '', name: '', arguments: '' };
        this.#calls.set(delta.index, call);
      }
      // id и имя приходят один раз. Если провайдер повторит их в следующих кусочках, первое значение остаётся.
      if (delta.id && !call.id) {
        call.id = delta.id;
      }
      if (delta.function?.name && !call.name) {
        call.name = delta.function.name;
      }
      // Аргументы — строка JSON, нарезанная где попало: «{"timezone": » + «"Europe/Mos» + «cow"}».
      call.arguments += delta.function?.arguments ?? '';
    }
  }

  /** Собранные вызовы по порядку index. Копии: буфер можно продолжать наполнять. */
  calls(): ToolCall[] {
    return [...this.#calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => ({ ...call }));
  }
}
