// Optional Cloudflare Turnstile verification. Completely inert unless
// TURNSTILE_SECRET is configured, so the app runs fine without it.
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return { ok: true, skipped: true };
  if (!token) return { ok: false, skipped: false };

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  const data = await res.json().catch(() => ({ success: false }));
  return { ok: !!data.success, skipped: false };
}
