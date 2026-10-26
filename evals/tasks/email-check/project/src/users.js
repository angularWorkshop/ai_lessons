// Пользователи: создание с проверкой полей.
export function createUser({ name, email }) {
  if (!name || !name.trim()) {
    throw new Error('пустое имя');
  }
  return { name: name.trim(), email: email.trim().toLowerCase() };
}
