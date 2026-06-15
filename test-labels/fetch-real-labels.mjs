// Fetch a handful of real, freely-licensed alcohol label images from Wikimedia
// Commons for local testing. Run: node test-labels/fetch-real-labels.mjs
import { mkdir, writeFile, appendFile } from 'node:fs/promises';

const UA = 'ttb-label-verifier-test/1.0 (interview take-home; arieleliahu@gmail.com)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OUT = 'E:/projects/ttb-label-verifier/test-labels/real';
const CATS = [
  'Category:Beer labels',
  'Category:Wine labels',
  'Category:Whisky labels',
  'Category:Liquor labels',
  'Category:Vodka labels'
];

await mkdir(OUT, { recursive: true });

const perCat = {};
for (const c of CATS) {
  perCat[c] = [];
  try {
    const u = `${API}?action=query&format=json&list=categorymembers&cmtitle=${encodeURIComponent(c)}&cmtype=file&cmlimit=50`;
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    for (const m of j.query?.categorymembers ?? []) {
      if (/\.(jpg|jpeg|png)$/i.test(m.title)) perCat[c].push(m.title);
    }
    console.log(`${c}: ${perCat[c].length} files`);
  } catch (e) {
    console.log('skip', c, e.message);
  }
}

// Interleave across categories for variety, take up to 6.
const pick = [];
for (let i = 0; pick.length < 6 && i < 50; i++) {
  for (const c of CATS) {
    if (perCat[c][i]) { pick.push(perCat[c][i]); if (pick.length >= 6) break; }
  }
}
console.log('picking', pick.length, 'files');

await writeFile(`${OUT}/ATTRIBUTION.txt`, 'Real test labels sourced from Wikimedia Commons (freely licensed).\nname | license | source page\n');
let n = 0;
for (const t of pick) {
  try {
    const u = `${API}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&titles=${encodeURIComponent(t)}`;
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    const page = Object.values(j.query?.pages ?? {})[0];
    const ii = page?.imageinfo?.[0];
    const url = ii?.thumburl || ii?.url;
    if (!url) { console.log('no url', t); continue; }
    n++;
    const ext = (t.match(/\.(jpg|jpeg|png)$/i) || ['.jpg'])[0].toLowerCase();
    const base = t.replace(/^File:/, '').replace(/\.(jpg|jpeg|png)$/i, '').replace(/[^A-Za-z0-9-]/g, '_').slice(0, 38);
    const name = `real-${String(n).padStart(2, '0')}-${base}${ext}`;
    const img = await fetch(url, { headers: { 'User-Agent': UA } });
    const buf = Buffer.from(await img.arrayBuffer());
    await writeFile(`${OUT}/${name}`, buf);
    const lic = ii.extmetadata?.LicenseShortName?.value || 'unknown';
    await appendFile(`${OUT}/ATTRIBUTION.txt`, `${name} | ${lic} | ${ii.descriptionurl}\n`);
    console.log('saved', name, ((buf.length / 1024) | 0) + 'KB', '|', lic);
  } catch (e) {
    console.log('fail', t, e.message);
  }
}
console.log('done, saved', n, 'images to', OUT);
