// Shared-access-code gate. Deliberately simple: a prototype behind HTTPS, with
// rate limiting (see ratelimit.js) as the real backstop against abuse. If
// ACCESS_CODE is not configured, the API runs OPEN so local dev just works.

export function checkAccess(request, env, bodyCode) {
  const expected = env.ACCESS_CODE;
  if (!expected) return { ok: true, open: true };
  const provided = bodyCode || request.headers.get('x-access-code') || '';
  return { ok: timingSafeEqual(provided, expected), open: false };
}

// Length-independent, constant-time-ish comparison to avoid trivial timing leaks.
function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
