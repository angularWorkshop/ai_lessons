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
  if (path.isAbsolute(file)) return false;
  const normal = path.normalize(file);
  return normal !== '..' && !normal.startsWith(`..${path.sep}`);
}

// Шаг 1: политика агента для кода.
export function codePolicy(mode: Mode): Policy {
  return ({ tool, args }) => {
    if (READ_TOOLS.has(tool)) {
      return allow('чтение');
    }
    if (tool === 'edit_file') {
      const file = String(args.path);
      if (!staysInside(file)) return deny(`запись вне проекта: ${file}`);
      if (path.normalize(file).split(path.sep).some(isSecret)) return deny(`запись в файл с секретами: ${file}`);
      if (mode === 'read-only') return deny('режим read-only: менять файлы нельзя');
      return mode === 'auto' ? allow('правка внутри проекта') : ask('правка файла');
    }
    if (tool === 'run_command') {
      if (mode === 'read-only') return deny('режим read-only: запускать команды нельзя');
      return mode === 'auto' ? allow('команда из белого списка') : ask('запуск команды');
    }
    // Про новый инструмент политика ещё ничего не знает — пусть решает человек.
    return mode === 'read-only' ? deny(`режим read-only: про ${tool} политика ничего не знает`) : ask(`незнакомый инструмент ${tool}`);
  };
}

// Шаг 2: отказ — результат для модели. Объясняем, что делать дальше, иначе она будет повторять вызов.
export function refusal(reason: string): ToolResult {
  return {
    content: `Отказано: ${reason}. Не повторяй этот вызов. Сделай задачу по-другому или напиши человеку, что тебе нужно и зачем.`,
    isError: true,
  };
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
    const request = this.#request(call);
    // Нет инструмента или аргументы не прошли схему — спрашивать не о чем, ошибку объяснит Toolbox.
    if (!request) {
      return super.execute(call, ctx);
    }

    const verdict = this.#policy(request);
    if (verdict.decision === 'deny') {
      return refusal(verdict.reason);
    }
    if (verdict.decision === 'ask') {
      const answer = await this.#asking.run(async () =>
        // «Всегда» проверяем уже в очереди: пока ждали, человек мог ответить «всегда» на соседний вызов.
        this.#always.has(request.tool) ? 'yes' : this.#confirm(request, verdict, ctx.signal),
      );
      if (answer === 'no') {
        return refusal(`человек не разрешил этот вызов (${verdict.reason})`);
      }
      if (answer === 'always') {
        this.#always.add(request.tool);
      }
    }
    return super.execute(call, ctx);
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
