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
    throw new Error('TODO: шаг 2');
  }

  get remaining(): number {
    throw new Error('TODO: шаг 2');
  }

  get exhausted(): boolean {
    throw new Error('TODO: шаг 2');
  }

  charge(usage: Usage): void {
    throw new Error('TODO: шаг 2');
  }
}

// Шаг 2: обёртка над провайдером. Как maxTokens в агенте: проверяем перед запросом, списываем после.
// Через неё ходят и родитель, и все дети — тогда бюджет общий.
export function withBudget(provider: Provider, budget: TokenBudget): Provider {
  throw new Error('TODO: шаг 2');
}
