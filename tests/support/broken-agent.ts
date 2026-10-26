// Сломанные агенты для проверки твоих сценариев. Каждый — цикл из темы 4.2 с одной ошибкой.
// Хороший сценарий проходит на настоящем Agent и падает на сломанном. Этот файл не меняй.
import { DEFAULT_MAX_STEPS, FINAL_STEP_NOTE, MAX_REPEATS, skippedResult, type AgentOptions, type AgentRun, type StopReason } from '../../src/agent.ts';
import type { ChatResult, Message, ToolCall } from '../../src/llm.ts';
import type { MakeAgent } from '../agent-scenarios.ts';

export type Bug =
  | 'no-system' // не отправляет system prompt
  | 'no-tool-results' // исполняет вызовы, но не кладёт результаты в историю
  | 'wrong-tool-id' // кладёт результат с tool_call_id = имя инструмента
  | 'tools-before-assistant' // кладёт результаты раньше ответа модели с tool_calls
  | 'no-step-limit' // не знает про maxSteps
  | 'no-final-summary' // предохранитель из 4.1: обрывает после вызова, без последнего запроса без инструментов
  | 'no-repeat-guard' // не замечает одинаковых вызовов
  | 'repeat-by-name' // считает повтором тот же инструмент даже с другими аргументами
  | 'ignores-truncated' // не смотрит на truncated
  | 'truncated-loses-history'; // останавливается на truncated, но оставляет вызов без результата

export function brokenAgent(bug: Bug): MakeAgent {
  return (options) => ({ run: (task, history = []) => runBroken(bug, options, task, history) });
}

async function runBroken(bug: Bug, options: AgentOptions, task: string, history: Message[]): Promise<AgentRun> {
  const { provider, toolbox, system, limits = {}, signal, temperature, onEvent } = options;
  // Без лимита шагов — но не бесконечно: 50 запросов хватит, чтобы любой сценарий это заметил.
  const maxSteps = bug === 'no-step-limit' ? 50 : (limits.maxSteps ?? DEFAULT_MAX_STEPS);
  const maxTokens = limits.maxTokens ?? Infinity;
  const tools = toolbox.specs();
  const messages: Message[] = [...history, { role: 'user', content: task }];
  const usage = { input: 0, output: 0 };
  let answer = '';
  let steps = 0;
  let lastKey = '';
  let repeats = 0;

  const stop = (reason: StopReason): AgentRun => {
    onEvent?.({ type: 'stop', reason });
    return { answer, stopReason: reason, steps, usage, messages };
  };
  const skip = (calls: ToolCall[], reason: string, keepHistory = true) => {
    for (const call of calls) {
      const result = skippedResult(reason);
      onEvent?.({ type: 'tool_result', call, result });
      if (keepHistory) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      return stop('aborted');
    }
    if (usage.input + usage.output >= maxTokens) {
      return stop('budget');
    }
    steps++;
    onEvent?.({ type: 'step', step: steps });

    const last = bug !== 'no-final-summary' && steps >= maxSteps;
    if (last) {
      messages.push({ role: 'user', content: FINAL_STEP_NOTE });
    }
    const sent: Message[] = bug === 'no-system' ? [...messages] : [{ role: 'system', content: system }, ...messages];

    let result: ChatResult;
    try {
      result = await provider.complete(sent, {
        tools,
        ...(last && tools.length > 0 ? { toolChoice: 'none' as const } : {}),
        signal,
        temperature,
      });
    } catch (error) {
      if (signal?.aborted) {
        return stop('aborted');
      }
      answer = error instanceof Error ? error.message : String(error);
      return stop('error');
    }

    usage.input += result.usage.input;
    usage.output += result.usage.output;
    answer = result.text;
    const calls = result.toolCalls;
    const deferAssistant = bug === 'tools-before-assistant' && calls.length > 0 && !result.truncated && !last;
    if (!deferAssistant) {
      messages.push(result.message);
    }
    onEvent?.({ type: 'assistant', message: result.message, usage: result.usage });

    if (result.truncated && bug !== 'ignores-truncated') {
      skip(calls, 'ответ модели обрезан по max_tokens', bug !== 'truncated-loses-history');
      return stop('truncated');
    }
    if (calls.length === 0) {
      return stop(last ? 'max_steps' : 'done');
    }
    if (last) {
      skip(calls, 'шаги агента закончились');
      return stop('max_steps');
    }
    if (bug !== 'no-repeat-guard') {
      const looping = calls.some((call) => {
        const key = bug === 'repeat-by-name' ? call.name : `${call.name} ${normalize(call.arguments)}`;
        repeats = key === lastKey ? repeats + 1 : 1;
        lastKey = key;
        return repeats >= MAX_REPEATS;
      });
      if (looping) {
        if (deferAssistant) {
          messages.push(result.message);
        }
        skip(calls, 'модель повторяет один и тот же вызов');
        return stop('repeated_call');
      }
    }

    const results: Message[] = [];
    for (const call of calls) {
      if (signal?.aborted) {
        results.push({ role: 'tool', tool_call_id: call.id, content: skippedResult('агент остановлен').content });
        continue;
      }
      onEvent?.({ type: 'tool_call', call });
      const toolResult = await toolbox.execute(call, { signal });
      onEvent?.({ type: 'tool_result', call, result: toolResult });
      results.push({ role: 'tool', tool_call_id: bug === 'wrong-tool-id' ? call.name : call.id, content: toolResult.content });
    }
    if (bug !== 'no-tool-results') {
      messages.push(...results);
    }
    if (deferAssistant) {
      messages.push(result.message);
    }

    if (bug === 'no-final-summary' && steps >= maxSteps) {
      return stop('max_steps');
    }
  }
}

function normalize(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args));
  } catch {
    return args.trim();
  }
}
