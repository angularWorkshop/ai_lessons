// Прерывание: человек остановил агента посреди шага. Здесь то, что нужно агенту и разговору.
// Клавиши в терминале — отдельно, в keys.ts: агенту всё равно, Esc это была или таймаут всей задачи.
import type { ToolResult } from './tools.ts';

/** Результат вызова, который уже работал, когда агента остановили. */
export const INTERRUPTED_RESULT: ToolResult = {
  content: 'Ошибка: вызов прерван — человек остановил агента. Что инструмент успел сделать до остановки, неизвестно.',
  isError: true,
};

/** Сообщение user после прерванной задачи. Модель увидит, что задачу остановили, а не забыли ответить. */
export const INTERRUPTED_NOTE = '[Человек прервал выполнение этой задачи. Не продолжай её, если об этом не попросят.]';

// Шаг 1: ждём work, но не дольше, чем до отмены. После отмены сразу возвращаем onAbort(),
// а work дорабатывает в фоне: его результат уже никто не ждёт.
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined, onAbort: () => T): Promise<T> {
  if (!signal) {
    return work;
  }
  if (signal.aborted) {
    return Promise.resolve(onAbort());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => resolve(onAbort());
    signal.addEventListener('abort', abort, { once: true });
    // Работа кончилась первой — снимаем слушателя, иначе за длинный разговор их накопятся тысячи.
    // Если первой была отмена, эти resolve и reject уже ничего не меняют.
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
