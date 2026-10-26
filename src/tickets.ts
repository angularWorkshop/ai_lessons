// Тикеты: по JSON-файлу на обращение в data/tickets. Номер и путь выбирает harness, а не модель.
// В теме 15.1 — только формат. Запись появится в 15.2.

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
