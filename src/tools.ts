// Инструменты: интерфейс Tool и реестр Toolbox — как в темах 3.2–3.3, без лишнего.
// Главное правило: execute не бросает. Любая беда — текст для модели, и цикл идёт дальше.
import { z } from 'zod';
import type { ToolCall, ToolSpec } from './llm.ts';

export interface Tool<A = any> {
  name: string;
  /** Когда и зачем звать инструмент. Это текст для модели. */
  description: string;
  schema: z.ZodType<A>;
  run(args: A): Promise<string>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

/** Длиннее — обрезаем: статья базы знаний столько не весит, а ошибка в инструменте может. */
export const MAX_RESULT_CHARS = 8000;

export class Toolbox {
  readonly #tools = new Map<string, Tool>();

  constructor(tools: Tool[] = []) {
    tools.forEach((tool) => this.#tools.set(tool.name, tool));
  }

  specs(): ToolSpec[] {
    return [...this.#tools.values()].map((tool) => {
      // io: 'input' — поле с .default() для модели необязательно. $schema ей не нужен.
      const { $schema, ...parameters } = z.toJSONSchema(tool.schema, { io: 'input' });
      return { type: 'function', function: { name: tool.name, description: tool.description, parameters } };
    });
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.#tools.get(call.name);
    if (!tool) {
      return failure(`инструмента ${call.name} нет. Доступные инструменты: ${[...this.#tools.keys()].join(', ')}.`);
    }
    let raw: unknown;
    try {
      raw = call.arguments.trim() === '' ? {} : JSON.parse(call.arguments);
    } catch {
      return failure(`аргументы ${call.name} — не JSON. Пришло: ${call.arguments}`);
    }
    const parsed = tool.schema.safeParse(raw);
    if (!parsed.success) {
      return failure(`аргументы ${call.name} не прошли проверку:\n${z.prettifyError(parsed.error)}`);
    }
    try {
      const content = await tool.run(parsed.data);
      return { content: content.length > MAX_RESULT_CHARS ? `${content.slice(0, MAX_RESULT_CHARS)}\n…[обрезано]` : content, isError: false };
    } catch (error) {
      return failure(`${call.name} не выполнился: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function failure(text: string): ToolResult {
  return { content: `Ошибка: ${text}`, isError: true };
}
