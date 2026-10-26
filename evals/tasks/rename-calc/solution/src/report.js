import { sumPrices } from './math.js';

// Строка отчёта на каждый заказ: «A-1: 1500».
export function report(orders) {
  return orders.map((order) => `${order.id}: ${sumPrices(order.items)}`).join('\n');
}
