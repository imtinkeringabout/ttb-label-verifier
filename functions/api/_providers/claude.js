import {
  SYSTEM_PROMPT,
  USER_PROMPT,
  safeParseJson,
  normalizeExtraction
} from '../_lib/extract-schema.js';

// Anthropic Claude (Messages API). Optional premium path — most accurate on the
// strict government-warning formatting checks. Flip PROVIDER=claude to use.
export async function extract(base64, mediaType, env) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw httpError(500, 'ANTHROPIC_API_KEY is not configured on the server');
  const model = env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: USER_PROMPT }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw httpError(res.status === 429 ? 429 : 502,
      `Claude error ${res.status}${detail ? ': ' + truncate(detail) : ''}`);
  }

  const data = await res.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text || '';
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
