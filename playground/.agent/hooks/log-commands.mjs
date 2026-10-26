// PostToolUse для run_command: каждая команда агента — строка в .agent/commands.log.
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export default async function logCommands({ args, root, result }) {
  const command = [args.command, ...(args.args ?? [])].join(' ');
  const status = result.content.split('\n').find((line) => /^(код выхода|завершена)/.test(line)) ?? result.content.split('\n')[0];
  await mkdir(path.join(root, '.agent'), { recursive: true });
  await appendFile(path.join(root, '.agent', 'commands.log'), `${new Date().toISOString()}  ${command}  → ${status}\n`);
}
