// Цикл агента: спросить модель → исполнить вызовы → вернуть результаты → спросить снова.
// Заканчивается, когда модель отвечает текстом или когда провайдер упал.
// Настоящий лимит шагов с последним запросом без инструментов — в теме 15.2. Пока — аварийный стоп.
import type { Message, Provider, ToolCall, Usage } from './llm.ts';
import type { Toolbox, ToolResult } from './tools.ts';

export type StopReason = 'done' | 'max_steps' | 'error';

/** Что видно снаружи: каждый исполненный вызов. Так печатает ask.ts. */
export interface ToolEvent {
  call: ToolCall;
  result: ToolResult;
}

export interface LoopOptions {
  provider: Provider;
  toolbox: Toolbox;
  system: string;
  onTool?: (event: ToolEvent) => void;
}

export interface LoopResult {
  text: string;
  stopReason: StopReason;
  steps: number;
  usage: Usage;
  messages: Message[];
}

/** Аварийный стоп, чтобы цикл не крутился вечно. В 15.2 его заменит maxSteps. */
const HARD_STOP = 10;

export async function runLoop(question: string, options: LoopOptions): Promise<LoopResult> {
  const { provider, toolbox, system, onTool } = options;
  const tools = toolbox.specs();
  const messages: Message[] = [{ role: 'user', content: question }];
  const usage: Usage = { input: 0, output: 0 };

  for (let step = 1; ; step++) {
    let result;
    try {
      result = await provider.complete([{ role: 'system', content: system }, ...messages], { tools });
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error), stopReason: 'error', steps: step, usage, messages };
    }

    usage.input += result.usage.input;
    usage.output += result.usage.output;
    messages.push(result.message);

    if (result.toolCalls.length === 0) {
      return { text: result.text, stopReason: 'done', steps: step, usage, messages };
    }

    // По одному: инструменты быстрые, а create_ticket не должен гоняться сам с собой.
    for (const call of result.toolCalls) {
      const toolResult = await toolbox.execute(call);
      messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult.content });
      onTool?.({ call, result: toolResult });
    }
    if (step >= HARD_STOP) {
      return { text: result.text, stopReason: 'max_steps', steps: step, usage, messages };
    }
  }
}
