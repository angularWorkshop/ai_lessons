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
  throw new Error('TODO: шаг 1 — прочитай настройки из env');
}

// Шаги 2–4
export async function chat(config: LlmConfig, messages: Message[], options: ChatOptions = {}): Promise<ChatResult> {
  throw new Error('TODO: шаги 2–4 — отправь запрос и разбери ответ');
}

// Шаг 5
export function estimateCost(usage: Usage, price: Price): number {
  throw new Error('TODO: шаг 5 — посчитай стоимость');
}
