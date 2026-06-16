import {
  SYSTEM_PROMPT,
  USER_PROMPT,
  safeParseJson,
  normalizeExtraction
} from '../_lib/extract-schema.js';

// Google Gemini (Generative Language API). Default backend — generous free tier,
// vision-capable, fast.
const endpoint = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export async function extract(base64, mediaType, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw httpError(500, 'GEMINI_API_KEY is not configured on the server');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

  const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mediaType, data: base64 } },
            { text: USER_PROMPT }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw httpError(res.status === 429 ? 429 : 502,
      `Gemini error ${res.status}${detail ? ': ' + truncate(detail) : ''}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason;
    throw httpError(502, reason ? `Gemini blocked the request (${reason})` : 'Gemini returned no candidates');
  }
  const text = (cand.content?.parts || []).map((p) => p.text).filter(Boolean).join('');
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
