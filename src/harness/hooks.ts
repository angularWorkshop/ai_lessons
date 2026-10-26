// Хуки: код человека, который harness запускает до и после каждого вызова инструмента.
// Модель не может их пропустить, уговорить или забыть: они не в промпте, а в цикле.
//   PreToolUse  — до вызова: заблокировать его или поменять аргументы;
//   PostToolUse — после вызова: увидеть результат и дописать к нему замечание для модели.
// Хук — JS-модуль проекта с функцией по умолчанию. Подключается в настройках:
//   "hooks": { "PreToolUse": [{ "matcher": "edit_file", "module": ".agent/hooks/no-generated.mjs" }] }
import { pathToFileURL } from 'node:url';
import type { ToolCall } from '../llm.ts';
import { GuardedToolbox, type GuardedToolboxOptions } from '../code-tools/permissions.ts';
import type { ToolContext, ToolResult } from '../tools.ts';

export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** Что хук получает на вход. */
export interface HookInput {
  event: HookEvent;
  tool: string;
  args: Record<string, unknown>;
  /** Корень проекта: от него пути в args. */
  root: string;
  /** Только в PostToolUse. */
  result?: ToolResult;
}

/** Ответ PreToolUse. Ничего — пропустить вызов как есть. */
export type PreToolUseOutput = void | undefined | { block: string } | { args: Record<string, unknown> };
/** Ответ PostToolUse. feedback допишется к результату: его прочитает модель. */
export type PostToolUseOutput = void | undefined | { feedback: string };

export type HookFn = (input: HookInput) => PreToolUseOutput | PostToolUseOutput | Promise<PreToolUseOutput | PostToolUseOutput>;

/** Хук в настройках. matcher — имена инструментов через |, можно со *. Нет matcher — все инструменты. */
export interface HookSpec {
  matcher?: string;
  module: string;
}

export type HooksConfig = Partial<Record<HookEvent, HookSpec[]>>;

export interface LoadedHook {
  event: HookEvent;
  matcher: string;
  /** Имя для сообщений: файл модуля. */
  name: string;
  run: HookFn;
}

export class HookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookError';
  }
}

// Шаг 1: подходит ли хук к инструменту. edit_file|run_command — список, project__* — шаблон, * — все.
export function hookMatches(matcher: string, tool: string): boolean {
  throw new Error('TODO: шаг 1');
}

// Шаг 1: загрузить модули хуков. Нет файла или нет функции — ошибка при старте, а не тихая работа без защиты.
export async function loadHooks(config: HooksConfig = {}): Promise<LoadedHook[]> {
  throw new Error('TODO: шаг 1');
}

/** Результат для модели, когда вызов остановил хук. */
export function blocked(name: string, reason: string): ToolResult {
  return { content: `Заблокировано хуком ${name}: ${reason}. Не повторяй этот вызов.`, isError: true };
}

export interface HookedToolboxOptions extends GuardedToolboxOptions {
  hooks: LoadedHook[];
  root: string;
}

function parseArgs(call: ToolCall): Record<string, unknown> | undefined {
  try {
    const raw: unknown = call.arguments.trim() === '' ? {} : JSON.parse(call.arguments);
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// Шаги 2–3: Toolbox с хуками поверх Toolbox с правами. Порядок как у Claude Code: хуки до → права → инструмент → хуки после.
// Права проверяют уже изменённые хуком аргументы: хук не может провести вызов мимо deny.
export class HookedToolbox extends GuardedToolbox {
  readonly #hooks: LoadedHook[];
  readonly #root: string;

  constructor(options: HookedToolboxOptions) {
    super(options);
    this.#hooks = options.hooks;
    this.#root = options.root;
  }

  override async execute(call: ToolCall, ctx: ToolContext = {}): Promise<ToolResult> {
    throw new Error('TODO: шаги 2–3');
  }

  #for(event: HookEvent, tool: string): LoadedHook[] {
    return this.#hooks.filter((hook) => hook.event === event && hookMatches(hook.matcher, tool));
  }
}
