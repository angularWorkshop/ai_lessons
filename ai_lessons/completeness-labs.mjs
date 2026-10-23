const make = (id, code, cases) => ({ id, file: 'exercise.mjs', executable: true,
  starter: 'export function solve(input) {\n  // Implement the lesson contract.\n  return null;\n}\n',
  answer: `export function solve(input) {\n${code}\n}\n`, cases });

export const completenessLabs = [
  make('45-model-mechanics', `  const total = input.reduce((n, item) => n + item.weight, 0);
  if (!input.length || !input.every(item => Number.isFinite(item.weight) && item.weight >= 0) || !Number.isFinite(total) || total <= 0) return [];
  return input.map(item => ({ token: item.token, probability: item.weight / total }));`, [
    ['normalize fictional next-token weights', [{ token: 'yes', weight: 3 }, { token: 'no', weight: 1 }], [{ token: 'yes', probability: 0.75 }, { token: 'no', probability: 0.25 }]],
    ['probability is not a truth label', [{ token: 'invented', weight: 9 }, { token: 'unknown', weight: 1 }], [{ token: 'invented', probability: 0.9 }, { token: 'unknown', probability: 0.1 }]],
    ['zero mass cannot be normalized', [{ token: 'a', weight: 0 }], []],
    ['negative weights are invalid', [{ token: 'a', weight: -1 }, { token: 'b', weight: 2 }], []],
    ['empty vocabulary', [], []],
  ]),
  make('46-tool-call-loop', `  if (input.used >= input.limit) return { action: 'stop' };
  if (input.type === 'text') return { action: 'answer', text: input.text };
  if (input.name !== 'add' || input.approved !== true || !input.args ||
    Object.keys(input.args).length !== 2 || !Number.isFinite(input.args.a) || !Number.isFinite(input.args.b)) return { action: 'deny' };
  return { action: 'tool-result', id: input.id, value: input.args.a + input.args.b };`, [
    ['execute the approved function, not a statement that it ran', { used: 0, limit: 2, type: 'tool', id: 'call-1', name: 'add', approved: true, args: { a: 2, b: 3 } }, { action: 'tool-result', id: 'call-1', value: 5 }],
    ['correlate separate calls', { used: 1, limit: 2, type: 'tool', id: 'call-2', name: 'add', approved: true, args: { a: -2, b: 1 } }, { action: 'tool-result', id: 'call-2', value: -1 }],
    ['unknown functions cannot turn into terminal commands', { used: 0, limit: 2, type: 'tool', name: 'shell', approved: true, args: {} }, { action: 'deny' }],
    ['a model request does not approve itself', { used: 0, limit: 2, type: 'tool', name: 'add', approved: false, args: { a: 2, b: 3 } }, { action: 'deny' }],
    ['no string-to-number coercion', { used: 0, limit: 2, type: 'tool', name: 'add', approved: true, args: { a: '2', b: 3 } }, { action: 'deny' }],
    ['a terminal text result needs no tool', { used: 0, limit: 2, type: 'text', text: '5' }, { action: 'answer', text: '5' }],
    ['stop before exceeding the next-call limit', { used: 2, limit: 2, type: 'text', text: '5' }, { action: 'stop' }],
  ]),
  make('47-vector-search', `  const valid = v => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite);
  if (!valid(input.query)) return [];
  const norm = v => Math.sqrt(v.reduce((n, x) => n + x * x, 0));
  const qn = norm(input.query);
  if (!qn || typeof input.tenant !== 'string' || !input.tenant) return [];
  return input.documents.filter(d => d.tenant === input.tenant && d.model === input.model && valid(d.vector) && d.vector.length === input.query.length && norm(d.vector) > 0)
    .map(d => ({ id: d.id, score: d.vector.reduce((n, x, i) => n + x * input.query[i], 0) / (norm(d.vector) * qn) }))
    .filter(d => d.score >= input.threshold).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.k).map(d => d.id);`, [
    ['cosine compares direction, not raw length', { tenant: 'a', model: 'e1', query: [1, 0], k: 1, threshold: 0, documents: [{ id: 'wrong', tenant: 'a', model: 'e1', vector: [10, 10] }, { id: 'right', tenant: 'a', model: 'e1', vector: [1, 0] }] }, ['right']],
    ['never mix tenants, models, or dimensions', { tenant: 'a', model: 'e1', query: [1, 0], k: 5, threshold: 0, documents: [{ id: 'tenant', tenant: 'b', model: 'e1', vector: [1, 0] }, { id: 'model', tenant: 'a', model: 'e2', vector: [1, 0] }, { id: 'dim', tenant: 'a', model: 'e1', vector: [1] }, { id: 'ok', tenant: 'a', model: 'e1', vector: [1, 0] }] }, ['ok']],
    ['zero vector is not evidence', { tenant: 'a', model: 'e1', query: [0, 0], k: 1, threshold: 0, documents: [{ id: 'x', tenant: 'a', model: 'e1', vector: [1, 0] }] }, []],
    ['respect a no-match threshold', { tenant: 'a', model: 'e1', query: [1, 0], k: 1, threshold: 0.5, documents: [{ id: 'x', tenant: 'a', model: 'e1', vector: [0, 1] }] }, []],
    ['missing tenant fails closed', { model: 'e1', query: [1, 0], k: 1, threshold: 0, documents: [{ id: 'x', model: 'e1', vector: [1, 0] }] }, []],
  ]),
  make('48-reviewed-memory', `  return input.records.filter(r => r.scope === input.scope && r.approved === true && r.sensitive === false &&
    typeof r.fact === 'string' && r.fact.trim() && typeof r.source === 'string' && r.source.trim() && Number.isFinite(r.expiresAt) && r.expiresAt > input.now)
    .map(r => ({ id: r.id, fact: r.fact, source: r.source }));`, [
    ['keep a reviewed current project fact', { scope: 'demo', now: 10, records: [{ id: 'a', fact: 'npm test', source: 'package.json@v1', approved: true, sensitive: false, scope: 'demo', expiresAt: 20 }] }, [{ id: 'a', fact: 'npm test', source: 'package.json@v1' }]],
    ['another project and expired records stay out', { scope: 'demo', now: 10, records: [{ id: 'a', source: 'x', approved: true, sensitive: false, scope: 'other', expiresAt: 20 }, { id: 'b', source: 'x', approved: true, sensitive: false, scope: 'demo', expiresAt: 10 }] }, []],
    ['never promote a secret or an unreviewed guess', { scope: 'demo', now: 10, records: [{ id: 'a', source: 'x', approved: true, sensitive: true, scope: 'demo', expiresAt: 20 }, { id: 'b', source: 'x', approved: false, sensitive: false, scope: 'demo', expiresAt: 20 }] }, []],
    ['source is mandatory', { scope: 'demo', now: 10, records: [{ id: 'a', source: ' ', approved: true, sensitive: false, scope: 'demo', expiresAt: 20 }] }, []],
  ]),
  make('49-sft-labels', `  if (!Array.isArray(input.ids) || !Array.isArray(input.assistantMask) || !Array.isArray(input.attentionMask) ||
    input.ids.length !== input.assistantMask.length || input.ids.length !== input.attentionMask.length ||
    !input.ids.every(x => Number.isInteger(x) && x >= 0) || !input.assistantMask.every(x => x === 0 || x === 1) || !input.attentionMask.every(x => x === 0 || x === 1)) return { valid: false };
  const labels = input.ids.map((id, i) => input.assistantMask[i] === 1 && input.attentionMask[i] === 1 ? id : -100);
  return labels.some(x => x !== -100) ? { valid: true, labels } : { valid: false };`, [
    ['supervise assistant response and its ending, not the user or padding', { ids: [11, 12, 21, 22, 99, 0], assistantMask: [0, 0, 1, 1, 1, 0], attentionMask: [1, 1, 1, 1, 1, 0] }, { valid: true, labels: [-100, -100, 21, 22, 99, -100] }],
    ['an assistant bit cannot unmask padding', { ids: [11, 21, 0], assistantMask: [0, 1, 1], attentionMask: [1, 1, 0] }, { valid: true, labels: [-100, 21, -100] }],
    ['a truncated response with no supervised token is invalid', { ids: [11], assistantMask: [0], attentionMask: [1] }, { valid: false }],
    ['mismatched masks fail before training', { ids: [11, 21], assistantMask: [1], attentionMask: [1, 1] }, { valid: false }],
    ['boolean and numeric masks are not silently mixed', { ids: [11], assistantMask: [true], attentionMask: [1] }, { valid: false }],
  ]),
  make('50-serving-rollout', `  const c = input.candidate, a = input.active;
  const ready = typeof c.version === 'string' && c.version.trim().length > 0 && Number.isInteger(c.schema) && typeof c.embeddingModel === 'string' && c.schema === a.schema && c.embeddingModel === a.embeddingModel &&
    c.health === true && c.qualityPassed === true && c.failureChecksPassed === true && input.rollbackAvailable === true;
  return { version: ready ? c.version : a.version, switched: ready };`, [
    ['activate a compatible evaluated candidate', { active: { version: 'v1', schema: 1, embeddingModel: 'e1' }, candidate: { version: 'v2', schema: 1, embeddingModel: 'e1', health: true, qualityPassed: true, failureChecksPassed: true }, rollbackAvailable: true }, { version: 'v2', switched: true }],
    ['health alone is not acceptance', { active: { version: 'v1', schema: 1, embeddingModel: 'e1' }, candidate: { version: 'v2', schema: 1, embeddingModel: 'e1', health: true, qualityPassed: false, failureChecksPassed: true }, rollbackAvailable: true }, { version: 'v1', switched: false }],
    ['a changed embedding model requires a compatible index release', { active: { version: 'v1', schema: 1, embeddingModel: 'e1' }, candidate: { version: 'v2', schema: 1, embeddingModel: 'e2', health: true, qualityPassed: true, failureChecksPassed: true }, rollbackAvailable: true }, { version: 'v1', switched: false }],
    ['do not switch without a recovery version', { active: { version: 'v1', schema: 1, embeddingModel: 'e1' }, candidate: { version: 'v2', schema: 1, embeddingModel: 'e1', health: true, qualityPassed: true, failureChecksPassed: true }, rollbackAvailable: false }, { version: 'v1', switched: false }],
  ]),
];
