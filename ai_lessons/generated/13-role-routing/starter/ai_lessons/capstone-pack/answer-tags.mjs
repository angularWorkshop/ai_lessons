// Reference for the human reviewer; keep outside the worker's project copy.
export function normalizeTags(tags) {
  return [...new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort();
}
