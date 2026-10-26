// План длинной задачи. Модель держит его через инструмент todo_write и каждый раз присылает весь список целиком.
// Человек видит тот же план в терминале: todoPrinter рисует его из событий агента.
import { z } from 'zod';
import type { AgentEvent } from '../agent.ts';
import type { Tool } from '../tools.ts';

export const TODO_TOOL = 'todo_write';
export const TODO_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];
/** Длиннее план не нужен: если пунктов больше, задачу пора делить на части. */
export const MAX_TODOS = 20;

const TodoItemSchema = z.object({
  title: z.string().min(1).describe('Что сделать, коротко и проверяемо: «Тесты для src/math.ts»'),
  status: z.enum(TODO_STATUSES).describe('pending — не начат, in_progress — в работе сейчас, done — сделан'),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

// Шаг 2: весь план целиком и правило «один в работе».
export const TodoWriteArgs = z
  .object({
    todos: z
      .array(TodoItemSchema)
      .min(1)
      .max(MAX_TODOS)
      .describe('Весь план целиком, в порядке выполнения. Пункты, которых нет в списке, из плана удаляются'),
  })
  .refine(({ todos }) => todos.filter((todo) => todo.status === 'in_progress').length <= 1, {
    message: 'В работе может быть только один пункт. Отметь остальные pending или done',
    path: ['todos'],
  });

/** Правила для system prompt: когда составлять план и как его вести. */
export const TODO_RULES = `## План
Задачу из трёх и больше шагов начни с плана: вызови todo_write со всеми пунктами в статусе pending.
Перед началом пункта отметь его in_progress — в работе всегда ровно один пункт.
Закончил пункт — сразу отметь done и возьми следующий. Узнал, что нужен ещё шаг, — добавь пункт.
Отвечай пользователю, только когда все пункты done.`;

const MARKS: Record<TodoStatus, string> = { pending: '[ ]', in_progress: '[>]', done: '[x]' };

// Шаг 1: план текстом — для модели и для человека один и тот же.
export function renderTodos(todos: readonly TodoItem[]): string {
  const done = todos.filter((todo) => todo.status === 'done').length;
  const lines = todos.map((todo) => `${MARKS[todo.status]} ${todo.title}`);
  return [`План: ${done} из ${todos.length} готово`, ...lines].join('\n');
}

// Подсказка модели после каждого обновления: что делать дальше.
export function nextHint(todos: readonly TodoItem[]): string {
  const current = todos.find((todo) => todo.status === 'in_progress');
  if (current) {
    return `Сейчас в работе: «${current.title}». Закончишь — отметь done.`;
  }
  if (todos.every((todo) => todo.status === 'done')) {
    return 'Все пункты готовы. Можно отвечать пользователю.';
  }
  return 'Ни один пункт не в работе. Отметь следующий in_progress и начинай.';
}

/** Текущий план. Его читает программа: демо в конце, ревьюер в теме 10.3. */
export class TodoList {
  #items: TodoItem[] = [];

  get items(): readonly TodoItem[] {
    return this.#items;
  }

  /** Пункты, которые ещё не done. */
  get unfinished(): TodoItem[] {
    return this.#items.filter((item) => item.status !== 'done');
  }

  replace(items: readonly TodoItem[]): void {
    this.#items = items.map((item) => ({ ...item }));
  }
}

// Шаг 3: инструмент. Схема уже проверила аргументы, остаётся сохранить план и ответить.
export function todoWriteTool(list: TodoList): Tool<z.infer<typeof TodoWriteArgs>> {
  return {
    name: TODO_TOOL,
    description:
      'Записывает план задачи: весь список пунктов со статусами. Зови в начале длинной задачи и после каждого изменения статуса.',
    schema: TodoWriteArgs,
    async run({ todos }) {
      list.replace(todos);
      return `${renderTodos(list.items)}\n\n${nextHint(list.items)}`;
    },
  };
}

// Шаг 4: план в терминале. Вызов todo_write печатаем планом, а не строкой JSON; остальное — как раньше.
export function todoPrinter(
  print: (event: AgentEvent) => void,
  write: (text: string) => void = console.log,
): (event: AgentEvent) => void {
  return (event) => {
    if ((event.type === 'tool_call' || event.type === 'tool_result') && event.call.name === TODO_TOOL) {
      if (event.type === 'tool_result') {
        // Ошибка — значит, план не принят: покажем, что сказали модели. Иначе аргументы уже прошли схему.
        write(event.result.isError ? `✗ ${TODO_TOOL}: ${event.result.content}` : renderTodos(parseTodos(event.call.arguments)));
      }
      return;
    }
    print(event);
  };
}

function parseTodos(args: string): TodoItem[] {
  return TodoWriteArgs.parse(JSON.parse(args)).todos;
}
