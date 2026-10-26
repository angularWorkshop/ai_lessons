// Сумма позиций: цена × количество.
export function calc(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}
