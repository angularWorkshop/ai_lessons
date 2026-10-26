// Запустить программу дочерним процессом и говорить с ней по JSON-RPC через её stdin/stdout.
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JsonRpcPeer, type PeerOptions } from './jsonrpc.ts';

export interface SpawnedPeer {
  peer: JsonRpcPeer;
  child: ChildProcess;
  /**
   * Закрыть stdin и дождаться выхода. Не вышел за graceMs — SIGTERM, ещё через graceMs — SIGKILL.
   * Возвращает код выхода: null, если процесс убит сигналом или так и не запустился.
   */
  stop(graceMs?: number): Promise<number | null>;
}

export interface SpawnOptions extends PeerOptions {
  cwd?: string;
  /** Окружение ребёнка. Не задано — весь process.env родителя. Для чужих серверов так не надо (тема 11.3). */
  env?: NodeJS.ProcessEnv;
}

export function spawnPeer(command: string, args: string[], options: SpawnOptions = {}): SpawnedPeer {
  // stdin и stdout — канал для сообщений. stderr — для логов: пусть идёт прямо в наш терминал.
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'inherit'] });
  const peer = new JsonRpcPeer(child.stdout!, child.stdin!, options);
  // Команда не нашлась (ENOENT) — придёт только error, без exit. Ждать выхода тогда нечего.
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });
  child.once('error', () => peer.close());

  async function stop(graceMs = 2000): Promise<number | null> {
    child.stdin!.end(); // для ребёнка конец stdin — сигнал «пора выходить»
    const term = setTimeout(() => child.kill('SIGTERM'), graceMs);
    // SIGTERM процесс может перехватить и не выйти. SIGKILL перехватить нельзя.
    const kill = setTimeout(() => child.kill('SIGKILL'), graceMs * 2);
    const code = await exited;
    clearTimeout(term);
    clearTimeout(kill);
    return code;
  }

  return { peer, child, stop };
}

// TypeScript-файл проекта запускаем так же, как раннер проверки: node + CLI tsx.
const TSX_CLI = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

export function spawnTsPeer(script: string, args: string[] = [], options: SpawnOptions = {}): SpawnedPeer {
  return spawnPeer(process.execPath, [TSX_CLI, script, ...args], options);
}
