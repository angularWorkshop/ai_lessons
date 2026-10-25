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
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    throw new JsonRpcError(ErrorCode.ParseError, 'Parse error');
  }
  if (!isObject(data) || data.jsonrpc !== '2.0') {
    throw new JsonRpcError(ErrorCode.InvalidRequest, 'Invalid Request');
  }
  if (data.params !== undefined && (typeof data.params !== 'object' || data.params === null)) {
    throw new JsonRpcError(ErrorCode.InvalidRequest, 'Invalid Request: params должен быть объектом или массивом');
  }

  if (typeof data.method === 'string') {
    if (!('id' in data)) {
      return data as unknown as JsonRpcNotification;
    }
    // В MCP id запроса — строка или число, null запрещён.
    if (!isId(data.id)) {
      throw new JsonRpcError(ErrorCode.InvalidRequest, 'Invalid Request: id должен быть строкой или числом');
    }
    return data as unknown as JsonRpcRequest;
  }

  const hasError = isObject(data.error) && typeof data.error.code === 'number' && typeof data.error.message === 'string';
  if (('result' in data || hasError) && (isId(data.id) || data.id === null)) {
    return data as unknown as JsonRpcResponse;
  }
  throw new JsonRpcError(ErrorCode.InvalidRequest, 'Invalid Request');
}

// Шаг 2: сообщение → строка. JSON.stringify без отступов не пишет переводов строк:
// \n внутри строк он превращает в два символа «\» и «n». Поэтому одна строка — одно сообщение.
export function encodeMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message) + '\n';
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
    if (this.#closed) {
      return Promise.reject(localError('ConnectionClosedError', `${method}: соединение закрыто`));
    }
    const id = this.#nextId++;
    const timeoutMs = options.timeoutMs ?? this.#options.timeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(localError('TimeoutError', `${method}: нет ответа за ${timeoutMs} мс`));
      }, timeoutMs);
      this.#pending.set(id, { method, resolve: resolve as (result: unknown) => void, reject, timer });
      this.#send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
    this.#send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  // Шаг 5: соединение закрыто — никто уже не ответит, будим всех, кто ждёт.
  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(localError('ConnectionClosedError', `${pending.method}: соединение закрыто`));
      this.#pending.delete(id);
    }
    this.#output.end();
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
    const text = typeof chunk === 'string' ? chunk : this.#decoder.decode(chunk, { stream: true });
    for (const line of this.#lines.push(text)) {
      if (line.trim() === '') {
        continue;
      }
      this.#options.trace?.('in', line);
      let message: JsonRpcMessage;
      try {
        message = parseMessage(line);
      } catch (error) {
        const { code, message: text } = error as JsonRpcError;
        this.#send({ jsonrpc: '2.0', id: readId(line), error: { code, message: text } });
        continue;
      }
      this.#dispatch(message);
    }
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
    try {
      await this.#notificationHandlers.get(notification.method)?.(notification.params);
    } catch {
      // Упавший обработчик уведомления не должен ронять чтение.
    }
  }

  // Входящий запрос: найти обработчик, дождаться его и отправить result или error с тем же id.
  async #answer(request: JsonRpcRequest): Promise<void> {
    const handler = this.#requestHandlers.get(request.method);
    if (!handler) {
      this.#send({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: ErrorCode.MethodNotFound, message: `Method not found: ${request.method}` },
      });
      return;
    }
    try {
      const result = await handler(request.params);
      this.#send({ jsonrpc: '2.0', id: request.id, result: result ?? null });
    } catch (error) {
      const failure: JsonRpcErrorObject =
        error instanceof JsonRpcError
          ? { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) }
          : { code: ErrorCode.InternalError, message: (error as Error)?.message ?? String(error) };
      this.#send({ jsonrpc: '2.0', id: request.id, error: failure });
    }
  }

  // Ответ на наш запрос: находим его по id. Опоздавшие и чужие ответы молча пропускаем.
  #settle(response: JsonRpcResponse): void {
    const pending = response.id === null ? undefined : this.#pending.get(response.id);
    if (!pending || response.id === null) {
      return;
    }
    this.#pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) {
      pending.reject(new JsonRpcError(response.error.code, response.error.message, response.error.data));
    } else {
      pending.resolve(response.result);
    }
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
