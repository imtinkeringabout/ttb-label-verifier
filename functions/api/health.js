import { checkAccess } from './_lib/auth.js';
import { rateSnapshot } from './_lib/ratelimit.js';
import { providerName } from './_providers/index.js';

// POST /api/health  { accessCode? }
// Lightweight authed endpoint the access gate uses to validate the code and read
// remaining quota. Does NOT call the model or increment rate counters.
export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const access = checkAccess(request, env, body.accessCode);
  if (!access.ok) {
    return json({ ok: false, code: 'unauthorized' }, 401);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rate = await rateSnapshot(env, ip);
  return json({ ok: true, open: !!access.open, provider: providerName(env), rate }, 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
