// Recherche du site officiel d'un refuge sur refuges.info
const BAD_HOST = /refuges\.info|openstreetmap|creativecommons|legifrance|wikipedia/i;
const SITE_RE = /Site officiel\s*:?\s*(?:<[^>]*>\s*)*<a\s[^>]*href=["']([^"']+)["']/i;
const UA = 'carte-zones/1.0 (usage personnel)';
const ok = x => typeof x === 'string' && /^https?:\/\//i.test(x.trim()) && !BAD_HOST.test(x);

function findSite(o) {
  let found = null;
  (function scan(x, key) {
    if (found || x == null) return;
    if (typeof x === 'string') {
      if (/site|web|url|officiel/i.test(key) && ok(x)) found = x.trim();
    } else if (typeof x === 'object') {
      const vals = Object.values(x).filter(v => typeof v === 'string');
      if (vals.some(v => /site/i.test(v) && !/^https?:/i.test(v) && v.length < 40)) {
        const u = vals.find(ok);
        if (u) { found = u.trim(); return; }
      }
      for (const k in x) scan(x[k], key + '.' + k);
    }
  })(o, '');
  return found;
}

async function lookupSite(id, lien) {
  let site = null, reached = false;
  try {
    const r = await fetch(`https://www.refuges.info/api/point?id=${id}&detail=complet&format=geojson`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (r.ok) { reached = true; site = findSite(await r.json()); }
  } catch (e) { /* on tente la fiche HTML */ }
  if (!site && /^https:\/\/www\.refuges\.info\//.test(lien || '')) {
    try {
      const r = await fetch(lien, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        reached = true;
        const m = (await r.text()).match(SITE_RE);
        if (m && /^https?:\/\//i.test(m[1])) site = m[1].replace(/&amp;/g, '&');
      }
    } catch (e) { /* ignoré */ }
  }
  return { site, reached };
}
module.exports = { findSite, lookupSite, UA };
