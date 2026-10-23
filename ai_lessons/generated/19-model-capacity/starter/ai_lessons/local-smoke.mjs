import { pathToFileURL } from 'node:url';
import { isLoopbackEndpoint } from './extension-runtime.mjs';

export async function localSmoke({ model, baseUrl = 'http://127.0.0.1:11434', timeoutMs = 60000 }) {
  const base = new URL(baseUrl);
  if (!isLoopbackEndpoint(base.href) || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Use an exact loopback origin, without a path, query, credentials, or fragment');
  }
  if (typeof model !== 'string' || !model.trim()) throw new Error('Supply an already installed model tag');
  const read = async (path, options = {}) => {
    const response = await fetch(new URL(path, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Local runtime returned HTTP ${response.status}`);
    return response.json();
  };
  const tags = await read('/api/tags');
  if (!Array.isArray(tags.models) || !tags.models.some(item => item.name === model || item.model === model)) {
    throw new Error('Model is not installed. No automatic pull or cloud fallback is allowed');
  }
  const answer = await read('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'Reply with a short greeting.' }] }),
  });
  if (answer.done !== true || typeof answer.message?.content !== 'string' || !answer.message.content.trim()) {
    throw new Error('Runtime did not return a completed nonempty response');
  }
  return { status: 'ready', endpoint: base.origin, model, done: true, responseCharacters: answer.message.content.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg, index) => index % 2 === 0 && !['--model', '--base-url'].includes(arg)) || args.length % 2) {
      throw new Error('Usage: node local-smoke.mjs --model <installed-tag> [--base-url http://127.0.0.1:11434]');
    }
    const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
    console.log(JSON.stringify(await localSmoke({ model: options['--model'], baseUrl: options['--base-url'] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
