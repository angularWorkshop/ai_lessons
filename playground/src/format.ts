// Цена для чека: 1350 → «1 350 ₽», 99.5 → «99,50 ₽».

export function formatPrice(value: number): string {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(2);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${fraction ? `${grouped},${fraction}` : grouped} ₽`;
}
