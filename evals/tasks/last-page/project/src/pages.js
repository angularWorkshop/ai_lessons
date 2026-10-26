// Постраничный вывод заказов: сколько всего страниц и что на странице с номером number (с 1).
export function pageCount(total, size) {
  return Math.floor(total / size);
}

export function page(items, number, size) {
  if (number < 1 || number > pageCount(items.length, size)) {
    return [];
  }
  const start = (number - 1) * size;
  return items.slice(start, start + size);
}
