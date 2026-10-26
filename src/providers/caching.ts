// Сколько стоит агент с длинной историей — с кешем префикса и без него.
// Модель простая: каждый шаг отправляет весь прошлый запрос плюс то, что добавилось за шаг.
import { estimateCost, type Price, type Usage } from '../llm.ts';

export interface RunShape {
  /** Стабильный префикс: system и описания инструментов. */
  prefix: number;
  /** На сколько токенов история растёт за шаг: ответ модели и результаты инструментов. */
  perStep: number;
  /** Сколько токенов модель пишет за шаг. */
  outputPerStep: number;
  /** Сколько запросов к модели за задачу. */
  steps: number;
}

// Шаг 4. Запрос шага i (с единицы) — prefix + (i − 1) · perStep.
// С кешем шаг i читает из кеша весь запрос шага i − 1, первый шаг не читает ничего.
export function projectUsage(shape: RunShape, cache: boolean): Usage {
  const { prefix, perStep, outputPerStep, steps } = shape;
  const prompt = (step: number) => prefix + (step - 1) * perStep;

  let input = 0;
  let cached = 0;
  for (let step = 1; step <= steps; step++) {
    input += prompt(step);
    if (cache && step > 1) {
      cached += prompt(step - 1);
    }
  }

  const usage: Usage = { input, output: outputPerStep * steps };
  return cached > 0 ? { ...usage, cached } : usage;
}

export interface CacheSavings {
  withoutCache: number;
  withCache: number;
  /** Во сколько раз дешевле с кешем. */
  ratio: number;
}

// Шаг 4. withCachePrice нужен, когда у провайдера запись в кеш дороже обычного входа (Anthropic):
// тогда весь некешированный вход считаем по цене записи.
export function cacheSavings(shape: RunShape, price: Price, withCachePrice: Price = price): CacheSavings {
  const withoutCache = estimateCost(projectUsage(shape, false), price);
  const withCache = estimateCost(projectUsage(shape, true), withCachePrice);
  return { withoutCache, withCache, ratio: withoutCache / withCache };
}
