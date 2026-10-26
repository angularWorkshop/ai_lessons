// Три инструмента агента поддержки. Это и есть весь его доступ к миру:
// искать и читать базу знаний и завести одно обращение. Ни записи файлов, ни команд.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { loadArticles, resolveArticle, searchArticles } from './kb.ts';
import { createTicket, type Ticket } from './tickets.ts';
import type { Tool } from './tools.ts';

/** Состояние одного прогона: что модель прочитала и завела ли обращение. На каждый вопрос — новое. */
export interface RunState {
  question: string;
  read: Set<string>;
  ticket?: Ticket;
}

const SearchArgs = z.object({
  query: z.string().min(1).describe('Слова для поиска, например «вернуть деньги подписка»'),
});

const ReadArgs = z.object({
  path: z.string().describe('Путь статьи из результатов search_kb, например billing/refund.md'),
});

const TicketArgs = z.object({
  summary: z.string().min(10).max(500).describe('Суть проблемы для специалиста: что случилось и что клиент уже пробовал'),
  priority: z.enum(['normal', 'urgent']).describe('urgent — доступ к аккаунту захвачен чужим человеком; остальное — normal'),
});

export function supportTools(dataDir: string, state: RunState): Tool[] {
  const kbDir = path.join(dataDir, 'kb');
  const ticketsDir = path.join(dataDir, 'tickets');

  const searchKb: Tool<z.infer<typeof SearchArgs>> = {
    name: 'search_kb',
    description: 'Ищет статьи базы знаний по словам. Возвращает до 5 статей: путь, заголовок и строку, где нашлись слова.',
    schema: SearchArgs,
    async run({ query }) {
      const hits = searchArticles(await loadArticles(kbDir), query);
      if (hits.length === 0) {
        return `Ничего не найдено по запросу «${query}». Попробуй другие слова: синонимы, меньше слов.`;
      }
      const lines = hits.map((hit) => `${hit.id} — ${hit.title}\n  ${hit.snippet}`);
      return `Найдено статей: ${hits.length}. Открой подходящие через read_article.\n\n${lines.join('\n')}`;
    },
  };

  const readArticle: Tool<z.infer<typeof ReadArgs>> = {
    name: 'read_article',
    description: 'Читает статью базы знаний целиком. Отвечать клиенту можно только по прочитанным статьям.',
    schema: ReadArgs,
    async run(args) {
      const { id, file } = await resolveArticle(kbDir, args.path);
      const text = await readFile(file, 'utf8');
      state.read.add(id);
      return `Статья ${id}:\n\n${text}`;
    },
  };

  const createTicketTool: Tool<z.infer<typeof TicketArgs>> = {
    name: 'create_ticket',
    description: 'Передаёт вопрос специалисту поддержки: заводит обращение и возвращает его номер. Одно обращение на вопрос.',
    schema: TicketArgs,
    async run({ summary, priority }) {
      if (state.ticket) {
        throw new Error(`обращение ${state.ticket.id} уже создано. Второе не нужно — сообщи клиенту номер ${state.ticket.id}`);
      }
      state.ticket = await createTicket(ticketsDir, { summary, priority, question: state.question });
      return `Обращение ${state.ticket.id} создано, специалист продолжит по нему. Сообщи клиенту номер ${state.ticket.id}.`;
    },
  };

  return [searchKb, readArticle, createTicketTool];
}
