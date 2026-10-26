// Общий бюджет токенов на всё дерево агентов. У Agent есть limits.maxTokens, но он считает только свои запросы:
// родитель с бюджетом 50 000 спокойно запустит десять детей по 50 000. Здесь один счётчик на всех.
import type { Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// Шаг 2
export class TokenBudget {
  readonly limit: number;
  #used = 0;

  constructor(limit: number) {
    if (!(limit > 0)) {
      throw new RangeError(`Бюджет должен быть больше нуля, а пришло ${limit}`);
    }
    this.limit = limit;
  }

  /** Вход + выход всех запросов всех агентов, которые ходят через этот бюджет. */
  get used(): number {
    return this.#used;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.#used);
  }

  get exhausted(): boolean {
    return this.#used >= this.limit;
  }

  charge(usage: Usage): void {
    this.#used += usage.input + usage.output;
  }
}

// Шаг 2: обёртка над провайдером. Как maxTokens в агенте: проверяем перед запросом, списываем после.
// Через неё ходят и родитель, и все дети — тогда бюджет общий.
export function withBudget(provider: Provider, budget: TokenBudget): Provider {
  return {
    async complete(messages, options) {
      if (budget.exhausted) {
        throw new BudgetExceededError(`Общий бюджет токенов исчерпан: потрачено ${budget.used} из ${budget.limit}`);
      }
      const result = await provider.complete(messages, options);
      budget.charge(result.usage);
      return result;
    },
  };
}
