// Что занимает окно и сколько стоит каждый шаг агента.
import type { AgentEvent } from '../agent.ts';
import { estimateCost, type Message, type Price, type ToolSpec } from '../llm.ts';

/**
 * Сколько символов в среднем приходится на один токен. Замерено на qwen3.7-flash в теме 7.1:
 * код с русскими комментариями — 3,6, русский текст — 3,5, JSON описаний инструментов — 3,8.
 * У другой модели другой токенизатор, и цифра будет другой. Для бюджета хватает одной грубой цифры.
 */
export const CHARS_PER_TOKEN = 3.5;

// Шаг 1: оценка без модели. Точное число знает только токенизатор модели, а он у каждой свой.
export function estimateTokens(text: string): number {
  throw new Error('TODO: шаг 1');
}

export interface ContextBreakdown {
  system: number;
  /** Описания инструментов: они уходят в каждом запросе, даже если модель их не зовёт. */
  tools: number;
  /** Сообщения user и assistant вместе с вызовами инструментов. */
  history: number;
  /** Сообщения tool — то, что вернули инструменты. */
  toolResults: number;
  total: number;
}

export interface ContextRequest {
  system: string;
  tools: ToolSpec[];
  /** История без system — та, что лежит в AgentRun.messages. */
  messages: Message[];
}

// Шаг 1: из чего состоит запрос. Инструменты и вызовы модель получает в виде JSON — его и считаем.
export function contextBreakdown(request: ContextRequest): ContextBreakdown {
  throw new Error('TODO: шаг 1');
}

export interface StepCost {
  step: number;
  input: number;
  output: number;
  /** Цена этого шага в долларах. */
  cost: number;
  /** Сколько стоила задача вместе с этим шагом. */
  total: number;
}

// Шаг 4: журнал шагов. Подписывается на события агента и считает цену каждого запроса.
export class StepLedger {
  readonly steps: StepCost[] = [];
  readonly #price: Price;

  constructor(price: Price) {
    this.#price = price;
  }

  /** Отдай агенту в onEvent или вызывай из своего onEvent. Стрелка — чтобы this не терялся. */
  readonly onEvent = (event: AgentEvent): void => {
    throw new Error('TODO: шаг 4');
  };

  /** Сколько входных токенов ушло за всю задачу. */
  get inputTokens(): number {
    throw new Error('TODO: шаг 4');
  }
}
