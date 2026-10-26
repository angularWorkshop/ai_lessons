// Трейс прогона: всё, что агент сделал, по порядку и со временем. Собирается из onEvent —
// единственного способа смотреть на агента снаружи. По трейсу разбирают, почему задача не решилась.
import type { AgentEvent, StopReason } from '../agent.ts';
import type { Usage } from '../llm.ts';

/** t — миллисекунды от начала прогона. */
export type TraceEvent =
  | { t: number; type: 'step'; step: number }
  | { t: number; type: 'assistant'; text: string | null; calls: number; usage: Usage }
  | { t: number; type: 'tool_call'; id: string; name: string; args: string }
  | { t: number; type: 'tool_result'; id: string; name: string; args: string; isError: boolean; chars: number; content: string }
  | { t: number; type: 'stop'; reason: StopReason };

/** Сколько символов результата инструмента хранить. Хватает на ошибку и итог тестов, трейс не раздувается. */
export const TRACE_CONTENT_CHARS = 2000;

export interface TraceRecorder {
  events: TraceEvent[];
  onEvent: (event: AgentEvent) => void;
}

// Шаг 1: событие агента → запись трейса. text_delta не пишем: тот же текст придёт целиком в assistant.
export function recordTrace(clock: () => number = Date.now): TraceRecorder {
  throw new Error('TODO: шаг 1');
}

type ToolResultEvent = Extract<TraceEvent, { type: 'tool_result' }>;

/** Результаты инструментов из трейса, по порядку. */
export function toolResults(trace: TraceEvent[]): ToolResultEvent[] {
  return trace.filter((event): event is ToolResultEvent => event.type === 'tool_result');
}

/** Аргументы вызова как объект. Сломанный JSON — пустой объект: разбор трейса не должен падать. */
export function parseArgs(args: string): Record<string, unknown> {
  try {
    const value = JSON.parse(args);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** Вызов строкой для человека: read_file src/users.js, run_command npm test. */
export function describeCall(name: string, args: string): string {
  const parsed = parseArgs(args);
  if (name === 'run_command') {
    return `run_command ${[parsed.command, ...(Array.isArray(parsed.args) ? parsed.args : [])].join(' ')}`;
  }
  if (typeof parsed.path === 'string') {
    return `${name} ${parsed.path}`;
  }
  if (typeof parsed.pattern === 'string') {
    return `${name} ${parsed.pattern}`;
  }
  return name;
}

// Трейс целиком, строка на событие. Это читают глазами, когда находок мало, чтобы понять провал.
export function formatTrace(trace: TraceEvent[]): string {
  const lines: string[] = [];
  for (const event of trace) {
    const time = `${(event.t / 1000).toFixed(1).padStart(5)} с`;
    switch (event.type) {
      case 'step':
        lines.push(`${time}  ── шаг ${event.step}`);
        break;
      case 'assistant':
        if (event.text) lines.push(`${time}  модель> ${event.text.split('\n')[0].slice(0, 160)}`);
        break;
      case 'tool_result': {
        const content = event.content.split('\n');
        // У команды главное — код выхода, у остального — первая непустая строка.
        const summary =
          content.find((line) => /^(код выхода|завершена|остановлена)/.test(line)) ?? content.find((line) => line.trim() !== '') ?? '';
        lines.push(`${time}  ${event.isError ? '✗' : '✓'} ${describeCall(event.name, event.args)} → ${summary.slice(0, 120)}`);
        break;
      }
      case 'stop':
        lines.push(`${time}  ■ ${event.reason}`);
        break;
    }
  }
  return lines.join('\n');
}
