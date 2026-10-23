import { isLoopbackEndpoint } from '../extension-runtime.mjs';

export function localClient({ baseUrl = 'http://127.0.0.1:11434', model, timeoutMs = 10000 }) {
  const url = new URL(baseUrl);
  if (!isLoopbackEndpoint(baseUrl) || url.pathname !== '/' || url.search || url.hash || typeof model !== 'string' || !model.trim()) throw new Error('local-endpoint-and-model-required');
  async function post(route, body, signal) {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const response = await fetch(new URL(route, url), { method: 'POST', redirect: 'error', signal: combined,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`local-http-${response.status}`);
    const reader = response.body.getReader(); let bytes = 0; const parts = [];
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024 * 1024) throw new Error('response-too-large');
        parts.push(value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }
  return {
    async chat({ messages, tools, signal }) {
      const reply = await post('/api/chat', { model, messages, tools, stream: false, options: { temperature: 0, num_predict: 128 } }, signal);
      if (reply.done !== true || !reply.message) throw new Error('incomplete-chat');
      return reply.message;
    },
    async embed(texts) {
      const reply = await post('/api/embed', { model, input: texts, truncate: false });
      if (reply.model !== model || !Array.isArray(reply.embeddings) || reply.embeddings.length !== texts.length ||
        !reply.embeddings.length || !reply.embeddings.every(v => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite) && v.length === reply.embeddings[0].length)) throw new Error('invalid-embeddings');
      return reply.embeddings;
    },
  };
}
