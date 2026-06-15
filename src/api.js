// Browser-side API client. All model access goes through our own same-origin
// /api/* endpoints — the access code is the only credential the browser holds, and
// it's checked server-side. The model API key never reaches the client.

const CODE_KEY = 'ttb_access_code';

export function getStoredCode() {
  try {
    return sessionStorage.getItem(CODE_KEY) || '';
  } catch {
    return '';
  }
}
export function storeCode(c) {
  try {
    sessionStorage.setItem(CODE_KEY, c);
  } catch {
    /* sessionStorage unavailable (private mode) — code lives only in memory */
  }
}
export function clearCode() {
  try {
    sessionStorage.removeItem(CODE_KEY);
  } catch {
    /* no-op */
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Validate the access code (and read quota) without spending a model call.
export async function verifyAccess(code) {
  const res = await fetch('/api/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: code })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Access denied', data.code || 'unauthorized', res.status);
  return data; // { ok, open, provider, rate }
}

export async function analyzeLabel(base64, mediaType, { turnstileToken } = {}) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': getStoredCode() },
    body: JSON.stringify({ image: base64, mediaType, accessCode: getStoredCode(), turnstileToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, data.code || 'error', res.status);
  }
  const remaining = res.headers.get('X-RateLimit-Remaining');
  return { ...data, remaining: remaining != null && remaining !== '' ? Number(remaining) : null };
}
