import { sumPrices } from './math.js';

export function cartTotal(cart) {
  return sumPrices(cart.items);
}
