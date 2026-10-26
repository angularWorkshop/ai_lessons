// Тикеты: по JSON-файлу на обращение в data/tickets. Номер и путь выбирает harness, а не модель.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type Priority = 'normal' | 'urgent';

export interface Ticket {
  id: string;
  status: 'open';
  priority: Priority;
  /** Суть для специалиста — её пишет модель. */
  summary: string;
  /** Вопрос клиента дословно — его кладёт harness. */
  question: string;
  createdAt: string;
}

const FIRST_NUMBER = 1001;

// T-1041.json, T-1042.json → T-1043. Папки нет или она пустая → T-1001.
export async function nextTicketId(dir: string): Promise<string> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const numbers = names.map((name) => /^T-(\d+)\.json$/.exec(name)?.[1]).filter((n) => n !== undefined).map(Number);
  return `T-${Math.max(FIRST_NUMBER - 1, ...numbers) + 1}`;
}

export async function createTicket(dir: string, fields: Pick<Ticket, 'priority' | 'summary' | 'question'>): Promise<Ticket> {
  await mkdir(dir, { recursive: true });
  const ticket: Ticket = { id: await nextTicketId(dir), status: 'open', ...fields, createdAt: new Date().toISOString() };
  // wx — не перезаписывать: если файл с таким номером уже есть, лучше упасть, чем потерять чужое обращение.
  await writeFile(path.join(dir, `${ticket.id}.json`), `${JSON.stringify(ticket, null, 2)}\n`, { flag: 'wx' });
  return ticket;
}
