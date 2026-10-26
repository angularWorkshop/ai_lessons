// Три инструмента агента поддержки. Это и есть весь его доступ к миру:
// искать и читать базу знаний и завести одно обращение. Ни записи файлов, ни команд.
// В теме 15.1 — только то, что видит модель: имя, описание, схема. Работу инструменты получат в 15.2.
import { z } from 'zod';
import type { Ticket } from './tickets.ts';
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
  const searchKb: Tool<z.infer<typeof SearchArgs>> = {
    name: 'search_kb',
    description: 'Ищет статьи базы знаний по словам. Возвращает до 5 статей: путь, заголовок и строку, где нашлись слова.',
    schema: SearchArgs,
    async run() {
      throw new Error('TODO: тема 15.2, шаг 1');
    },
  };

  const readArticle: Tool<z.infer<typeof ReadArgs>> = {
    name: 'read_article',
    description: 'Читает статью базы знаний целиком. Отвечать клиенту можно только по прочитанным статьям.',
    schema: ReadArgs,
    async run() {
      throw new Error('TODO: тема 15.2, шаг 1');
    },
  };

  const createTicketTool: Tool<z.infer<typeof TicketArgs>> = {
    name: 'create_ticket',
    description: 'Передаёт вопрос специалисту поддержки: заводит обращение и возвращает его номер. Одно обращение на вопрос.',
    schema: TicketArgs,
    async run() {
      throw new Error('TODO: тема 15.2, шаг 4');
    },
  };

  return [searchKb, readArticle, createTicketTool];
}
