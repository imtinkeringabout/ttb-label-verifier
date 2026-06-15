// Single source of truth for the extraction contract. Every provider (Gemini,
// Claude, Ollama) uses this same prompt and post-processing, so swapping models
// can't silently drift the output shape.

export const GOV_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink ' +
  'alcoholic beverages during pregnancy because of the risk of birth defects. ' +
  '(2) Consumption of alcoholic beverages impairs your ability to drive a car or ' +
  'operate machinery, and may cause health problems.';

export const SYSTEM_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label compliance analyzer.
Extract information from alcohol beverage label images. Return ONLY valid JSON — no markdown, no commentary, no code fences.

Return exactly this structure (use null for any field not visibly present on the label):
{
  "brand_name": "string or null",
  "class_type": "product class/type designation (e.g. 'Kentucky Straight Bourbon Whiskey') or null",
  "alcohol_content": "ABV percentage and/or proof exactly as shown (e.g. '45% Alc./Vol. (90 Proof)') or null",
  "net_contents": "volume / net contents (e.g. '750 mL') or null",
  "producer_name": "bottler/producer name or null",
  "producer_address": "address as shown or null",
  "country_of_origin": "country if shown or null",
  "government_warning": "full warning text exactly as it appears, or null if absent",
  "government_warning_formatting": {
    "has_bold_caps_header": true or false,
    "appears_complete": true or false,
    "notes": "formatting observations (e.g. header not in all-caps, text very small, statement truncated)"
  },
  "raw_notes": "other observations, including image quality issues such as glare, skew, or blur"
}

Be strict about the government warning: report whether the literal "GOVERNMENT WARNING:" header is rendered in bold all-capital letters, and whether BOTH numbered parts (pregnancy risk AND impairment) are present and legible.`;

export const USER_PROMPT =
  'Extract all required TTB label fields from this alcohol beverage label image. Return only the JSON object.';

// Models occasionally wrap JSON in prose or code fences despite instructions.
// Recover the JSON object defensively.
export function safeParseJson(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty model response');
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

// Guarantee the exact shape downstream code expects, even if a model omits keys.
export function normalizeExtraction(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const f = (o.government_warning_formatting && typeof o.government_warning_formatting === 'object')
    ? o.government_warning_formatting : {};
  return {
    brand_name: o.brand_name ?? null,
    class_type: o.class_type ?? null,
    alcohol_content: o.alcohol_content ?? null,
    net_contents: o.net_contents ?? null,
    producer_name: o.producer_name ?? null,
    producer_address: o.producer_address ?? null,
    country_of_origin: o.country_of_origin ?? null,
    government_warning: o.government_warning ?? null,
    government_warning_formatting: {
      has_bold_caps_header: !!f.has_bold_caps_header,
      appears_complete: !!f.appears_complete,
      notes: f.notes ?? ''
    },
    raw_notes: o.raw_notes ?? ''
  };
}
