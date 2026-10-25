// Compaction: когда история перерастает порог, старую часть пересказывает модель.
// Модель видит сводку и последние сообщения как есть. История агента остаётся полной.
import type { PrepareInfo } from '../agent.ts';
import type { Message, Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';
import { truncate } from '../tools.ts';
import { estimateTokens } from './budget.ts';

/** С этой строки начинается сообщение со сводкой: так модель отличит её от слов пользователя. */
export const SUMMARY_PREFIX = '[Сводка начала разговора. Старые сообщения сжаты, дальше история идёт как есть.]';

/** Инструкция для модели, которая пишет сводку. Разделы — то, без чего агент не продолжит работу. */
export const SUMMARY_SYSTEM = `Ты сжимаешь историю работы ИИ-агента, чтобы он продолжил задачу без неё.
Тебе пришлют предыдущую сводку, если она есть, и следующую часть истории. Напиши одну новую сводку вместо них.

Ровно четыре раздела:
## Цель
Задача пользователя и все требования к результату: формат, ограничения, язык. Требования — дословно.
## Решения
Что агент уже сделал и что решил, по пунктам.
## Факты
Что агент узнал и что понадобится дальше: пути, имена, числа, значения. Точно, как в истории.
## Открытые вопросы
Что ещё не сделано или не выяснено.

Только эти разделы, без вступления. Ничего не придумывай: если чего-то нет в истории, этого нет и в сводке.`;

/**
 * Сколько символов одного результата инструмента попадает в текст для сводки. Столько же, сколько видел агент
 * (Toolbox режет на 20 000): что модель не успела выписать из результата, сводка должна увидеть сама.
 */
export const TRANSCRIPT_RESULT_CHARS = 20_000;

export const DEFAULT_KEEP_LAST = 6;

// Шаг 1: где кончается старая часть. Хвост не начинается с tool: иначе вызов уйдёт в сводку,
// а модель получит результат без вызова. OpenAI на такое отвечает 400, наш шлюз — молча путает модель.
export function findSplit(messages: Message[], keepLast: number): number {
  throw new Error('TODO: шаг 1');
}

// Шаг 2: история — текстом. Сводку пишет обычный запрос без tools, и сырые tool_calls ему ни к чему.
export function renderTranscript(messages: Message[], maxResultChars = TRANSCRIPT_RESULT_CHARS): string {
  throw new Error('TODO: шаг 2');
}

export interface SummarizeOptions {
  /** Сводка прошлого сжатия: новая её заменяет, поэтому модель должна её видеть. */
  previous?: string;
  signal?: AbortSignal;
}

export interface Summary {
  text: string;
  usage: Usage;
}

// Шаг 3: один запрос — одна сводка. Пустая или обрезанная сводка хуже никакой: бросаем.
export async function summarize(provider: Provider, messages: Message[], options: SummarizeOptions = {}): Promise<Summary> {
  throw new Error('TODO: шаг 3');
}

export function summaryMessage(summary: string): Message {
  return { role: 'user', content: `${SUMMARY_PREFIX}\n\n${summary}` };
}

/** Оценка размера сообщений — той же меркой, что и в теме 7.1. */
export function estimateMessages(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(JSON.stringify(message)), 0);
}

export interface CompactEvent {
  step: number;
  /** Сколько сообщений истории ушло в сводку на этот раз. */
  summarized: number;
  /** Оценка запроса в токенах до и после сжатия. */
  before: number;
  after: number;
  summary: string;
  /** Сколько стоил запрос на сводку. Агент его не считает: это отдельный запрос. */
  usage: Usage;
}

export interface CompactorOptions {
  /** Кто пишет сводку. Обычно та же модель, что и у агента. */
  provider: Provider;
  /** Порог по оценке токенов истории. Выше — сжимаем. */
  threshold: number;
  /** Сколько последних сообщений всегда уходят модели как есть. По умолчанию 6. */
  keepLast?: number;
  onCompact?: (event: CompactEvent) => void;
}

export class Compactor {
  readonly #options: CompactorOptions;
  /** Текущая сводка и сколько первых сообщений истории она заменяет. */
  #summary = '';
  #covered = 0;
  /** Последнее сообщение, ушедшее в сводку. По нему видно, что пришла та же история, а не новая. */
  #lastCovered: Message | undefined;

  constructor(options: CompactorOptions) {
    this.#options = options;
  }

  get summary(): string {
    return this.#summary;
  }

  // Шаг 4: отдай агенту как prepareMessages. Стрелка — чтобы this не потерялся.
  readonly prepare = async (messages: Message[], info: PrepareInfo): Promise<Message[]> => {
    throw new Error('TODO: шаг 4');
  };
}
