import * as gemini from './gemini.js';
import * as claude from './claude.js';
import * as ollama from './ollama.js';

// Pluggable backend. PROVIDER env var picks the model; everything else in the app
// is provider-agnostic because all three return the same normalized shape.
const PROVIDERS = { gemini, claude, ollama };

export function providerName(env) {
  return (env.PROVIDER || 'gemini').toLowerCase();
}

export async function extractFields(base64, mediaType, env) {
  const name = providerName(env);
  const provider = PROVIDERS[name];
  if (!provider) {
    const e = new Error(`Unknown PROVIDER "${name}" (expected gemini, claude, or ollama)`);
    e.status = 500;
    throw e;
  }
  return provider.extract(base64, mediaType, env);
}
