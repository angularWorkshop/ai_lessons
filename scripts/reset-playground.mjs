// npm run reset-playground — вернуть playground/ в исходный вид: с багом и падающим тестом.
// Агент правит файлы по-настоящему. После демо запусти это, чтобы повторить его ещё раз.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILES = {
  "README.md": "# Корзина магазина\n\nМаленький проект, в котором работает наш агент. `npm test` — тесты корзины.\n\n- `src/cart.ts` — сумма корзины с промокодом;\n- `src/discount.ts` — правила скидок;\n- `src/format.ts` — цена для чека: «1 350 ₽».\n",
  "package.json": "{\n  \"name\": \"playground\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"test\": \"tsx --test tests/cart.test.ts\"\n  }\n}\n",
  "src/cart.ts": "// Корзина: позиции, сумма и сумма с промокодом.\nimport { applyPromo, findPromo } from './discount.ts';\n\nexport interface Item {\n  name: string;\n  /** Цена за штуку, в рублях. */\n  price: number;\n  qty: number;\n}\n\nexport function subtotal(items: Item[]): number {\n  return items.reduce((sum, item) => sum + item.price * item.qty, 0);\n}\n\nexport function total(items: Item[], promoCode?: string): number {\n  const sum = subtotal(items);\n  if (!promoCode) {\n    return sum;\n  }\n  const promo = findPromo(promoCode);\n  if (!promo) {\n    throw new Error(`Промокод ${promoCode} не найден`);\n  }\n  return applyPromo(sum, promo);\n}\n",
  "src/discount.ts": "// Промокоды магазина: скидка в процентах, если сумма заказа не меньше порога.\n\nexport interface Promo {\n  code: string;\n  /** Скидка в процентах: 10 — это 10%. */\n  percent: number;\n  /** Скидка действует, если сумма заказа не меньше порога, в рублях. */\n  threshold: number;\n}\n\nexport const PROMOS: Promo[] = [\n  { code: 'WELCOME', percent: 10, threshold: 1000 },\n  { code: 'BIG', percent: 15, threshold: 5000 },\n];\n\nexport function findPromo(code: string): Promo | undefined {\n  return PROMOS.find((promo) => promo.code === code.trim().toUpperCase());\n}\n\nexport function applyPromo(sum: number, promo: Promo): number {\n  if (sum > promo.threshold) {\n    return Math.round(sum * (100 - promo.percent)) / 100;\n  }\n  return sum;\n}\n",
  "src/format.ts": "// Цена для чека: 1350 → «1 350 ₽», 99.5 → «99,50 ₽».\n\nexport function formatPrice(value: number): string {\n  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(2);\n  const [whole, fraction] = fixed.split('.');\n  const grouped = whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');\n  return `${fraction ? `${grouped},${fraction}` : grouped} ₽`;\n}\n",
  "tests/cart.test.ts": "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { subtotal, total, type Item } from '../src/cart.ts';\nimport { formatPrice } from '../src/format.ts';\n\nconst book: Item = { name: 'Книга', price: 500, qty: 1 };\nconst lamp: Item = { name: 'Лампа', price: 1000, qty: 1 };\n\ntest('сумма корзины', () => {\n  assert.equal(subtotal([book, { ...lamp, qty: 2 }]), 2500);\n});\n\ntest('без промокода — просто сумма', () => {\n  assert.equal(total([book, lamp]), 1500);\n});\n\ntest('WELCOME: 10% от 1500 ₽', () => {\n  assert.equal(total([book, lamp], 'WELCOME'), 1350);\n});\n\ntest('WELCOME: меньше 1000 ₽ — без скидки', () => {\n  assert.equal(total([book], 'WELCOME'), 500);\n});\n\ntest('WELCOME: ровно 1000 ₽ — скидка уже действует', () => {\n  assert.equal(total([{ ...book, qty: 2 }], 'welcome'), 900);\n});\n\ntest('неизвестный промокод — ошибка', () => {\n  assert.throws(() => total([book], 'FREE'), /не найден/);\n});\n\ntest('цена для чека', () => {\n  assert.equal(formatPrice(1350), '1 350 ₽');\n  assert.equal(formatPrice(99.5), '99,50 ₽');\n});\n"
};

rmSync("playground", { recursive: true, force: true });
for (const [file, text] of Object.entries(FILES)) {
  const full = path.join("playground", file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}
console.log("playground/ — как в начале темы: тест про ровно 1000 ₽ снова падает.");
