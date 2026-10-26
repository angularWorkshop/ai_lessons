// Бюджет сессии в деньгах. limits.maxTokens из 4.2 считает токены одной задачи одного агента,
// TokenBudget из 10.4 — токены дерева агентов. Человеку важнее другое: сколько долларов ушло за сессию.
// Обёртка над провайдером: через неё ходят агент, субагенты и сводки, поэтому считается всё.
import { estimateCost, type Price, type Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// Шаг 3
export class CostBudget {
  /** Лимит в долларах. undefined — без лимита: только считаем. */
  readonly limit: number | undefined;
  readonly price: Price;
  #spent: number;

  /** spent — уже потрачено в этой сессии: после resume бюджет не начинается с нуля. */
  constructor(limit: number | undefined, price: Price, spent = 0) {
    if (limit !== undefined && !(limit > 0)) {
      throw new RangeError(`Бюджет должен быть больше нуля, а пришло ${limit}`);
    }
    this.limit = limit;
    this.price = price;
    this.#spent = spent;
  }

  get spent(): number {
    return this.#spent;
  }

  get exhausted(): boolean {
    return this.limit !== undefined && this.#spent >= this.limit;
  }

  charge(usage: Usage): void {
    this.#spent += estimateCost(usage, this.price);
  }

  /** Перед запросом: бюджет кончился — запроса не будет. Сколько стоит следующий, заранее не узнать, поэтому перерасход — не больше одного запроса. */
  check(): void {
    if (this.exhausted) {
      throw new BudgetExceededError(`Бюджет сессии исчерпан: потрачено $${this.#spent.toFixed(6)} из $${this.limit!.toFixed(6)}`);
    }
  }
}

// Шаг 3: обёртка над провайдером — и complete, и stream. withBudget из 10.4 знал только complete, а harness стримит.
export function withCostBudget(provider: Provider, budget: CostBudget): Provider {
  const wrapped: Provider = {
    async complete(messages, options) {
      budget.check();
      const result = await provider.complete(messages, options);
      budget.charge(result.usage);
      return result;
    },
  };
  if (provider.stream) {
    const stream = provider.stream.bind(provider);
    wrapped.stream = async (messages, options, onDelta) => {
      budget.check();
      const result = await stream(messages, options, onDelta);
      budget.charge(result.usage);
      return result;
    };
  }
  return wrapped;
}
