// Запустить программу дочерним процессом и говорить с ней по JSON-RPC через её stdin/stdout.
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JsonRpcPeer, type PeerOptions } from './jsonrpc.ts';

export interface SpawnedPeer {
  peer: JsonRpcPeer;
  child: ChildProcess;
  /** Закрыть stdin и дождаться выхода. Не вышел за graceMs — SIGTERM. Возвращает код выхода. */
  stop(graceMs?: number): Promise<number | null>;
}

export function spawnPeer(command: string, args: string[], options: PeerOptions & { cwd?: string } = {}): SpawnedPeer {
  // stdin и stdout — канал для сообщений. stderr — для логов: пусть идёт прямо в наш терминал.
  const child = spawn(command, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'inherit'] });
  const peer = new JsonRpcPeer(child.stdout!, child.stdin!, options);
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  child.once('error', () => peer.close());

  async function stop(graceMs = 2000): Promise<number | null> {
    child.stdin!.end(); // для ребёнка конец stdin — сигнал «пора выходить»
    const timer = setTimeout(() => child.kill('SIGTERM'), graceMs);
    const code = await exited;
    clearTimeout(timer);
    return code;
  }

  return { peer, child, stop };
}

// TypeScript-файл проекта запускаем так же, как раннер проверки: node + CLI tsx.
const TSX_CLI = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

export function spawnTsPeer(script: string, args: string[] = [], options: PeerOptions & { cwd?: string } = {}): SpawnedPeer {
  return spawnPeer(process.execPath, [TSX_CLI, script, ...args], options);
}
