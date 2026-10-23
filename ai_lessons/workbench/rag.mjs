export function cosine(a, b) {
  const valid = v => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite);
  if (!valid(a) || !valid(b) || a.length !== b.length) return null;
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (!normA || !normB) return null;
  return a.reduce((sum, value, i) => sum + (value / normA) * (b[i] / normB), 0);
}

export function retrieve({ query, model, tenant, documents, k = 2, threshold = 0.8 }) {
  if (typeof tenant !== 'string' || !tenant || typeof model !== 'string' || !model || !Number.isInteger(k) || k < 1) return [];
  return documents.filter(d => d.tenant === tenant && d.model === model && d.active === true)
    .map(d => ({ ...d, score: cosine(query, d.vector) }))
    .filter(d => d.score !== null && d.score >= threshold)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}

export function evidencePacket(documents, maxChars = 800) {
  let used = 0;
  const sources = [];
  for (const d of documents) {
    const text = `[${d.id}@${d.revision}] ${d.text}`;
    if (used + text.length > maxChars) continue;
    used += text.length;
    sources.push({ id: d.id, revision: d.revision, text: d.text });
  }
  return { status: sources.length ? 'evidence-only' : 'abstain', sources, usedChars: used };
}

// These are invented documents and hand-authored vectors, not learned embeddings.
export const demoCorpus = [
  { id: 'reset', revision: '2', tenant: 'demo', model: 'teaching-vectors-v1', active: true, text: 'To reset a password, use the reset link on the login page.', vector: [1, 0] },
  { id: 'invoice', revision: '1', tenant: 'demo', model: 'teaching-vectors-v1', active: true, text: 'Invoices are available in the billing page.', vector: [0, 1] },
  { id: 'private-reset', revision: '1', tenant: 'other', model: 'teaching-vectors-v1', active: true, text: 'This document belongs to another tenant.', vector: [1, 0] },
];
