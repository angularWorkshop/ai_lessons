// Цикл агента: спросить модель → исполнить вызовы → вернуть результаты → спросить снова.
// Заканчивается, когда модель отвечает текстом, когда кончились шаги или когда провайдер упал.
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
  /** Сколько раз можно спросить модель. Последний запрос — без новых вызовов. */
  maxSteps: number;
  /** Тема 15.3: первый запрос — обязательно с вызовом инструмента. Без опции модель решает сама. */
  toolFirst?: boolean;
  onTool?: (event: ToolEvent) => void;
}

export interface LoopResult {
  text: string;
  stopReason: StopReason;
  steps: number;
  usage: Usage;
  messages: Message[];
}

export const FINAL_STEP_NOTE =
  'Шаги закончились, инструменты больше недоступны. Ответь клиенту по тому, что уже прочитал в базе, или честно скажи, что ответа не нашёл.';

export async function runLoop(question: string, options: LoopOptions): Promise<LoopResult> {
  const { provider, toolbox, system, maxSteps, toolFirst, onTool } = options;
  const tools = toolbox.specs();
  const messages: Message[] = [{ role: 'user', content: question }];
  const usage: Usage = { input: 0, output: 0 };

  for (let step = 1; ; step++) {
    // Последний шаг: модель подводит итог, а не обрывается на вызове.
    const last = step >= maxSteps;
    if (last) {
      messages.push({ role: 'user', content: FINAL_STEP_NOTE });
    }

    let result;
    try {
      // Первый шаг с toolFirst — 'required': ответить «из головы», не заглянув в базу, модель не может.
      const toolChoice = last ? 'none' : toolFirst && step === 1 ? 'required' : undefined;
      result = await provider.complete([{ role: 'system', content: system }, ...messages], {
        tools,
        ...(toolChoice ? { toolChoice } : {}),
      });
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error), stopReason: 'error', steps: step, usage, messages };
    }

    usage.input += result.usage.input;
    usage.output += result.usage.output;
    messages.push(result.message);

    if (result.toolCalls.length === 0) {
      return { text: result.text, stopReason: last ? 'max_steps' : 'done', steps: step, usage, messages };
    }

    // По одному: инструменты быстрые, а create_ticket не должен гоняться сам с собой.
    for (const call of result.toolCalls) {
      // На последнем шаге вызовы не исполняем, но ответ на каждый в истории всё равно нужен.
      const toolResult: ToolResult = last
        ? { content: 'Ошибка: вызов не выполнен — шаги агента закончились.', isError: true }
        : await toolbox.execute(call);
      messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult.content });
      onTool?.({ call, result: toolResult });
    }
    if (last) {
      return { text: result.text, stopReason: 'max_steps', steps: step, usage, messages };
    }
  }
}
