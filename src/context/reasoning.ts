// Рассуждения: модель сначала думает, потом отвечает. Думать — это выходные токены, за них платим.
import type { ChatOptions, ChatResult, Message, ReasoningOptions, Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';

/**
 * Предел ответа, когда рассуждения включены. 1024 по умолчанию из llm.ts мало:
 * модель тратит их на мысли и обрывается раньше, чем начнёт отвечать.
 */
export const REASONING_MAX_TOKENS = 8000;

// Шаг 3: провайдер, который просит модель рассуждать. Агент о нём не знает — ему всё равно, кто отвечает.
// То, что вызывающий задал сам, важнее: reasoning и maxTokens из options не перетираем.
export function withReasoning(provider: Provider, reasoning: ReasoningOptions): Provider {
  throw new Error('TODO: шаг 3');
}

export interface EscalationOptions {
  /** Проверка ответа кодом: тест, схема, сравнение с эталоном. true — ответ годится. */
  check: (result: ChatResult) => boolean;
  /** С какими рассуждениями повторить. По умолчанию { effort: 'medium' }. */
  reasoning?: ReasoningOptions;
  /** Опции обоих запросов: temperature, signal и т. п. */
  options?: ChatOptions;
}

export interface EscalationResult {
  result: ChatResult;
  /** Понадобился ли второй запрос с рассуждениями. */
  escalated: boolean;
  /** Сумма обоих запросов, если их было два. */
  usage: Usage;
}

function addUsage(a: Usage, b: Usage): Usage {
  const reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0);
  return { input: a.input + b.input, output: a.output + b.output, ...(reasoning > 0 ? { reasoning } : {}) };
}

// Шаг 4: сначала дёшево, без рассуждений. Ответ не прошёл проверку или обрезан — повторяем с рассуждениями.
// Платим за мысли только там, где без них не справились.
export async function answerWithEscalation(
  provider: Provider,
  messages: Message[],
  escalation: EscalationOptions,
): Promise<EscalationResult> {
  throw new Error('TODO: шаг 4');
}
