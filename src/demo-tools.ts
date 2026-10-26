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

const CalculatorArgs = z.object({
  expression: z
    .string()
    .regex(/^[\d\s.+\-*/()]+$/, 'Только числа, пробелы, + - * / и скобки')
    .describe('Арифметическое выражение: числа, + - * / и скобки. Например: (2350 * 17) / 100'),
});

export const calculator: Tool<z.infer<typeof CalculatorArgs>> = {
  name: 'calculate',
  description: 'Точно вычисляет арифметическое выражение. Зови для любых вычислений, не считай в уме.',
  schema: CalculatorArgs,
  async run({ expression }) {
    // Схема пропускает только цифры, точку, пробелы, + - * / и скобки, так что выполнить строку как код безопасно.
    const value = Function(`"use strict"; return (${expression});`)() as number;
    if (!Number.isFinite(value)) {
      throw new Error(`Результат не число: ${value}`);
    }
    return String(value);
  },
};
