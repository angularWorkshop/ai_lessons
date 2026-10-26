// События субагента в терминале: короче, чем у родителя, и каждая строка — с именем подзадачи.
// Несколько детей могут работать одновременно, и без префикса их строки не различить.
import type { AgentEvent } from '../agent.ts';

function short(text: string, max = 100): string {
  const line = text.split('\n')[0];
  return line.length > max || text.includes('\n') ? `${line.slice(0, max)}…` : line;
}

// Шаг 4
export function childPrinter(write: (line: string) => void = console.log): (event: AgentEvent, description: string) => void {
  throw new Error('TODO: шаг 4');
}
