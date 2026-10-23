import { runExtension } from './extension-runtime.mjs';
// Educational policy simulator. It does not run shell commands or call a model.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const safePath = value => typeof value === 'string' && value.length > 0 &&
  !value.startsWith('/') && !value.includes('\\') && !value.includes(':') &&
  value.split('/').every(part => part && part !== '.' && part !== '..');
const inScope = (file, scope) => safePath(file) && scope.some(root => safePath(root) &&
  (file === root || file.startsWith(`${root}/`)));
const hasFields = (value, fields) => fields.every(key => own(value, key) &&
  value[key] !== null && value[key] !== '' && value[key] !== undefined);

export function runLab(id, config, input) {
  switch (id) {
    case '01-task-boundaries':
      return config.deny.includes(input.kind) ? 'deny' :
        config.approval.includes(input.kind) ? 'approval' :
          config.allow.includes(input.kind) ? 'allow' : config.unknown;
    case '02-task-brief': {
      const missing = config.required.filter(key => !hasFields(input, [key]) ||
        (Array.isArray(input[key]) && input[key].length === 0));
      return missing.length ? { action: config.onMissing, missing } : { action: 'plan', missing: [] };
    }
    case '03-context-packet': {
      let remaining = config.maxChars;
      return [...input].filter(doc => safePath(doc.path) &&
        !doc.path.split('/').some(segment => config.exclude.includes(segment)) &&
        config.extensions.some(extension => doc.path.endsWith(extension)))
        .sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path))
        .flatMap(doc => {
          if (doc.text.length > remaining) return [];
          remaining -= doc.text.length;
          return [{ path: doc.path, text: doc.text }];
        });
    }
    case '04-project-instructions': {
      const result = {};
      for (const source of config.precedence) {
        for (const [key, value] of Object.entries(input[source] ?? {})) {
          if (config.locked.includes(key) && own(result, key)) continue;
          result[key] = value;
        }
      }
      return result;
    }
    case '05-tool-permissions': {
      if (!inScope(input.path, config.roots) || !own(config.tools, input.tool)) return 'deny';
      const rule = config.tools[input.tool];
      return ['allow', 'approval', 'deny'].includes(rule) ? rule : 'deny';
    }
    case '06-untrusted-context': {
      const text = input.text.replace(/(?:Bearer\s+)[A-Za-z0-9._-]+/gi, '[REDACTED]')
        .replace(/(?:sk-)[A-Za-z0-9_-]+/g, '[REDACTED]');
      return { text, trust: config.externalTrust, grantPermissions: config.grantFromContent };
    }
    case '07-verification-evidence':
      return { completed: config.commands.every(command => input.checks.findLast(check =>
        check.command === command)?.exitCode === 0) && input.changed.every(file => inScope(file, config.roots)) };
    case '08-debugging': {
      const first = input.find(event => event.exitCode !== 0);
      return first ? (own(config.actions, first.phase) ? config.actions[first.phase] : 'inspect') : 'review';
    }
    case '09-tool-contract': {
      const tool = own(config.tools, input.name) ? config.tools[input.name] : null;
      if (!tool || !input.args || typeof input.args !== 'object') return 'reject';
      if (!hasFields(input.args, tool.required) || Object.keys(input.args).some(key => !tool.allowed.includes(key))) return 'reject';
      if (!inScope(input.args.path, config.roots)) return 'reject';
      return tool.effect;
    }
    case '10-handoff':
      return { accepted: hasFields(input, config.required) && config.statuses.includes(input.status) &&
        Array.isArray(input.evidence) && input.evidence.length > 0 && input.evidence.every(safePath) };
    case '11-budget': {
      const cost = (input.inputTokens * input.inputPrice + input.outputTokens * input.outputPrice) / 1_000_000;
      const valid = ['inputTokens', 'outputTokens', 'inputPrice', 'outputPrice', 'spent', 'calls', 'elapsedMs']
        .every(key => Number.isFinite(input[key]) && input[key] >= 0);
      return { cost, proceed: valid && Number.isFinite(cost) && cost >= 0 &&
        input.spent + cost <= config.maxCost && input.calls < config.maxCalls && input.elapsedMs < config.timeoutMs };
    }
    case '12-evaluation': {
      const passRate = input.length ? input.filter(item => item.passed === true).length / input.length : 0;
      return { passRate, release: input.length >= config.minCases && passRate >= config.minPassRate &&
        !input.some(item => item.critical && item.passed !== true) };
    }
    case '13-role-routing':
      return own(config.routes, input.kind) ? config.routes[input.kind] : config.fallback;
    case '14-parallel-work': {
      if (input.some(task => task.paths.some(file => !safePath(file)))) return 'invalid';
      const conflict = input.some((task, i) => input.slice(i + 1).some(other => task.paths.some(a =>
        other.paths.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)))));
      return conflict ? config.onConflict : input.length <= config.maxWorkers ? 'parallel' : 'queue';
    }
    case '15-review-loop':
      return input.review.risk === 'high' ? config.onStop :
        input.review.passed === true && input.checksPassed === true && input.review.author !== input.implementer ? 'complete' :
          input.attempts >= config.maxAttempts ? config.onStop : 'repair';
    case '16-orchestrator':
      return orchestrate(config, input);
    default:
      return runExtension(id, config, input);
  }
}

export function orchestrate(config, input) {
  const trace = ['intake'];
  if (!input.goal || !input.acceptance?.length) return { status: 'clarify', trace };
  if (!input.allowed) return { status: 'denied', trace };
  let calls = 0;
  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    for (const role of ['plan', 'implement', 'test', 'review']) {
      if (calls >= config.maxCalls) return { status: 'budget', trace };
      trace.push(config.roles[role]);
      calls++;
    }
    const run = input.runs[attempt];
    if (!run) return { status: 'blocked', trace };
    if (run.highRisk) return { status: 'approval', trace };
    if (run.testsPassed === true && run.reviewPassed === true && config.roles.implement !== config.roles.review) {
      trace.push('human-approval');
      return { status: 'ready-for-approval', trace };
    }
  }
  return { status: 'blocked', trace };
}
