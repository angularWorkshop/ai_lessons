// Pure functions make these labs runnable offline. No model response is mocked as a live run.
const lab = (id, code, cases) => ({ id, file: 'exercise.mjs', executable: true,
  starter: 'export function solve(input) {\n  // Implement the behavior described in the lesson.\n  return null;\n}\n',
  answer: `export function solve(input) {\n${code}\n}\n`, cases });

export const depthLabs = [
  lab('27-context-window', `  const remaining = input.window - input.instructions - input.history - input.tools - input.output;
  return { remaining: Math.max(0, remaining), fits: remaining >= input.document };`, [
    ['reserve the response before adding documents', { window: 100, instructions: 10, history: 20, tools: 10, output: 30, document: 40 }, { remaining: 30, fits: false }],
    ['an exact boundary fits', { window: 100, instructions: 10, history: 20, tools: 10, output: 30, document: 30 }, { remaining: 30, fits: true }],
    ['overbooked history cannot become a negative budget', { window: 10, instructions: 10, history: 10, tools: 0, output: 5, document: 0 }, { remaining: 0, fits: false }],
  ]),
  lab('28-client-preflight', `  const missing = ['workspace', 'model', 'permissions', 'testCommand'].filter(key => typeof input[key] !== 'string' || !input[key].trim());
  return { ready: missing.length === 0, missing };`, [
    ['a configured model is not a configured workspace', { model: 'local-demo' }, { ready: false, missing: ['workspace', 'permissions', 'testCommand'] }],
    ['record all four setup decisions', { workspace: './demo', model: 'local-demo', permissions: 'read-only', testCommand: 'npm test' }, { ready: true, missing: [] }],
    ['whitespace is not a permission policy', { workspace: './demo', model: 'demo', permissions: ' ', testCommand: 'npm test' }, { ready: false, missing: ['permissions'] }],
  ]),
  lab('29-example-selection', `  return input.examples.filter(e => e.split === 'train' && e.approved === true && e.task === input.task)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.limit).map(e => e.id);`, [
    ['do not demonstrate a held-out answer', { task: 'triage', limit: 2, examples: [{ id: 'a', task: 'triage', score: 9, split: 'test', approved: true }, { id: 'b', task: 'triage', score: 7, split: 'train', approved: true }] }, ['b']],
    ['choose relevant approved examples in score order', { task: 'triage', limit: 1, examples: [{ id: 'a', task: 'rewrite', score: 10, split: 'train', approved: true }, { id: 'b', task: 'triage', score: 2, split: 'train', approved: true }, { id: 'c', task: 'triage', score: 8, split: 'train', approved: true }] }, ['c']],
    ['unreviewed examples stay out', { task: 'triage', limit: 3, examples: [{ id: 'x', task: 'triage', score: 10, split: 'train', approved: false }] }, []],
  ]),
  lab('30-structured-results', `  let value;
  try { value = JSON.parse(input); } catch { return { ok: false }; }
  const ok = value !== null && !Array.isArray(value) && typeof value === 'object' &&
    Object.keys(value).length === 2 && ['bug', 'question'].includes(value.category) &&
    typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1;
  return ok ? { ok: true, value } : { ok: false };`, [
    ['accept a complete typed object', '{"category":"bug","confidence":0.7}', { ok: true, value: { category: 'bug', confidence: 0.7 } }],
    ['valid JSON can still violate the contract', '{"category":"bug","confidence":"0.7"}', { ok: false }],
    ['unknown category', '{"category":"deploy","confidence":0.8}', { ok: false }],
    ['extra permissions cannot ride with a response', '{"category":"bug","confidence":0.8,"deploy":true}', { ok: false }],
    ['malformed text is a handled failure', 'not json', { ok: false }],
    ['null is not an object contract', 'null', { ok: false }],
  ]),
  lab('31-git-checkpoint', `  return { ready: input.clean === true && input.branch !== 'main' && input.backupVerified === true && input.secretsTracked === false };`, [
    ['a disposable branch with a verified checkpoint', { clean: true, branch: 'lab/focus', backupVerified: true, secretsTracked: false }, { ready: true }],
    ['never overwrite existing edits', { clean: false, branch: 'lab/focus', backupVerified: true, secretsTracked: false }, { ready: false }],
    ['main is not the lab branch', { clean: true, branch: 'main', backupVerified: true, secretsTracked: false }, { ready: false }],
    ['a commit is not a safe backup if it contains secrets', { clean: true, branch: 'lab/focus', backupVerified: true, secretsTracked: true }, { ready: false }],
  ]),
  lab('32-mcp-discovery', `  const known = new Set(input.approved);
  return input.discovered.filter(t => known.has(t.name) && t.readOnly === true).map(t => t.name).sort();`, [
    ['discovery is not permission', { approved: ['read-doc'], discovered: [{ name: 'delete-doc', readOnly: false }, { name: 'read-doc', readOnly: true }] }, ['read-doc']],
    ['a changed capability needs review', { approved: ['read-doc'], discovered: [{ name: 'read-doc', readOnly: false }] }, []],
    ['an unfamiliar reader still needs approval', { approved: [], discovered: [{ name: 'read-doc', readOnly: true }] }, []],
  ]),
  lab('33-tool-retries', `  if (input.attempt >= 3) return 'stop';
  if (input.status === 401 || input.status === 403) return 'human';
  if ((input.status === 429 || input.status >= 500) && input.idempotent === true) return 'retry-with-backoff';
  return input.status >= 200 && input.status < 300 ? 'accept' : 'stop';`, [
    ['transient read failure', { status: 503, attempt: 1, idempotent: true }, 'retry-with-backoff'],
    ['do not repeat a payment after an ambiguous response', { status: 503, attempt: 1, idempotent: false }, 'stop'],
    ['permission denial needs a person, not retries', { status: 403, attempt: 1, idempotent: true }, 'human'],
    ['bounded attempts', { status: 429, attempt: 3, idempotent: true }, 'stop'],
    ['bad input is not transient', { status: 400, attempt: 1, idempotent: true }, 'stop'],
    ['successful request', { status: 200, attempt: 1, idempotent: true }, 'accept'],
  ]),
  lab('34-cancellation', `  const result = { text: '', state: 'incomplete' };
  for (const event of input) {
    if (event.type === 'cancel' || event.type === 'error') { result.state = event.type === 'cancel' ? 'cancelled' : 'failed'; break; }
    if (event.type === 'done') { result.state = 'complete'; break; }
    if (event.type === 'delta') result.text += event.text;
  }
  return result;`, [
    ['a delta is not completion', [{ type: 'delta', text: 'Hi' }], { text: 'Hi', state: 'incomplete' }],
    ['stop consuming after cancellation', [{ type: 'delta', text: 'A' }, { type: 'cancel' }, { type: 'delta', text: 'B' }, { type: 'done' }], { text: 'A', state: 'cancelled' }],
    ['server failure preserves partial text without claiming success', [{ type: 'delta', text: 'A' }, { type: 'error' }], { text: 'A', state: 'failed' }],
    ['normal completion', [{ type: 'delta', text: 'A' }, { type: 'delta', text: 'B' }, { type: 'done' }], { text: 'AB', state: 'complete' }],
  ]),
  lab('35-evaluation-metrics', `  const tp = input.filter(x => x.actual === true && x.predicted === true).length;
  const fp = input.filter(x => x.actual === false && x.predicted === true).length;
  const fn = input.filter(x => x.actual === true && x.predicted === false).length;
  return { precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 };`, [
    ['catching everything can still create false alarms', [{ actual: true, predicted: true }, { actual: false, predicted: true }], { precision: 0.5, recall: 1 }],
    ['a missed issue lowers recall', [{ actual: true, predicted: true }, { actual: true, predicted: false }], { precision: 1, recall: 0.5 }],
    ['empty denominator has an explicit policy', [], { precision: 0, recall: 0 }],
  ]),
  lab('36-trace-summary', `  return { calls: input.length, durationMs: input.reduce((n, x) => n + x.durationMs, 0),
    failed: input.filter(x => x.ok === false).map(x => x.id) };`, [
    ['count failed calls too', [{ id: 'a', durationMs: 50, ok: true }, { id: 'b', durationMs: 100, ok: false }], { calls: 2, durationMs: 150, failed: ['b'] }],
    ['no work has no invented duration', [], { calls: 0, durationMs: 0, failed: [] }],
    ['do not expose prompt bodies in the summary', [{ id: 'a', durationMs: 20, ok: true, prompt: 'dummy private text' }], { calls: 1, durationMs: 20, failed: [] }],
  ]),
  lab('37-document-chunks', `  if (!Number.isInteger(input.size) || !Number.isInteger(input.overlap) || input.size <= input.overlap || input.overlap < 0) throw new Error('invalid chunk settings');
  const chunks = [];
  for (let start = 0; start < input.text.length; start += input.size - input.overlap) {
    chunks.push({ source: input.source, start, text: input.text.slice(start, start + input.size) });
    if (start + input.size >= input.text.length) break;
  }
  return chunks;`, [
    ['preserve source and overlap', { source: 'manual-v2', text: 'abcdefgh', size: 5, overlap: 2 }, [{ source: 'manual-v2', start: 0, text: 'abcde' }, { source: 'manual-v2', start: 3, text: 'defgh' }]],
    ['a short paragraph is one chunk', { source: 'a', text: 'abc', size: 5, overlap: 1 }, [{ source: 'a', start: 0, text: 'abc' }]],
    ['empty input produces no phantom document', { source: 'a', text: '', size: 5, overlap: 1 }, []],
  ]),
  lab('38-retrieval-ranking', `  const words = value => new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
  const query = words(input.query);
  return input.documents.filter(d => d.tenant === input.tenant).map(d => ({ id: d.id, score: [...words(d.text)].filter(w => query.has(w)).length }))
    .filter(d => d.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.k).map(d => d.id);`, [
    ['filter access before ranking', { tenant: 'a', query: 'reset password', k: 2, documents: [{ id: 'secret', tenant: 'b', text: 'reset password' }, { id: 'public', tenant: 'a', text: 'password help' }] }, ['public']],
    ['rank unique matches, not repeated buzzwords', { tenant: 'a', query: 'reset password', k: 1, documents: [{ id: 'a', tenant: 'a', text: 'password password' }, { id: 'b', tenant: 'a', text: 'Reset password' }] }, ['b']],
    ['no evidence is a valid search result', { tenant: 'a', query: 'invoice', k: 2, documents: [{ id: 'x', tenant: 'a', text: 'password' }] }, []],
  ]),
  lab('39-grounded-answer', `  const known = new Set(input.retrieved);
  return { accepted: input.claims.length > 0 && input.claims.every(c => c.sources.length > 0 && c.sources.every(s => known.has(s))) };`, [
    ['every claim needs an available source', { retrieved: ['doc1'], claims: [{ text: 'A', sources: ['doc1'] }] }, { accepted: true }],
    ['a plausible invented citation is not evidence', { retrieved: ['doc1'], claims: [{ text: 'A', sources: ['doc9'] }] }, { accepted: false }],
    ['one unsupported claim blocks the response', { retrieved: ['doc1'], claims: [{ text: 'A', sources: ['doc1'] }, { text: 'B', sources: [] }] }, { accepted: false }],
    ['no answer is not a verified answer', { retrieved: [], claims: [] }, { accepted: false }],
  ]),
  lab('40-generation-request', `  return { model: input.model, messages: [{ role: 'user', content: input.question }], stream: false,
    options: { temperature: 0, num_predict: input.maxOutput } };`, [
    ['build a bounded local chat request', { model: 'local-demo', question: 'Classify this ticket', maxOutput: 80 }, { model: 'local-demo', messages: [{ role: 'user', content: 'Classify this ticket' }], stream: false, options: { temperature: 0, num_predict: 80 } }],
    ['do not hard-code a model or output limit', { model: 'another-local', question: 'Explain', maxOutput: 10 }, { model: 'another-local', messages: [{ role: 'user', content: 'Explain' }], stream: false, options: { temperature: 0, num_predict: 10 } }],
  ]),
  lab('41-inference-speed', `  const warm = input.filter(x => x.warm === true && x.ok === true && x.seconds > 0);
  return { samples: warm.length, tokensPerSecond: warm.length ? warm.reduce((n, x) => n + x.tokens, 0) / warm.reduce((n, x) => n + x.seconds, 0) : null };`, [
    ['aggregate tokens and time rather than averaging rates', [{ warm: true, ok: true, tokens: 10, seconds: 1 }, { warm: true, ok: true, tokens: 10, seconds: 3 }], { samples: 2, tokensPerSecond: 5 }],
    ['exclude startup and failed requests', [{ warm: false, ok: true, tokens: 100, seconds: 10 }, { warm: true, ok: false, tokens: 5, seconds: 1 }], { samples: 0, tokensPerSecond: null }],
    ['zero duration is not infinite performance', [{ warm: true, ok: true, tokens: 1, seconds: 0 }], { samples: 0, tokensPerSecond: null }],
  ]),
  lab('42-learning-curves', `  if (input.some(x => !Number.isFinite(x.train) || !Number.isFinite(x.validation))) return 'invalid';
  if (input.length < 2) return 'more-evidence';
  const first = input[0], last = input.at(-1);
  if (last.train < first.train && last.validation > first.validation) return 'possible-overfit';
  return last.validation < first.validation ? 'improving' : 'investigate';`, [
    ['training improves while validation worsens', [{ train: 1, validation: 1 }, { train: 0.1, validation: 2 }], 'possible-overfit'],
    ['both improve', [{ train: 1, validation: 1 }, { train: 0.6, validation: 0.8 }], 'improving'],
    ['one epoch proves no trend', [{ train: 1, validation: 1 }], 'more-evidence'],
    ['nonfinite loss needs investigation before selection', [{ train: NaN, validation: 1 }], 'invalid'],
  ]),
  lab('43-experiment-selection', `  const valid = input.filter(x => x.split === 'validation' && Number.isFinite(x.loss));
  return valid.length ? [...valid].sort((a, b) => a.loss - b.loss || a.id.localeCompare(b.id))[0].id : null;`, [
    ['never select a checkpoint on test performance', [{ id: 'test-winner', split: 'test', loss: 0.01 }, { id: 'v1', split: 'validation', loss: 0.8 }, { id: 'v2', split: 'validation', loss: 0.6 }], 'v2'],
    ['failed measurements do not win', [{ id: 'broken', split: 'validation', loss: null }, { id: 'v', split: 'validation', loss: 0.9 }], 'v'],
    ['missing validation is a blocker', [{ id: 'train', split: 'train', loss: 0.1 }], null],
  ]),
  lab('44-adapter-preflight', `  const missing = ['licensed', 'basePinned', 'splitChecked', 'templateChecked', 'maskChecked', 'smokePassed'].filter(key => input[key] !== true);
  return { ready: missing.length === 0, missing };`, [
    ['a run needs more than available VRAM', { licensed: true, basePinned: true, splitChecked: true, templateChecked: false, maskChecked: false, smokePassed: false }, { ready: false, missing: ['templateChecked', 'maskChecked', 'smokePassed'] }],
    ['reviewed prerequisites permit a controlled run', { licensed: true, basePinned: true, splitChecked: true, templateChecked: true, maskChecked: true, smokePassed: true }, { ready: true, missing: [] }],
    ['unknown values are not approvals', {}, { ready: false, missing: ['licensed', 'basePinned', 'splitChecked', 'templateChecked', 'maskChecked', 'smokePassed'] }],
  ]),
];
