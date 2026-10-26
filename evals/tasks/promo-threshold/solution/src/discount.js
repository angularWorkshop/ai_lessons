// Промокоды: скидка в процентах, если сумма заказа не меньше порога.
export const PROMOS = [
  { code: 'WELCOME', percent: 10, threshold: 1000 },
  { code: 'BIG', percent: 15, threshold: 5000 },
];

export function findPromo(code) {
  return PROMOS.find((promo) => promo.code === code.trim().toUpperCase());
}

export function applyPromo(sum, promo) {
  if (sum >= promo.threshold) {
    return Math.round(sum * (100 - promo.percent)) / 100;
  }
  return sum;
}
