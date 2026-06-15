// Pure comparison logic — no React, no I/O — so it's trivially unit-testable
// (see test/compare.test.js). This is where the "Dave nuance" lives: brand-name
// case/punctuation differences are matches, not failures.

export const GOV_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink ' +
  'alcoholic beverages during pregnancy because of the risk of birth defects. ' +
  '(2) Consumption of alcoholic beverages impairs your ability to drive a car or ' +
  'operate machinery, and may cause health problems.';

export const FIELDS = [
  { key: 'brand_name', label: 'Brand Name', required: true },
  { key: 'class_type', label: 'Class / Type', required: true },
  { key: 'alcohol_content', label: 'Alcohol Content (ABV)', required: true },
  { key: 'net_contents', label: 'Net Contents', required: true },
  { key: 'producer_name', label: 'Producer / Bottler Name', required: true },
  { key: 'producer_address', label: 'Producer / Bottler Address', required: false },
  { key: 'country_of_origin', label: 'Country of Origin', required: false },
  { key: 'government_warning', label: 'Government Warning Statement', required: true }
];

export const EMPTY_DECLARED = {
  brand_name: '',
  class_type: '',
  alcohol_content: '',
  net_contents: '',
  producer_name: '',
  producer_address: '',
  country_of_origin: '',
  government_warning: ''
};

export function normalize(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function compareField(extracted, declared, fieldKey) {
  // The government warning is mandatory and always checked against the TTB standard,
  // even when the agent leaves the form field blank (Jenny's requirement). So it's
  // handled BEFORE the generic "no declared value -> skip" guards below.
  if (fieldKey === 'government_warning') {
    if (!extracted) return { status: 'missing', note: 'Government warning not found on label' };
    const a = normalize(extracted);
    if (a === normalize(GOV_WARNING)) {
      return { status: 'pass', note: 'Matches standard TTB warning exactly' };
    }
    if (a.includes('government warning') && a.includes('surgeon general')) {
      return { status: 'warn', note: 'Warning present but differs from standard text — manual review advised' };
    }
    return { status: 'fail', note: 'Government warning missing or significantly incorrect' };
  }

  if (!extracted && !declared) return { status: 'skip', note: 'Not provided' };
  if (!extracted) return { status: 'missing', note: 'Not found on label' };
  if (!declared) return { status: 'skip', note: 'No declared value to compare' };

  const a = normalize(extracted);
  const b = normalize(declared);

  if (a === b) return { status: 'pass', note: 'Exact match' };

  // Fuzzy: same after stripping all punctuation/whitespace.
  const stripped = (s) => s.replace(/[^a-z0-9]/g, '');
  if (stripped(a) === stripped(b)) {
    return { status: 'pass', note: 'Match (punctuation/case difference only)' };
  }

  // Partial: one contains the other.
  if (a.includes(b) || b.includes(a)) {
    return { status: 'warn', note: 'Partial match — review recommended' };
  }

  return { status: 'fail', note: 'Mismatch detected' };
}

export function buildResults(extracted, declared) {
  return FIELDS.map((f) => {
    const comp = compareField(extracted[f.key], declared[f.key], f.key);
    const gwFmt = f.key === 'government_warning' ? extracted.government_warning_formatting : null;
    return { ...f, extracted: extracted[f.key], declared: declared[f.key], ...comp, gwFmt };
  });
}

// Overall determination from a result set.
export function overallVerdict(results) {
  const failed = results.filter((r) => r.status === 'fail' || r.status === 'missing').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  if (failed > 0) return 'fail';
  if (warned > 0) return 'warn';
  return 'pass';
}
