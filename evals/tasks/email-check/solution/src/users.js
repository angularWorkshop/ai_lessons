// Пользователи: создание с проверкой полей.
export function createUser({ name, email }) {
  if (!name || !name.trim()) {
    throw new Error('пустое имя');
  }
  const clean = email.trim().toLowerCase();
  const at = clean.indexOf('@');
  if (at <= 0 || at === clean.length - 1) {
    throw new Error('некорректный email');
  }
  return { name: name.trim(), email: clean };
}
