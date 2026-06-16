// Fetch real, freely-licensed alcohol label images from Wikimedia Commons for
// local testing. Run: node test-labels/fetch-real-labels.mjs
//
// Filters for English-speaking-country labels and rejects anything dated before
// 1900. (Caveat: genuinely modern labels are usually copyrighted and therefore
// NOT on Commons, so the freely-licensed pool still skews older.)
import { mkdir, writeFile, appendFile, readdir, rm } from 'node:fs/promises';

const UA = 'ttb-label-verifier-test/1.0 (interview take-home; arieleliahu@gmail.com)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OUT = 'E:/projects/ttb-label-verifier/test-labels/real';
const WANT = 8;

// English-speaking regions first, broad fallbacks last.
const SEED_CATS = [
  'Category:Beer labels of the United States',
  'Category:Beer labels of the United Kingdom',
  'Category:Beer labels of Australia',
  'Category:Beer labels of Canada',
  'Category:Wine labels of the United States',
  'Category:Whisky labels',
  'Category:Beer labels',
  'Category:Wine labels'
];

// Reject obvious non-English titles/descriptions.
const NON_EN = /(muskat|\bbier\b|cerveza|cerveja|birra|\bvino\b|\bvin\b|weingut|brauerei|étiquette|flasche|pivo|\böl\b|\bøl\b|rotwein|weiss)/i;

async function api(params) {
  const u = API + '?' + new URLSearchParams({ format: 'json', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  return r.json();
}

async function members(cat, type) {
  const j = await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: type, cmlimit: '80' });
  return j.query?.categorymembers ?? [];
}

function earliestYear(title, meta) {
  const years = [];
  for (const s of [title, meta?.DateTimeOriginal?.value, meta?.DateTime?.value]) {
    const m = String(s || '').match(/\b(18|19|20)\d\d\b/g);
    if (m) years.push(...m.map(Number));
  }
  return years.length ? Math.min(...years) : null;
}

// Collect candidates: files in each seed category, plus files one level down in
// a few subcategories (US/UK beer cats are mostly brand/state subcats).
const candidates = new Set();
for (const cat of SEED_CATS) {
  try {
    const ms = await members(cat, 'file|subcat');
    for (const m of ms) {
      if (m.ns === 6 && /\.(jpe?g|png)$/i.test(m.title)) candidates.add(m.title);
    }
    for (const sub of ms.filter((m) => m.ns === 14).slice(0, 5)) {
      const fm = await members(sub.title, 'file');
      for (const m of fm) if (/\.(jpe?g|png)$/i.test(m.title)) candidates.add(m.title);
    }
    console.log(`${cat}: total candidates ${candidates.size}`);
  } catch (e) {
    console.log('skip', cat, e.message);
  }
}

await mkdir(OUT, { recursive: true });
// Clear previous downloads so the folder reflects the new criteria.
for (const f of await readdir(OUT)) if (/\.(png|jpe?g)$/i.test(f)) await rm(`${OUT}/${f}`);
await writeFile(`${OUT}/ATTRIBUTION.txt`, 'Real test labels from Wikimedia Commons (freely licensed).\nname | year | license | source\n');

let n = 0;
for (const t of candidates) {
  if (n >= WANT) break;
  try {
    const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '900', titles: t });
    const ii = Object.values(j.query?.pages ?? {})[0]?.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata || {};
    const desc = (meta.ImageDescription?.value || '').replace(/<[^>]+>/g, ' ');
    if (NON_EN.test(t) || NON_EN.test(desc)) { console.log('skip non-EN:', t); continue; }
    const yr = earliestYear(t, meta);
    if (yr !== null && yr < 1900) { console.log('skip pre-1900:', t, yr); continue; }
    const url = ii.thumburl || ii.url;
    if (!url) continue;
    n++;
    const ext = (t.match(/\.(jpe?g|png)$/i) || ['.jpg'])[0].toLowerCase();
    const base = t.replace(/^File:/, '').replace(/\.(jpe?g|png)$/i, '').replace(/[^A-Za-z0-9-]/g, '_').slice(0, 40);
    const name = `real-${String(n).padStart(2, '0')}-${base}${ext}`;
    const img = await fetch(url, { headers: { 'User-Agent': UA } });
    await writeFile(`${OUT}/${name}`, Buffer.from(await img.arrayBuffer()));
    await appendFile(`${OUT}/ATTRIBUTION.txt`, `${name} | ${yr ?? '?'} | ${meta.LicenseShortName?.value || '?'} | ${ii.descriptionurl}\n`);
    console.log('saved', name, '| year', yr ?? '?', '|', meta.LicenseShortName?.value || '?');
  } catch (e) {
    console.log('fail', t, e.message);
  }
}
console.log('done, saved', n, 'images to', OUT);
