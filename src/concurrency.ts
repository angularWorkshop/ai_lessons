// Promise.all с ограничением: не больше limit задач одновременно.
// Пригодится для вызовов инструментов, а в секции 10 — для параллельных субагентов.

// Шаг 1
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  throw new Error('TODO: шаг 1 — выполни fn для всех items, не больше limit одновременно');
}
