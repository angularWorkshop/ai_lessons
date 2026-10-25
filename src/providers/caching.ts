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
  throw new Error('TODO: шаг 4');
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
  throw new Error('TODO: шаг 4');
}
