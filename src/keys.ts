// Клавиши прерывания в терминале.
// В обычном режиме терминал копит строку до Enter, а Ctrl+C сам превращает в сигнал SIGINT. Esc программа не увидит вовсе.
// В сыром режиме (raw mode) каждая клавиша приходит в stdin сразу, байтами, и Ctrl+C — тоже просто байт.
export type InterruptKey = 'esc' | 'ctrl-c';

// Шаг 4: что за клавиша в куске байтов из stdin.
export function readKey(chunk: Buffer | string): InterruptKey | undefined {
  throw new Error('TODO: шаг 4 — Esc это один байт 0x1b, Ctrl+C — байт 0x03');
}

// Шаг 4: слушать Esc и Ctrl+C, пока работает задача. Возвращает функцию, которая возвращает терминал как был.
export function listenForInterrupt(input: NodeJS.ReadStream, onKey: (key: InterruptKey) => void): () => void {
  throw new Error('TODO: шаг 4 — включи сырой режим и слушай data; не терминал — слушай SIGINT');
}
