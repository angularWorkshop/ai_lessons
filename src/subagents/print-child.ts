// События субагента в терминале: короче, чем у родителя, и каждая строка — с именем подзадачи.
// Несколько детей могут работать одновременно, и без префикса их строки не различить.
import type { AgentEvent } from '../agent.ts';

function short(text: string, max = 100): string {
  const line = text.split('\n')[0];
  return line.length > max || text.includes('\n') ? `${line.slice(0, max)}…` : line;
}

// Шаг 4
export function childPrinter(write: (line: string) => void = console.log): (event: AgentEvent, description: string) => void {
  return (event, description) => {
    const prefix = `  │ [${description}]`;
    switch (event.type) {
      case 'assistant':
        if (event.message.content) {
          write(`${prefix} модель> ${short(event.message.content)}`);
        }
        break;
      case 'tool_call':
        write(`${prefix} → ${event.call.name}(${short(event.call.arguments, 60)})`);
        break;
      case 'tool_result':
        write(`${prefix} ${event.result.isError ? '✗' : '✓'} ${event.call.name}: ${short(event.result.content, 60)}`);
        break;
      case 'stop':
        write(`${prefix} ■ ${event.reason}`);
        break;
      // step не печатаем: у ребёнка шаги короткие, а строк и так много.
    }
  };
}
