// Вопрос человеку внутри REPL. TerminalConfirm из 5.4 держит свой readline на stdin всю сессию —
// рядом с приглашением REPL он съел бы строки, которые человек пишет агенту. Здесь вопрос живёт, только пока ждёт ответ.
// Во время задачи REPL держит терминал в сыром режиме (тема 6.2): ответ — одна клавиша, Enter не нужен.
import { describeCall, parseAnswer } from '../code-tools/confirm.ts';
import type { Answer, Confirm } from '../code-tools/permissions.ts';

type Out = Pick<NodeJS.WritableStream, 'write'>;

// Шаг 5: y / a / n одной клавишей. Всё остальное, включая Enter, Esc и Ctrl+C, — «нет».
export function keyConfirm(input: NodeJS.ReadableStream, output: Out): Confirm {
  return (request, verdict, signal) => {
    const body = describeCall(request).replace(/^/gm, '  ');
    output.write(`\n? ${verdict.reason} — разрешить?\n${body}\n  [y] да · [a] да, и больше не спрашивать про ${request.tool} · [n] нет > `);
    return new Promise<Answer>((resolve) => {
      // В сыром режиме REPL поток уже течёт. Если нет (pipe), после ответа вернём его как было, чтобы не терять ввод.
      const flowing = (input as NodeJS.ReadableStream & { readableFlowing?: boolean | null }).readableFlowing === true;
      const finish = (answer: Answer, echo: string) => {
        input.off('data', onData);
        if (!flowing) input.pause();
        signal?.removeEventListener('abort', onAbort);
        output.write(`${echo}\n`);
        resolve(answer);
      };
      const onData = (chunk: Buffer | string) => {
        const key = chunk.toString().trim().slice(0, 1);
        const answer = parseAnswer(key);
        finish(answer, answer === 'yes' ? 'да' : answer === 'always' ? 'всегда' : 'нет');
      };
      const onAbort = () => finish('no', 'нет (агент остановлен)');
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      input.on('data', onData);
      input.resume();
    });
  };
}
