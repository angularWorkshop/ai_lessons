// Клиент к LLM в формате Chat Completions.
// С этого файла начинается наш агент: дальше по курсу он будет только расти.

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface Usage {
  input: number;
  output: number;
}

export interface ChatResult {
  text: string;
  finishReason: string;
  truncated: boolean;
  usage: Usage;
}

export interface Price {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Та часть ответа API, которая нам нужна. Остальные поля просто не описываем.
interface ChatCompletionResponse {
  choices: {
    message: { role: 'assistant'; content: string | null };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 1024;

// Шаг 1
export function loadConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Не задана переменная окружения ${name}`);
    }
    return value;
  };

  return {
    baseUrl: read('LLM_BASE_URL').replace(/\/+$/, ''),
    apiKey: read('LLM_API_KEY'),
    model: read('LLM_MODEL'),
  };
}

// Шаги 2–4
export async function chat(config: LlmConfig, messages: Message[], options: ChatOptions = {}): Promise<ChatResult> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API ответил ${response.status}: ${body}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const choice = data.choices[0];

  return {
    text: choice.message.content ?? '',
    finishReason: choice.finish_reason,
    truncated: choice.finish_reason === 'length',
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
  };
}

// Шаг 5
export function estimateCost(usage: Usage, price: Price): number {
  return (usage.input * price.inputPerMillion + usage.output * price.outputPerMillion) / 1_000_000;
}
