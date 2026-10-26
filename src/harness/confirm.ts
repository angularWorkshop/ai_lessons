// Вопрос человеку внутри REPL. TerminalConfirm из 5.4 держит свой readline на stdin всю сессию —
// рядом с приглашением REPL он съел бы строки, которые человек пишет агенту. Здесь вопрос живёт, только пока ждёт ответ.
// Во время задачи REPL держит терминал в сыром режиме (тема 6.2): ответ — одна клавиша, Enter не нужен.
import { describeCall, parseAnswer } from '../code-tools/confirm.ts';
import type { Answer, Confirm } from '../code-tools/permissions.ts';

type Out = Pick<NodeJS.WritableStream, 'write'>;

// Шаг 5: y / a / n одной клавишей. Всё остальное, включая Enter, Esc и Ctrl+C, — «нет».
export function keyConfirm(input: NodeJS.ReadableStream, output: Out): Confirm {
  throw new Error('TODO: шаг 5');
}
