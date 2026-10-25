// Promise.all с ограничением: не больше limit задач одновременно.
// Пригодится для вызовов инструментов, а в секции 10 — для параллельных субагентов.

// Шаг 1
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit должен быть целым числом от 1, а пришло ${limit}`);
  }
  const results = new Array<R>(items.length);
  let next = 0;

  // Работник берёт следующий свободный индекс, пока они не кончатся.
  // JavaScript однопоточный: next++ между await никто не перебьёт, два работника не возьмут один индекс.
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      // Результат кладём по индексу, а не push: задачи заканчиваются в любом порядке.
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
