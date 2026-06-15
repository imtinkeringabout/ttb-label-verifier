import { checkAccess } from './_lib/auth.js';
import { rateLimit } from './_lib/ratelimit.js';
import { verifyTurnstile } from './_lib/turnstile.js';
import { extractFields, providerName } from './_providers/index.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// POST /api/analyze
// Body: { image: <base64, no data: prefix>, mediaType, accessCode?, turnstileToken? }
// The browser never sees an API key — this function holds it and proxies the call.
export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const { image, mediaType, accessCode, turnstileToken } = body || {};

    // 1) Access gate
    const access = checkAccess(request, env, accessCode);
    if (!access.ok) {
      return json({ error: 'Invalid or missing access code', code: 'unauthorized' }, 401);
    }

    // 2) Optional bot check (inert unless TURNSTILE_SECRET is set)
    const ts = await verifyTurnstile(env, turnstileToken, ip);
    if (!ts.ok) {
      return json({ error: 'Bot verification failed', code: 'turnstile' }, 403);
    }

    // 3) Validate input BEFORE spending a model call
    if (!image || typeof image !== 'string') {
      return json({ error: 'Missing image data' }, 400);
    }
    if (!ALLOWED_TYPES.includes(mediaType)) {
      return json({ error: `Unsupported image type. Use ${ALLOWED_TYPES.join(', ')}.` }, 415);
    }
    const maxMb = parseFloat(env.MAX_IMAGE_MB || '5');
    const approxBytes = Math.floor(image.length * 0.75); // base64 -> bytes
    if (approxBytes > maxMb * 1024 * 1024) {
      return json({ error: `Image exceeds ${maxMb} MB limit.`, code: 'too_large' }, 413);
    }

    // 4) Rate limit (after cheap validation, before the paid/quota'd call)
    const rl = await rateLimit(env, ip);
    if (!rl.ok) {
      return json(
        {
          error:
            rl.scope === 'global'
              ? 'Daily usage limit reached for this demo. Please try again tomorrow.'
              : 'Too many requests. Please wait a bit before trying again.',
          code: 'rate_limited',
          scope: rl.scope
        },
        429,
        rlHeaders(rl)
      );
    }

    // 5) Model call
    const extracted = await extractFields(image, mediaType, env);

    return json({ extracted, provider: providerName(env) }, 200, rlHeaders(rl));
  } catch (err) {
    const status = err.status || 500;
    return json({ error: err.message || 'Analysis failed', code: 'server_error' }, status);
  }
}

function rlHeaders(rl) {
  if (!rl || rl.remaining == null) return {};
  return {
    'X-RateLimit-Limit': String(rl.limit ?? ''),
    'X-RateLimit-Remaining': String(rl.remaining ?? '')
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });
}
