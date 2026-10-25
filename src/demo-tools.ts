// Два простых инструмента. На них проверяем реестр, пока не написаны инструменты для кода (секция 5).
import { z } from 'zod';
import type { Tool } from './tools.ts';

const CurrentTimeArgs = z.object({
  timezone: z.string().describe('Часовой пояс IANA, например Europe/Moscow или Asia/Tokyo'),
});

export const currentTime: Tool<z.infer<typeof CurrentTimeArgs>> = {
  name: 'get_current_time',
  description: 'Текущие дата и время в указанном часовом поясе. Сама модель времени не знает — спрашивай здесь.',
  schema: CurrentTimeArgs,
  async run({ timezone }) {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  },
};

// TODO: шаг 3 — допиши схему: только числа, пробелы, точка, + - * / и скобки, и описание для модели.
const CalculatorArgs = z.object({
  expression: z.string(),
});

export const calculator: Tool<z.infer<typeof CalculatorArgs>> = {
  name: 'calculate',
  description: 'Точно вычисляет арифметическое выражение. Зови для любых вычислений, не считай в уме.',
  schema: CalculatorArgs,
  async run({ expression }) {
    throw new Error('TODO: шаг 3 — посчитай выражение');
  },
};
