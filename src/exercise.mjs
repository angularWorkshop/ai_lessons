export function solve(input) {
  let value;
  try { value = JSON.parse(input); } catch { return { ok: false }; }
  const ok = value !== null && !Array.isArray(value) && typeof value === 'object' &&
    Object.keys(value).length === 2 && ['bug', 'question'].includes(value.category) &&
    typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1;
  return ok ? { ok: true, value } : { ok: false };
}
