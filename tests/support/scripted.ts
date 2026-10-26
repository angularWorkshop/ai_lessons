// Заготовленная «модель» для тестов: отвечает по сценарию и запоминает каждый запрос.
// Совместима с Provider курса: complete(messages, options) → ChatResult. Сеть не нужна.

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatResult {
  text: string;
  finishReason: string;
  truncated: boolean;
  usage: { input: number; output: number };
  toolCalls: ToolCall[];
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  };
}

/** Сообщение, как его видит тест. */
export interface SeenMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
}

export interface SeenRequest {
  messages: SeenMessage[];
  options: {
    tools?: { type: string; function: { name: string; description: string; parameters: any } }[];
    toolChoice?: string;
  };
}

export type ScriptStep = ChatResult | Error;

let nextId = 0;

export function textReply(text: string, usage = { input: 100, output: 20 }): ChatResult {
  return { text, finishReason: 'stop', truncated: false, usage, toolCalls: [], message: { role: 'assistant', content: text } };
}

/** args — объект (станет JSON) или сырая строка: так пишут сломанный JSON. */
export function toolReply(calls: { name: string; args?: unknown }[], usage = { input: 100, output: 20 }): ChatResult {
  const toolCalls = calls.map((call) => ({
    id: `call_${++nextId}`,
    name: call.name,
    arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args ?? {}),
  }));
  return {
    text: '',
    finishReason: 'tool_calls',
    truncated: false,
    usage,
    toolCalls,
    message: {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
    },
  };
}

export class ScriptedProvider {
  readonly requests: SeenRequest[] = [];
  readonly #script: ScriptStep[];

  constructor(script: ScriptStep[]) {
    this.#script = [...script];
  }

  get remaining(): number {
    return this.#script.length;
  }

  async complete(messages: any[], options: any): Promise<ChatResult> {
    this.requests.push({ messages: structuredClone(messages), options: { ...options } });
    const step = this.#script.shift();
    if (!step) {
      throw new Error(`ScriptedProvider: агент сделал запрос №${this.requests.length}, а ответов в сценарии меньше`);
    }
    if (step instanceof Error) {
      throw step;
    }
    return step;
  }
}

/** Результат инструмента, который агент вернул модели на вызов с этим id. */
export function toolMessage(request: SeenRequest, callId: string): string {
  const message = request.messages.find((item) => item.role === 'tool' && item.tool_call_id === callId);
  if (!message) {
    throw new Error(`в запросе нет сообщения tool для ${callId}`);
  }
  return String(message.content);
}
