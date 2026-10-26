// Медленный инструмент для опытов с прерыванием: остальные демо-инструменты отвечают мгновенно.
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Tool } from './tools.ts';

const WaitArgs = z.object({
  seconds: z.number().min(1).max(60).describe('Сколько секунд ждать, от 1 до 60'),
});

export const wait: Tool<z.infer<typeof WaitArgs>> = {
  name: 'wait',
  description: 'Подождать указанное число секунд. Зови, когда пользователь просит подождать или сделать паузу.',
  schema: WaitArgs,
  async run({ seconds }, ctx) {
    // Вежливый инструмент: передаёт signal дальше, и ожидание обрывается сразу после Esc.
    await delay(seconds * 1000, undefined, { signal: ctx.signal });
    return `Прошло ${seconds} с`;
  },
};
