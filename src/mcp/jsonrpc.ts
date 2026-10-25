// JSON-RPC 2.0 поверх потока строк: одно сообщение — одна строка.
// На этом транспорте работает MCP по stdio.
import { LineBuffer } from '../llm.ts';

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  /** null — только в ответе на сообщение, id которого не удалось прочитать. */
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// Стандартные коды JSON-RPC 2.0.
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

// Ошибка, которую прислала другая сторона, или которую обработчик хочет отправить ей.
export class JsonRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is JsonRpcId => typeof value === 'string' || typeof value === 'number';

// Шаг 1: строка → сообщение. Всё, что не похоже на JSON-RPC 2.0, — ошибка с кодом из стандарта.
export function parseMessage(line: string): JsonRpcMessage {
  throw new Error('TODO: шаг 1');
}

// Шаг 2: сообщение → строка. JSON.stringify без отступов не пишет переводов строк:
// \n внутри строк он превращает в два символа «\» и «n». Поэтому одна строка — одно сообщение.
export function encodeMessage(message: JsonRpcMessage): string {
  throw new Error('TODO: шаг 2');
}

type Handler = (params: unknown) => unknown;

export interface PeerOptions {
  /** Сколько ждать ответа на request(), мс. По умолчанию 30 000. */
  timeoutMs?: number;
  /** Подсмотреть провод: каждая входящая (in) и исходящая (out) строка. */
  trace?: (direction: 'in' | 'out', line: string) => void;
}

export interface RequestOptions {
  timeoutMs?: number;
}

interface Pending {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// Локальная ошибка: её придумали мы, а не другая сторона. Поэтому это не JsonRpcError.
function localError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

// Шаги 3–5: равноправная сторона разговора. Обе стороны умеют и спрашивать, и отвечать.
export class JsonRpcPeer {
  readonly #output: NodeJS.WritableStream;
  readonly #options: PeerOptions;
  readonly #requestHandlers = new Map<string, Handler>();
  readonly #notificationHandlers = new Map<string, Handler>();
  readonly #pending = new Map<JsonRpcId, Pending>();
  readonly #lines = new LineBuffer();
  readonly #decoder = new TextDecoder();
  #nextId = 1;
  #closed = false;

  constructor(input: NodeJS.ReadableStream, output: NodeJS.WritableStream, options: PeerOptions = {}) {
    this.#output = output;
    this.#options = options;
    input.on('data', (chunk: Buffer | string) => this.#receive(chunk));
    input.on('end', () => this.close());
    input.on('error', () => this.close());
    // Другая сторона умерла, а мы пишем в её stdin: EPIPE не должен ронять процесс.
    output.on('error', () => this.close());
  }

  onRequest(method: string, handler: Handler): this {
    this.#requestHandlers.set(method, handler);
    return this;
  }

  onNotification(method: string, handler: Handler): this {
    this.#notificationHandlers.set(method, handler);
    return this;
  }

  get closed(): boolean {
    return this.#closed;
  }

  // Шаг 4
  request<T = unknown>(method: string, params?: unknown, options: RequestOptions = {}): Promise<T> {
    throw new Error('TODO: шаг 4');
  }

  notify(method: string, params?: unknown): void {
    throw new Error('TODO: шаг 4');
  }

  // Шаг 5: соединение закрыто — никто уже не ответит, будим всех, кто ждёт.
  close(): void {
    throw new Error('TODO: шаг 5');
  }

  #send(message: JsonRpcMessage): void {
    if (this.#closed) {
      return;
    }
    const line = encodeMessage(message);
    this.#options.trace?.('out', line.trimEnd());
    this.#output.write(line);
  }

  // Шаг 3: куски байтов → строки → сообщения.
  #receive(chunk: Buffer | string): void {
    throw new Error('TODO: шаг 3');
  }

  #dispatch(message: JsonRpcMessage): void {
    if (!('method' in message)) {
      this.#settle(message);
    } else if ('id' in message) {
      void this.#answer(message);
    } else {
      void this.#notice(message);
    }
  }

  // На уведомление не отвечают, даже ошибкой. Нет обработчика — просто пропускаем.
  async #notice(notification: JsonRpcNotification): Promise<void> {
    throw new Error('TODO: шаг 3');
  }

  // Входящий запрос: найти обработчик, дождаться его и отправить result или error с тем же id.
  async #answer(request: JsonRpcRequest): Promise<void> {
    throw new Error('TODO: шаг 3');
  }

  // Ответ на наш запрос: находим его по id. Опоздавшие и чужие ответы молча пропускаем.
  #settle(response: JsonRpcResponse): void {
    throw new Error('TODO: шаг 4');
  }
}

// Строка не разобралась, но вдруг из неё можно достать id, чтобы ошибку можно было сопоставить.
function readId(line: string): JsonRpcId | null {
  try {
    const data = JSON.parse(line);
    return isObject(data) && isId(data.id) ? data.id : null;
  } catch {
    return null;
  }
}
