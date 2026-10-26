// Очередь «по одному». Агент исполняет вызовы шага параллельно (тема 4.4),
// а две правки одного файла одновременно затрут друг друга: обе прочитают старый текст, и победит последняя запись.

// Шаг 4
export class Mutex {
  #tail: Promise<unknown> = Promise.resolve();

  /** Запустить fn, когда закончатся все, кто встал в очередь раньше. Ошибка fn не ломает очередь. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn);
    this.#tail = result.catch(() => {});
    return result;
  }
}
