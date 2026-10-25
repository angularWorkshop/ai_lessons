// Агент в терминале: каждое событие из onEvent — строка на экране.
import type { AgentEvent } from './agent.ts';

// Результат инструмента бывает длинным. В терминал — первая строка и не больше 120 символов.
function short(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 120 || text.includes('\n') ? `${line.slice(0, 120)}…` : line;
}

export function printEvent(event: AgentEvent): void {
  switch (event.type) {
    case 'step':
      console.log(`\n── шаг ${event.step}`);
      break;
    case 'assistant':
      if (event.message.content) {
        console.log(`модель> ${event.message.content}`);
      }
      console.log(`   (${event.usage.input} → ${event.usage.output} токенов)`);
      break;
    case 'tool_call':
      console.log(`→ ${event.call.name}(${event.call.arguments})`);
      break;
    case 'tool_result':
      console.log(`${event.result.isError ? '✗' : '✓'} ${short(event.result.content)}`);
      break;
    case 'stop':
      console.log(`\n■ ${event.reason}`);
      break;
  }
}
