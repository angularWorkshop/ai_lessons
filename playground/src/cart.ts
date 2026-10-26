// Корзина: позиции, сумма и сумма с промокодом.
import { applyPromo, findPromo } from './discount.ts';

export interface Item {
  name: string;
  /** Цена за штуку, в рублях. */
  price: number;
  qty: number;
}

export function subtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function total(items: Item[], promoCode?: string): number {
  const sum = subtotal(items);
  if (!promoCode) {
    return sum;
  }
  const promo = findPromo(promoCode);
  if (!promo) {
    throw new Error(`Промокод ${promoCode} не найден`);
  }
  return applyPromo(sum, promo);
}
