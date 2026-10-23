export function isLoopbackEndpoint(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function runExtension(id, config, input) {
  switch (id) {
    case '17-agent-os': {
      const missing = config.required.filter(file => !input.files.includes(file));
      return { ready: missing.length === 0, missing };
    }
    case '18-local-routing': {
      const route = Object.hasOwn(input.routes, input.role) ? input.routes[input.role] : null;
      if (!route) return config.fallback;
      if (config.localOnly && (!isLoopbackEndpoint(route.endpoint) || route.upstreamLocal !== true)) return 'block';
      return route.model ? 'local-ready' : 'block';
    }
    case '19-model-capacity': {
      const requiredGiB = input.weightsGiB + input.kvGiB + input.runtimeGiB + config.reserveGiB;
      return { requiredGiB, fits: requiredGiB <= input.availableGiB && (!config.licenseRequired || input.licenseApproved === true) };
    }
    case '20-local-endpoint':
      if (!config.allowRemote && !isLoopbackEndpoint(input.url)) return 'deny';
      if (input.status !== 200) return 'error';
      return (!config.requireDone || input.body?.done === true) && typeof input.body?.message?.content === 'string' && input.body.message.content.trim() ? 'ready' : 'incomplete';
    case '21-adaptation-choice':
      return Object.hasOwn(config.routes, input.need) ? config.routes[input.need] : config.fallback;
    case '22-dataset-splits': {
      if (config.requireProvenance && input.sourceApproved !== true) return { accepted: false };
      const seenGroups = new Map(), seenTexts = new Map();
      for (const split of ['train', 'validation', 'test']) {
        if (!Array.isArray(input[split]) || input[split].length === 0) return { accepted: false };
        for (const record of input[split]) {
          if (!record.group || typeof record.text !== 'string' || !record.text.trim()) return { accepted: false };
          const text = record.text.trim().toLowerCase();
          if (config.rejectOverlap && ((seenGroups.has(record.group) && seenGroups.get(record.group) !== split) ||
            (seenTexts.has(text) && seenTexts.get(text) !== split))) return { accepted: false };
          seenGroups.set(record.group, split); seenTexts.set(text, split);
        }
      }
      return { accepted: true };
    }
    case '23-cpu-training':
      return { accepted: (!config.requireWeightsChanged || input.weightsChanged === true) &&
        input.lossBefore - input.lossAfter >= config.minLossDrop && input.selectionSplit === config.selectionSplit && input.splitDisjoint === true };
    case '24-lora':
      if (config.requireBaseMatch && (input.base !== input.adapterBase || input.tokenizer !== input.adapterTokenizer)) return 'reject';
      if (config.requireAdapter && !(input.trainable > 0 && input.trainable < input.total && input.baseFrozen === true)) return 'reject';
      if (input.method === 'qlora') return input.bits === 4 && input.kbitReady === true ? 'qlora-ready' : 'reject';
      return input.method === 'lora' ? 'lora-ready' : 'reject';
    case '25-model-release':
      return (!config.requireHeldout || input.heldout === true) && (!config.requireRollback || input.rollback === true) &&
        input.candidateScore >= input.baselineScore && input.criticalFailures === 0 && input.latencyMs <= config.maxLatencyMs ? 'ready-for-local-use' : 'blocked';
    case '26-local-capstone':
      return config.methods.includes(input.method) && config.required.every(key => Object.hasOwn(input.checks, key) && input.checks[key] === true) ? 'ready-for-review' : 'blocked';
    default: throw new Error(`Unknown lab: ${id}`);
  }
}
