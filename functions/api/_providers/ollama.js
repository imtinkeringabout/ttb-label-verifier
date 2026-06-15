import {
  SYSTEM_PROMPT,
  USER_PROMPT,
  safeParseJson,
  normalizeExtraction
} from '../_lib/extract-schema.js';

// Local Ollama vision model (e.g. llama3.2-vision). $0 and fully private.
//
// IMPORTANT: Cloudflare's edge CANNOT reach a localhost Ollama. This path is for
// local `wrangler pages dev` against a machine running Ollama, or a self-hosted
// deployment on the same network. Set OLLAMA_URL accordingly.
export async function extract(base64, mediaType, env) {
  const url = (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = env.OLLAMA_MODEL || 'llama3.2-vision';

  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT, images: [base64] }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw httpError(502, `Ollama error ${res.status}${detail ? ': ' + truncate(detail) : ''}`);
  }

  const data = await res.json();
  const text = data?.message?.content || '';
  return normalizeExtraction(safeParseJson(text));
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function truncate(s, n = 300) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
