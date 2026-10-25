// Права: перед каждым вызовом политика говорит allow, ask или deny.
// Это обёртка над Toolbox: Agent о правах ничего не знает. Отказ — обычный ToolResult с isError, модель его видит.
import path from 'node:path';
import type { ToolCall } from '../llm.ts';
import { Toolbox, type ToolboxOptions, type ToolContext, type ToolResult } from '../tools.ts';
import { Mutex } from './mutex.ts';
import { isSecret } from './safe-path.ts';

export type Decision = 'allow' | 'ask' | 'deny';

/** read-only — только чтение. ask — правки и команды с вопросом. auto — без вопросов, но deny остаётся deny. */
export type Mode = 'read-only' | 'ask' | 'auto';
export const MODES: Mode[] = ['read-only', 'ask', 'auto'];

/** Вызов, о котором решает политика: имя и аргументы, уже проверенные схемой инструмента. */
export interface PermissionRequest {
  tool: string;
  args: Record<string, unknown>;
}

export interface Verdict {
  decision: Decision;
  /** Почему. Уходит человеку в вопросе и модели в отказе. */
  reason: string;
}

export type Policy = (request: PermissionRequest) => Verdict;

/** Ответ человека. always — разрешить этот инструмент до конца сессии. */
export type Answer = 'yes' | 'no' | 'always';

export type Confirm = (request: PermissionRequest, verdict: Verdict, signal?: AbortSignal) => Promise<Answer>;

const READ_TOOLS = new Set(['list_files', 'read_file', 'grep']);

export const allow = (reason: string): Verdict => ({ decision: 'allow', reason });
export const ask = (reason: string): Verdict => ({ decision: 'ask', reason });
export const deny = (reason: string): Verdict => ({ decision: 'deny', reason });

// Шаг 1: путь от модели не выходит за корень. Только по строке, без диска: политика решает быстро и заранее.
// Настоящую проверку со ссылками всё равно сделает safePath внутри инструмента.
export function staysInside(file: string): boolean {
  throw new Error('TODO: шаг 1 — реши по строке пути, остаётся ли он внутри корня');
}

// Шаг 1: политика агента для кода.
export function codePolicy(mode: Mode): Policy {
  throw new Error('TODO: шаг 1 — верни функцию-политику для режима mode');
}

// Шаг 2: отказ — результат для модели. Объясняем, что делать дальше, иначе она будет повторять вызов.
export function refusal(reason: string): ToolResult {
  throw new Error('TODO: шаг 2 — собери ToolResult с отказом');
}

export interface GuardedToolboxOptions extends ToolboxOptions {
  policy: Policy;
  confirm: Confirm;
}

// Шаги 2–3: Toolbox с правами. Подкласс, а не новое поле в Agent: агенту нужен Toolbox — он его и получает.
export class GuardedToolbox extends Toolbox {
  readonly #policy: Policy;
  readonly #confirm: Confirm;
  /** Инструменты, на которые человек ответил «всегда». */
  readonly #always = new Set<string>();
  /** Вопросы — по одному: вызовы шага идут параллельно, а человек один. */
  readonly #asking = new Mutex();

  constructor(options: GuardedToolboxOptions) {
    super(options);
    this.#policy = options.policy;
    this.#confirm = options.confirm;
  }

  override async execute(call: ToolCall, ctx: ToolContext = {}): Promise<ToolResult> {
  throw new Error('TODO: шаги 2–3 — спроси политику, при ask — человека, и только потом исполняй');
}

  #request(call: ToolCall): PermissionRequest | undefined {
    const tool = this.get(call.name);
    if (!tool) return undefined;
    let raw: unknown;
    try {
      raw = call.arguments.trim() === '' ? {} : JSON.parse(call.arguments);
    } catch {
      return undefined;
    }
    const parsed = tool.schema.safeParse(raw);
    return parsed.success ? { tool: call.name, args: parsed.data as Record<string, unknown> } : undefined;
  }
}
