// Soft rate limiting on Workers KV. KV is eventually consistent, so this is a
// best-effort throttle — plenty to protect a free-tier quota and a demo URL, but
// not a hard transactional limit. If no RATE_LIMIT KV namespace is bound, limiting
// is skipped entirely (the app still works).
//
// Two ceilings:
//   - per-IP per hour  -> stops one client from hammering
//   - global per day    -> hard cap on total spend / quota burn (anti-bill-bomb)

export async function rateLimit(env, ip) {
  const kv = env.RATE_LIMIT;
  if (!kv) return { ok: true, enforced: false, remaining: null, limit: null };

  const globalCap = intEnv(env.RL_GLOBAL_PER_DAY, 200);
  const ipCap = intEnv(env.RL_IP_PER_HOUR, 20);

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const gKey = `rl:g:${day}`;
  const iKey = `rl:i:${ip}:${hour}`;

  const [gRaw, iRaw] = await Promise.all([kv.get(gKey), kv.get(iKey)]);
  const gCount = parseInt(gRaw || '0', 10);
  const iCount = parseInt(iRaw || '0', 10);

  if (gCount >= globalCap) return { ok: false, enforced: true, scope: 'global', limit: globalCap, remaining: 0 };
  if (iCount >= ipCap) return { ok: false, enforced: true, scope: 'ip', limit: ipCap, remaining: 0 };

  await Promise.all([
    kv.put(gKey, String(gCount + 1), { expirationTtl: 60 * 60 * 36 }),
    kv.put(iKey, String(iCount + 1), { expirationTtl: 60 * 60 * 2 })
  ]);

  return {
    ok: true,
    enforced: true,
    scope: null,
    limit: ipCap,
    remaining: Math.max(0, ipCap - (iCount + 1)),
    globalRemaining: Math.max(0, globalCap - (gCount + 1))
  };
}

// Read-only snapshot for the health/quota endpoint (does NOT increment counters).
export async function rateSnapshot(env, ip) {
  const kv = env.RATE_LIMIT;
  if (!kv) return { enforced: false };
  const ipCap = intEnv(env.RL_IP_PER_HOUR, 20);
  const globalCap = intEnv(env.RL_GLOBAL_PER_DAY, 200);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const [gRaw, iRaw] = await Promise.all([kv.get(`rl:g:${day}`), kv.get(`rl:i:${ip}:${hour}`)]);
  return {
    enforced: true,
    limit: ipCap,
    remaining: Math.max(0, ipCap - parseInt(iRaw || '0', 10)),
    globalRemaining: Math.max(0, globalCap - parseInt(gRaw || '0', 10))
  };
}

function intEnv(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}
