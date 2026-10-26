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
  return matcher
    .split('|')
    .map((part) => part.trim())
    .some((part) => new RegExp(`^${part.replace(/[.+?^${}()[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(tool));
}

// Шаг 1: загрузить модули хуков. Нет файла или нет функции — ошибка при старте, а не тихая работа без защиты.
export async function loadHooks(config: HooksConfig = {}): Promise<LoadedHook[]> {
  const hooks: LoadedHook[] = [];
  for (const event of HOOK_EVENTS) {
    for (const spec of config[event] ?? []) {
      let module: { default?: unknown };
      try {
        module = await import(pathToFileURL(spec.module).href);
      } catch (error) {
        throw new HookError(`хук ${spec.module} не загрузился: ${(error as Error).message}`);
      }
      if (typeof module.default !== 'function') {
        throw new HookError(`хук ${spec.module}: нужен export default function`);
      }
      hooks.push({ event, matcher: spec.matcher ?? '*', name: spec.module.split(/[\\/]/).pop()!, run: module.default as HookFn });
    }
  }
  return hooks;
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
    let args = parseArgs(call);
    // Аргументы не JSON — хукам смотреть не на что, ошибку объяснит Toolbox.
    if (!args) return super.execute(call, ctx);

    // Шаг 2: PreToolUse по порядку. Каждый следующий видит аргументы после предыдущего.
    for (const hook of this.#for('PreToolUse', call.name)) {
      let output: PreToolUseOutput;
      try {
        output = (await hook.run({ event: 'PreToolUse', tool: call.name, args, root: this.#root })) as PreToolUseOutput;
      } catch (error) {
        // Сломанный хук-охранник не должен пропускать вызов: падение — тоже отказ.
        return blocked(hook.name, `хук упал — ${(error as Error).message}`);
      }
      if (output && 'block' in output) return blocked(hook.name, output.block);
      if (output && 'args' in output) args = output.args;
    }

    const result = await super.execute({ ...call, arguments: JSON.stringify(args) }, ctx);

    // Шаг 3: PostToolUse видит результат. Замечания дописываются к нему — модель прочитает их на следующем шаге.
    const notes: string[] = [];
    for (const hook of this.#for('PostToolUse', call.name)) {
      try {
        const output = (await hook.run({ event: 'PostToolUse', tool: call.name, args, root: this.#root, result })) as PostToolUseOutput;
        if (output?.feedback) notes.push(`[хук ${hook.name}] ${output.feedback}`);
      } catch (error) {
        notes.push(`[хук ${hook.name} упал: ${(error as Error).message}]`);
      }
    }
    return notes.length === 0 ? result : { ...result, content: [result.content, ...notes].join('\n\n') };
  }

  #for(event: HookEvent, tool: string): LoadedHook[] {
    return this.#hooks.filter((hook) => hook.event === event && hookMatches(hook.matcher, tool));
  }
}
