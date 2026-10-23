const osPaths = ['AGENTS.md', 'ENGINEERING_WORKFLOW.md', 'AGENTS/worker.md', 'SKILLS/verify.md', 'PROJECTS/demo.json', 'KNOWLEDGE/projects/demo/README.md'];
const clean = { sourceApproved: true, train: [{ group: 'a', text: 'train example' }], validation: [{ group: 'b', text: 'validation example' }], test: [{ group: 'c', text: 'test example' }] };
const adapter = { base: 'base@revision-A', adapterBase: 'base@revision-A', tokenizer: 'hash-A', adapterTokenizer: 'hash-A', trainable: 8, total: 1000, baseFrozen: true, method: 'lora' };
const release = { heldout: true, rollback: true, candidateScore: 0.9, baselineScore: 0.8, criticalFailures: 0, latencyMs: 2000 };
export const extensionLabs = [
  {
    id: '17-agent-os', file: 'os.json',
    answer: { required: osPaths }, starter: { required: osPaths.slice(0, 3) },
    cases: [
      ['complete minimal OS', { files: osPaths }, { ready: true, missing: [] }],
      ['missing verification skill', { files: osPaths.filter(p => p !== 'SKILLS/verify.md') }, { ready: false, missing: ['SKILLS/verify.md'] }],
      ['missing knowledge', { files: osPaths.slice(0, -1) }, { ready: false, missing: [osPaths.at(-1)] }],
      ['an empty folder is not an agent OS', { files: [] }, { ready: false, missing: osPaths }],
    ],
  },
  {
    id: '18-local-routing', file: 'routing.json', answer: { localOnly: true, fallback: 'block' }, starter: { localOnly: false, fallback: 'cloud' },
    cases: [
      ['local backend declared explicitly', { role: 'worker', routes: { worker: { endpoint: 'http://127.0.0.1:11434/v1', model: 'installed-model', upstreamLocal: true } } }, 'local-ready'],
      ['local proxy with cloud upstream is not local inference', { role: 'worker', routes: { worker: { endpoint: 'http://127.0.0.1:4141/v1', model: 'external-model', upstreamLocal: false } } }, 'block'],
      ['remote endpoint rejected', { role: 'worker', routes: { worker: { endpoint: 'https://provider.example/v1', model: 'model', upstreamLocal: true } } }, 'block'],
      ['unknown alias has no fallback', { role: 'unknown', routes: {} }, 'block'],
    ],
  },
  {
    id: '19-model-capacity', file: 'capacity.json', answer: { reserveGiB: 2, licenseRequired: true }, starter: { reserveGiB: 0, licenseRequired: false },
    cases: [
      ['exact measured estimate with reserve', { weightsGiB: 4, kvGiB: 1, runtimeGiB: 1, availableGiB: 8, licenseApproved: true }, { requiredGiB: 8, fits: true }],
      ['reserve matters', { weightsGiB: 4, kvGiB: 1, runtimeGiB: 1, availableGiB: 7, licenseApproved: true }, { requiredGiB: 8, fits: false }],
      ['license matters', { weightsGiB: 4, kvGiB: 1, runtimeGiB: 1, availableGiB: 16, licenseApproved: false }, { requiredGiB: 8, fits: false }],
      ['larger context changes capacity', { weightsGiB: 4, kvGiB: 4, runtimeGiB: 1, availableGiB: 8, licenseApproved: true }, { requiredGiB: 11, fits: false }],
    ],
  },
  {
    id: '20-local-endpoint', file: 'endpoint.json', answer: { allowRemote: false, requireDone: true }, starter: { allowRemote: true, requireDone: false },
    cases: [
      ['completed local response', { url: 'http://localhost:11434/api/chat', status: 200, body: { done: true, message: { content: 'A real response' } } }, 'ready'],
      ['remote denied', { url: 'https://provider.example/api/chat', status: 200, body: { done: true, message: { content: 'response' } } }, 'deny'],
      ['unfinished response is not ready', { url: 'http://localhost:11434/api/chat', status: 200, body: { done: false, message: { content: 'partial' } } }, 'incomplete'],
      ['empty response', { url: 'http://localhost:11434/api/chat', status: 200, body: { done: true, message: { content: '' } } }, 'incomplete'],
      ['server error', { url: 'http://localhost:11434/api/chat', status: 500, body: {} }, 'error'],
    ],
  },
  {
    id: '21-adaptation-choice', file: 'adaptation.json',
    answer: { routes: { format: 'prompt', 'fresh-facts': 'rag', 'stable-behavior': 'fine-tune', 'from-scratch': 'research' }, fallback: 'clarify' },
    starter: { routes: { format: 'fine-tune', 'fresh-facts': 'fine-tune', 'stable-behavior': 'fine-tune', 'from-scratch': 'fine-tune' }, fallback: 'fine-tune' },
    cases: [
      ['format starts simple', { need: 'format' }, 'prompt'], ['current facts need sources', { need: 'fresh-facts' }, 'rag'],
      ['behavior specialization', { need: 'stable-behavior' }, 'fine-tune'], ['foundation training is separate', { need: 'from-scratch' }, 'research'],
      ['unknown task needs clarification', { need: 'unknown' }, 'clarify'],
    ],
  },
  {
    id: '22-dataset-splits', file: 'dataset.json', answer: { requireProvenance: true, rejectOverlap: true }, starter: { requireProvenance: false, rejectOverlap: false },
    cases: [
      ['clean split', clean, { accepted: true }],
      ['unapproved data', { ...clean, sourceApproved: false }, { accepted: false }],
      ['same source group leaks', { ...clean, test: [{ group: 'a', text: 'paraphrase of a training case' }] }, { accepted: false }],
      ['normalized text duplicate leaks', { ...clean, test: [{ group: 'z', text: ' TRAIN EXAMPLE ' }] }, { accepted: false }],
    ],
  },
  {
    id: '23-cpu-training', file: 'training.json', answer: { requireWeightsChanged: true, minLossDrop: 0.05, selectionSplit: 'validation' }, starter: { requireWeightsChanged: false, minLossDrop: 0, selectionSplit: 'test' },
    cases: [
      ['weight updates and independent selection', { weightsChanged: true, lossBefore: 0.7, lossAfter: 0.5, selectionSplit: 'validation', splitDisjoint: true }, { accepted: true }],
      ['no weight updates', { weightsChanged: false, lossBefore: 0.7, lossAfter: 0.5, selectionSplit: 'validation', splitDisjoint: true }, { accepted: false }],
      ['test is not for checkpoint selection', { weightsChanged: true, lossBefore: 0.7, lossAfter: 0.5, selectionSplit: 'test', splitDisjoint: true }, { accepted: false }],
      ['tiny loss change is insufficient', { weightsChanged: true, lossBefore: 0.7, lossAfter: 0.69, selectionSplit: 'validation', splitDisjoint: true }, { accepted: false }],
    ],
  },
  {
    id: '24-lora', file: 'lora.json', answer: { requireBaseMatch: true, requireAdapter: true }, starter: { requireBaseMatch: false, requireAdapter: false },
    cases: [
      ['compatible trainable adapter', adapter, 'lora-ready'], ['wrong base', { ...adapter, adapterBase: 'base@revision-B' }, 'reject'],
      ['wrong tokenizer', { ...adapter, adapterTokenizer: 'hash-B' }, 'reject'], ['zero trainable parameters', { ...adapter, trainable: 0 }, 'reject'],
      ['unprepared quantized base', { ...adapter, method: 'qlora', bits: 4, kbitReady: false }, 'reject'],
      ['prepared QLoRA', { ...adapter, method: 'qlora', bits: 4, kbitReady: true }, 'qlora-ready'],
    ],
  },
  {
    id: '25-model-release', file: 'release.json', answer: { requireHeldout: true, requireRollback: true, maxLatencyMs: 3000 }, starter: { requireHeldout: false, requireRollback: false, maxLatencyMs: 30000 },
    cases: [
      ['validated local candidate', release, 'ready-for-local-use'], ['missing holdout', { ...release, heldout: false }, 'blocked'],
      ['no rollback', { ...release, rollback: false }, 'blocked'], ['slow candidate', { ...release, latencyMs: 4000 }, 'blocked'],
      ['critical regression', { ...release, criticalFailures: 1 }, 'blocked'], ['worse than baseline', { ...release, candidateScore: 0.7 }, 'blocked'],
    ],
  },
  {
    id: '26-local-capstone', file: 'capstone.json',
    answer: { required: ['osDoctor', 'localHealth', 'baseline', 'heldout', 'rollback'], methods: ['classifier', 'rag', 'lora', 'qlora'] },
    starter: { required: ['localHealth'], methods: ['classifier', 'rag', 'lora', 'qlora', 'unknown'] },
    cases: [
      ['real evidence complete', { method: 'classifier', checks: { osDoctor: true, localHealth: true, baseline: true, heldout: true, rollback: true } }, 'ready-for-review'],
      ['health alone is insufficient', { method: 'classifier', checks: { localHealth: true } }, 'blocked'],
      ['failed evidence blocks completion', { method: 'rag', checks: { osDoctor: true, localHealth: true, baseline: true, heldout: false, rollback: true } }, 'blocked'],
      ['unknown method blocked', { method: 'unknown', checks: { osDoctor: true, localHealth: true, baseline: true, heldout: true, rollback: true } }, 'blocked'],
    ],
  },
];
