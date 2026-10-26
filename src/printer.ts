// Агент в терминале со стримингом: текст модели печатается по мере генерации, остальное — как в print-event.ts.
// Куда печатать, задаёт out: обычно stdout, а в headless-режиме (тема 6.3) — stderr.
import type { AgentEvent } from './agent.ts';

type Out = Pick<NodeJS.WritableStream, 'write'>;

// Результат инструмента бывает длинным. В терминал — первая строка и не больше 120 символов.
function short(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 120 || text.includes('\n') ? `${line.slice(0, 120)}…` : line;
}

export function createPrinter(out: Out = process.stdout): (event: AgentEvent) => void {
  const line = (text: string) => void out.write(`${text}\n`);
  // Печатается ли сейчас текст модели по кусочкам и чем он кончился: перевод строки ставим только если его не было.
  let streaming = false;
  let endsWithNewline = true;

  const endStream = () => {
    if (streaming && !endsWithNewline) {
      out.write('\n');
    }
    streaming = false;
  };

  return (event) => {
    switch (event.type) {
      case 'step':
        line(`\n── шаг ${event.step}`);
        break;
      case 'text_delta':
        if (!streaming) {
          out.write('модель> ');
          streaming = true;
        }
        out.write(event.text);
        endsWithNewline = event.text.endsWith('\n');
        break;
      case 'assistant':
        // Текст уже на экране, если пришёл кусочками. Без стрима печатаем его целиком, как раньше.
        if (streaming) {
          endStream();
        } else if (event.message.content) {
          line(`модель> ${event.message.content}`);
        }
        line(`   (${event.usage.input} → ${event.usage.output} токенов)`);
        break;
      case 'tool_call':
        line(`→ ${event.call.name}(${event.call.arguments})`);
        break;
      case 'tool_result':
        line(`${event.result.isError ? '✗' : '✓'} ${event.call.name}: ${short(event.result.content)}`);
        break;
      case 'stop':
        // Остановили посреди ответа — assistant не придёт, а строку надо закончить.
        endStream();
        line(`\n■ ${event.reason}`);
        break;
    }
  };
}
