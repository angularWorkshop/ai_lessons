// Клавиши прерывания в терминале.
// В обычном режиме терминал копит строку до Enter, а Ctrl+C сам превращает в сигнал SIGINT. Esc программа не увидит вовсе.
// В сыром режиме (raw mode) каждая клавиша приходит в stdin сразу, байтами, и Ctrl+C — тоже просто байт.
export type InterruptKey = 'esc' | 'ctrl-c';

// Шаг 4: что за клавиша в куске байтов из stdin.
export function readKey(chunk: Buffer | string): InterruptKey | undefined {
  const text = chunk.toString();
  // Esc — один байт 0x1b. Стрелки и F-клавиши тоже начинаются с него, но приходят пачкой: \x1b[A.
  if (text === '\x1b') {
    return 'esc';
  }
  if (text.includes('\x03')) {
    return 'ctrl-c';
  }
  return undefined;
}

// Шаг 4: слушать Esc и Ctrl+C, пока работает задача. Возвращает функцию, которая возвращает терминал как был.
export function listenForInterrupt(input: NodeJS.ReadStream, onKey: (key: InterruptKey) => void): () => void {
  // stdin — не терминал (пайп, CI): сырого режима нет, Esc не поймать. Остаётся Ctrl+C через SIGINT.
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const onSigint = () => onKey('ctrl-c');
    process.on('SIGINT', onSigint);
    return () => void process.off('SIGINT', onSigint);
  }

  const onData = (chunk: Buffer) => {
    const key = readKey(chunk);
    if (key) {
      onKey(key);
    }
  };
  input.setRawMode(true);
  input.on('data', onData);
  input.resume();
  return () => {
    input.off('data', onData);
    input.setRawMode(false);
    input.pause();
  };
}
