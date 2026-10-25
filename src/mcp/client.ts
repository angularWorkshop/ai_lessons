// MCP-клиент: одно соединение с одним сервером. Понимает обе эпохи протокола:
// 2026-07-28 (server/discover и _meta в каждом запросе) и 2025-11-25 (рукопожатие initialize).
import { serverEnv, type McpServerConfig } from './config.ts';
import { JsonRpcError, type JsonRpcPeer, type PeerOptions } from './jsonrpc.ts';
import { LEGACY_PROTOCOL_VERSION, META, PROTOCOL_VERSION, type ServerInfo } from './server.ts';
import { spawnPeer } from './spawn.ts';

export const CLIENT_INFO = { name: 'edutec-agent', version: '1.0.0' };

/** Версии с рукопожатием, которые клиент понимает. Для tools/list и tools/call разницы между ними почти нет. */
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** Инструмент чужого сервера. inputSchema — любая JSON Schema: проверять по ней аргументы будет сервер. */
export interface RemoteTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** Кусок результата. Кроме text бывают image, audio, resource_link и resource. */
export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolCallResult {
  content: ContentBlock[];
  isError?: boolean;
}

export interface CallOptions {
  /** Отмена: агент остановлен, ждать ответа больше не нужно. */
  signal?: AbortSignal;
}

interface DiscoverResult {
  supportedVersions?: string[];
  instructions?: string;
  _meta?: Record<string, unknown>;
}

interface InitializeResult {
  protocolVersion: string;
  serverInfo?: ServerInfo;
  instructions?: string;
}

export class McpClient {
  /** Имя сервера из mcp.json. С него начинаются имена его инструментов у агента. */
  readonly name: string;
  readonly #peer: JsonRpcPeer;
  readonly #stop: () => Promise<number | null>;
  #version: string | undefined;
  #legacy = false;
  serverInfo: ServerInfo | undefined;
  instructions: string | undefined;

  /** stop — как остановить сервер. Для процесса это stop() из spawn.ts, в тестах хватит закрыть peer. */
  constructor(name: string, peer: JsonRpcPeer, stop?: () => Promise<number | null>) {
    this.name = name;
    this.#peer = peer;
    this.#stop = stop ?? (async () => (peer.close(), null));
  }

  /** Версия протокола, о которой договорились. undefined — connect() ещё не было. */
  get protocolVersion(): string | undefined {
    return this.#version;
  }

  /** true — сервер старый: разговор начался с initialize, _meta в запросах не нужен. */
  get legacy(): boolean {
    return this.#legacy;
  }

  // Шаг 1: сначала спрашиваем по-новому. Старый сервер не знает server/discover — тогда рукопожатие.
  async connect(): Promise<this> {
    throw new Error('TODO: шаг 1');
  }

  async #initialize(): Promise<this> {
    throw new Error('TODO: шаг 1');
  }

  // Шаг 2: список может прийти страницами. Пока есть nextCursor — просим следующую.
  async listTools(): Promise<RemoteTool[]> {
    throw new Error('TODO: шаг 2');
  }

  // Шаг 2: ошибка протокола бросается (JsonRpcError), ошибка инструмента приходит результатом с isError.
  async callTool(name: string, args: Record<string, unknown>, options: CallOptions = {}): Promise<ToolCallResult> {
    throw new Error('TODO: шаг 2');
  }

  /** Остановить сервер. Возвращает код выхода процесса. */
  close(): Promise<number | null> {
    return this.#stop();
  }

  // Новый сервер ждёт _meta в каждом запросе, старый после initialize помнит версию сам.
  #request<T>(method: string, params: Record<string, unknown>, options: CallOptions = {}): Promise<T> {
    if (!this.#version) {
      return Promise.reject(new Error(`MCP-сервер ${this.name}: сначала connect()`));
    }
    return this.#peer.request<T>(method, this.#legacy ? params : { ...params, _meta: this.#meta() }, options);
  }

  #meta(): Record<string, unknown> {
    return {
      [META.protocolVersion]: PROTOCOL_VERSION,
      [META.clientInfo]: CLIENT_INFO,
      [META.clientCapabilities]: {},
    };
  }
}

export interface ConnectOptions {
  /** Папка, из которой запускать серверы без своего cwd. По умолчанию — текущая. */
  cwd?: string;
  /** Сколько ждать ответа сервера, мс. */
  timeoutMs?: number;
  /** Сколько ждать выхода после закрытия stdin, прежде чем слать SIGTERM, и ещё столько же до SIGKILL. */
  graceMs?: number;
  trace?: PeerOptions['trace'];
}

// Шаг 5: поднять сервер из mcp.json дочерним процессом и подключиться к нему.
export async function connectStdio(name: string, config: McpServerConfig, options: ConnectOptions = {}): Promise<McpClient> {
  throw new Error('TODO: шаг 5');
}
