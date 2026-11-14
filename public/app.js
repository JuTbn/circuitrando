const map = L.map('map', { renderer: L.canvas({ tolerance: 8 }) }).setView([46.6, 2.5], 6);

// Fonds de carte
const ign = (layer, fmt = 'image/png') => L.tileLayer(
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + layer +
  '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=' + fmt + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  { maxZoom: 19, attribution: '© IGN' });
const bases = {
  'Plan IGN': ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'),
  'Photos aériennes IGN': ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
  'Relief (OpenTopoMap)': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap, © OpenStreetMap' }),
  'Clair (CARTO)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© CARTO, © OpenStreetMap' })
};
const baseSel = document.getElementById('base');
Object.keys(bases).forEach(k => baseSel.add(new Option(k, k)));
let currentBase = bases['Plan IGN'].addTo(map);
baseSel.onchange = () => { map.removeLayer(currentBase); currentBase = bases[baseSel.value].addTo(map); currentBase.bringToBack(); };

// Calques
const palette = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e8590c', '#0c8599', '#c2255c'];
const items = [];
let uid = 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function styleFor(it) {
  return f => {
    const pt = f && f.geometry && /Point/.test(f.geometry.type);
    return { color: it.color, weight: 3, opacity: .9, fillColor: it.color, fillOpacity: pt ? .85 : it.opacity };
  };
}

// Points d'intérêt (refuges.info)
const CATS = {
  cabane:     { label: 'Cabane non gardée', color: '#8c5a2b', glyph: '⌂' },
  refuge:     { label: 'Refuge gardé',      color: '#c92a2a', glyph: 'R' },
  gite:       { label: 'Gîte d’étape',      color: '#7048e8', glyph: 'G' },
  pt_eau:     { label: 'Point d’eau',       color: '#1c7ed6', glyph: '💧' },
  pt_passage: { label: 'Passage délicat',   color: '#f08c00', glyph: '⚠' }
};
function catOf(p) {
  const t = ((p && p.type && p.type.valeur) || '').toLowerCase();
  if (/\beau\b/.test(t)) return 'pt_eau';
  if (/passage/.test(t)) return 'pt_passage';
  if (/g[iî]te/.test(t)) return 'gite';
  if (/cabane/.test(t)) return 'cabane';
  if (/refuge/.test(t)) return 'refuge';
  return null;
}
const siteCache = {};
async function loadSite(id, lien) {
  if (id in siteCache) return siteCache[id];
  const r = await fetch('/api/refuges/site?id=' + encodeURIComponent(id) + '&lien=' + encodeURIComponent(lien || ''));
  if (!r.ok) throw new Error('réponse ' + r.status);
  return (siteCache[id] = (await r.json()).site || null);
}
function poiPopup(p, cat) {
  const c = CATS[cat], t = (p.type && p.type.valeur) || (c && c.label) || '';
  const alt = p.coord && p.coord.alt, pl = p.places && p.places.valeur;
  const wantSite = ['refuge', 'gite', 'cabane'].includes(cat) && p.id;
  const box = document.createElement('div');
  box.innerHTML = '<strong>' + esc(p.nom || p.name || 'Point') + '</strong>' + (t ? '<br>' + esc(t) : '') +
    (alt ? '<br>Altitude : ' + esc(alt) + ' m' : '') +
    (pl !== undefined && pl !== '' && pl !== null ? '<br>Couchages : ' + esc(pl) : '') +
    (p.etat && p.etat.valeur ? '<br>État : ' + esc(p.etat.valeur) : '') +
    (wantSite ? '<br><span class="site">Site web : recherche…</span>' : '') +
    (p.lien && /^https:\/\/www\.refuges\.info\//.test(p.lien) ? '<br><a href="' + esc(p.lien) + '" target="_blank" rel="noopener">Fiche sur refuges.info</a>' : '');
  const span = box.querySelector('.site');
  if (span) loadSite(p.id, p.lien).then(u => {
    if (!u) { span.textContent = 'Site web : non trouvé (voir la fiche)'; return; }
    let host = u; try { host = new URL(u).hostname; } catch (e) {}
    span.innerHTML = 'Site web : <a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(host) + '</a>';
  }).catch(() => { span.textContent = 'Site web : indisponible depuis cette page (voir la fiche)'; });
  return box;
}
function refreshPoi(it) {
  it.layer.clearLayers();
  it.feats.filter(f => it.cats[f.cat]).forEach(f => {
    const c = CATS[f.cat];
    L.marker(f.ll, {
      icon: L.divIcon({ className: '', html: '<div class="poi" style="background:' + c.color + '">' + c.glyph + '</div>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] }),
      title: f.p.nom || c.label
    }).bindPopup(() => poiPopup(f.p, f.cat)).addTo(it.layer);
  });
}
let statusT;
function setStatus(m) { const e = document.getElementById('status'); e.textContent = m; clearTimeout(statusT); if (m) statusT = setTimeout(() => e.textContent = '', 12000); }
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
async function addPois(trackName, lines, maxM = 1000) {
  const all = [].concat(...lines);
  if (all.length < 2) return;
  let w = 180, s = 90, e = -180, n = -90;
  for (const q of all) { w = Math.min(w, q[0]); e = Math.max(e, q[0]); s = Math.min(s, q[1]); n = Math.max(n, q[1]); }
  const kx = 111320 * Math.cos((s + n) / 2 * Math.PI / 180), ky = 110540;
  const dLon = maxM * 1.2 / kx, dLat = maxM * 1.2 / ky;
  setStatus('Recherche des refuges et points d’eau autour de « ' + trackName + ' »…');
  try {
    const url = '/api/refuges/bbox?bbox=' + [w - dLon, s - dLat, e + dLon, n + dLat].map(v => v.toFixed(4)).join(',') +
      '&type_points=cabane,refuge,gite,pt_eau,pt_passage&nb_points=all';
    const r = await fetch(url);
    if (!r.ok) throw new Error('réponse ' + r.status);
    const gj = await r.json();
    const k = Math.max(1, Math.floor(all.length / 1500)), segs = [];
    lines.forEach(ln => {
      const pts = ln.filter((_, i) => i % k === 0 || i === ln.length - 1).map(q => [q[0] * kx, q[1] * ky]);
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    });
    const feats = [];
    (gj.features || []).forEach(f => {
      if (!f.geometry || f.geometry.type !== 'Point') return;
      const cat = catOf(f.properties);
      if (!cat) return;
      const px = f.geometry.coordinates[0] * kx, py = f.geometry.coordinates[1] * ky;
      let d = Infinity;
      for (const sg of segs) { d = Math.min(d, segDist(px, py, sg[0], sg[1])); if (d <= maxM) break; }
      if (d <= maxM) feats.push({ ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]], cat, p: f.properties });
    });
    if (!feats.length) { setStatus('Aucun point référencé à moins de ' + maxM / 1000 + ' km du tracé.'); return; }
    addItem({ kind: 'poi', name: 'Points autour de ' + trackName, feats }, false);
    setStatus(feats.length + ' points trouvés autour du tracé.');
  } catch (err) {
    setStatus('Points autour du tracé indisponibles (' + err.message + ').');
  }
}
function autoPois(it) {
  if (!it || it.kind || !it.gj || !document.getElementById('autoPoi').checked) return;
  const gj = it.gj, fs = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [];
  const lines = fs.map(f => lineCoords(f.geometry)).filter(c => c && c.length > 1);
  if (lines.length) addPois(it.name, lines);
}

// Profil altimétrique
let hoverMk = null;
function clearHover() { if (hoverMk) { map.removeLayer(hoverMk); hoverMk = null; } }
function lineCoords(g) {
  if (!g) return null;
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString') return [].concat(...g.coordinates);
  return null;
}
function hav(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function computeProfile(c) {
  const pts = c.filter(p => typeof p[2] === 'number' && isFinite(p[2]));
  if (pts.length < 2 || pts.length < c.length * 0.8) return null;
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + hav(pts[i - 1], pts[i]));
  const w = 3, n = pts.length;
  const ele = pts.map((p, i) => {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += pts[j][2]; k++; }
    return s / k;
  });
  let up = 0, down = 0, ref = ele[0];
  for (const e of ele) {
    if (e - ref >= 3) { up += e - ref; ref = e; }
    else if (ref - e >= 3) { down += ref - e; ref = e; }
  }
  const min = Math.min(...ele), max = Math.max(...ele);
  if (max - min < 1 || dist[n - 1] < 1) return null;
  return { pts, dist, ele, up, down, min, max, total: dist[n - 1] };
}
const fr = (v, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

function profilePopup(name, coords, color) {
  const P = computeProfile(coords);
  if (!P) return null;
  const W = 320, H = 140, L0 = 42, R0 = 8, T0 = 8, B0 = 22, n = P.pts.length;
  const lo = Math.floor(P.min / 10) * 10, hi = Math.max(Math.ceil(P.max / 10) * 10, lo + 10);
  const x = d => L0 + (d / P.total) * (W - L0 - R0);
  const y = e => T0 + (1 - (e - lo) / (hi - lo)) * (H - T0 - B0);
  const step = Math.max(1, Math.floor(n / 320)), idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const line = idx.map(i => x(P.dist[i]).toFixed(1) + ',' + y(P.ele[i]).toFixed(1)).join('L');
  const yt = [lo, (lo + hi) / 2, hi], xt = [0, P.total / 2, P.total];
  const grid = yt.map(v => '<line x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e1e8ec"/>' +
      '<text x="' + (L0 - 5) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#667781">' + fr(v) + '</text>').join('') +
    xt.map((v, i) => '<text x="' + x(v) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') +
      '" font-size="10" fill="#667781">' + fr(v / 1000, 1) + ' km</text>').join('');
  const box = document.createElement('div');
  box.className = 'prof';
  box.innerHTML = '<h3>' + esc(name) + '</h3>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Profil altimétrique">' + grid +
    '<path d="M' + line + 'L' + x(P.total) + ',' + (H - B0) + 'L' + L0 + ',' + (H - B0) + 'Z" fill="' + color + '" fill-opacity=".22"/>' +
    '<path d="M' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>' +
    '<line id="pv" y1="' + T0 + '" y2="' + (H - B0) + '" stroke="#14232c" stroke-width="1" visibility="hidden"/>' +
    '<text id="pt" x="' + (L0 + 4) + '" y="' + (T0 + 10) + '" font-size="11" font-weight="600" fill="#14232c"></text></svg>' +
    '<div class="stats"><span><b>' + fr(P.total / 1000, 1) + ' km</b>distance</span><span><b>+' + fr(P.up) + ' m</b>dénivelé +</span>' +
    '<span><b>−' + fr(P.down) + ' m</b>dénivelé −</span><span><b>' + fr(P.min) + ' m</b>altitude min.</span>' +
    '<span><b>' + fr(P.max) + ' m</b>altitude max.</span></div>';
  const svg = box.querySelector('svg'), pv = svg.querySelector('#pv'), pt = svg.querySelector('#pt');
  const move = e => {
    const r = svg.getBoundingClientRect();
    const xv = (e.clientX - r.left) / r.width * W;
    const d = Math.min(Math.max((xv - L0) / (W - L0 - R0), 0), 1) * P.total;
    let a = 0, b = n - 1;
    while (a < b) { const m = (a + b) >> 1; P.dist[m] < d ? a = m + 1 : b = m; }
    pv.setAttribute('x1', x(P.dist[a])); pv.setAttribute('x2', x(P.dist[a])); pv.setAttribute('visibility', 'visible');
    pt.textContent = fr(P.dist[a] / 1000, 2) + ' km · ' + fr(P.ele[a]) + ' m';
    const ll = [P.pts[a][1], P.pts[a][0]];
    if (!hoverMk) hoverMk = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#14232c', fillOpacity: 1, interactive: false }).addTo(map);
    else hoverMk.setLatLng(ll);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { pv.setAttribute('visibility', 'hidden'); pt.textContent = ''; clearHover(); });
  return box;
}

function build(it) {
  if (it.kind === 'poi') {
    it.layer = L.featureGroup();
    if (!it.cats) it.cats = Object.fromEntries(Object.keys(CATS).map(k => [k, true]));
    refreshPoi(it);
  } else {
    it.layer = L.geoJSON(it.gj, {
      style: styleFor(it),
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6 }),
      onEachFeature: (f, l) => {
        const p = f.properties || {};
        const lc = lineCoords(f.geometry);
        if (lc && !p.lien) {
          if (computeProfile(lc)) {
            l.bindPopup(() => profilePopup((p.name || p.nom || 'Tracé'), lc, it.color), { minWidth: 280, maxWidth: 360 });
            l.on('popupclose', clearHover);
          }
        }
        const k = Object.keys(p).find(x => /(^|_)(nom|name|lib|label)|libelle/i.test(x) && typeof p[x] === 'string');
        const n = k && p[k];
        if (n) l.bindTooltip(esc(n), { sticky: true });
        if (p.lien && /^https:\/\/www\.refuges\.info\//.test(p.lien)) l.bindPopup(() => poiPopup(p, catOf(p)));
      }
    });
  }
  if (it.visible) it.layer.addTo(map);
}

function addItem(data, fit = true) {
  const it = Object.assign({ id: ++uid, visible: true, opacity: .35,
    color: palette[items.length % palette.length] }, data);
  items.push(it);
  build(it);
  render();
  if (fit && it.layer.getBounds) {
    const b = it.layer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
  }
  return it;
}

function render() {
  const ul = document.getElementById('layers');
  document.getElementById('empty').style.display = items.length ? 'none' : '';
  ul.innerHTML = '';
  items.forEach(it => {
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="row"><input type="checkbox" ' + (it.visible ? 'checked' : '') + ' aria-label="Afficher">' +
      '<span class="name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
      (it.kind === 'poi' ? '' : '<input type="color" value="' + it.color + '" aria-label="Couleur">') + '</div>' +
      '<div class="row tools">' + (it.kind === 'poi' ? '' : '<input type="range" min="0" max="1" step=".05" value="' + it.opacity + '" aria-label="Opacité">') +
      '<button data-a="zoom">Centrer</button>' +
      '<button data-a="del">Supprimer</button></div>';
    li.style.borderLeftColor = it.kind === 'poi' ? '#667781' : it.color;
    const [chk, color] = li.querySelectorAll('input[type=checkbox],input[type=color]');
    chk.onchange = () => { it.visible = chk.checked; chk.checked ? it.layer.addTo(map) : map.removeLayer(it.layer); };
    if (color) color.oninput = () => { it.color = color.value; li.style.borderLeftColor = it.color; it.layer.setStyle(styleFor(it)); };
    const rg = li.querySelector('input[type=range]');
    if (rg) rg.oninput = e => {
      it.opacity = +e.target.value;
      it.layer.setStyle(styleFor(it));
    };
    li.querySelector('[data-a=del]').onclick = () => { map.removeLayer(it.layer); items.splice(items.indexOf(it), 1); render(); };
    const z = li.querySelector('[data-a=zoom]');
    if (z) z.onclick = () => { const b = it.layer.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [30, 30] }); };
    if (it.kind === 'poi') {
      const cnt = {};
      it.feats.forEach(f => cnt[f.cat] = (cnt[f.cat] || 0) + 1);
      const d = document.createElement('div');
      d.className = 'chips';
      Object.keys(CATS).forEach(k => {
        if (!cnt[k]) return;
        const lb = document.createElement('label');
        lb.innerHTML = '<input type="checkbox" ' + (it.cats[k] ? 'checked' : '') + '><span class="dot" style="background:' + CATS[k].color + '"></span>' +
          esc(CATS[k].label) + ' (' + cnt[k] + ')';
        lb.querySelector('input').onchange = e => { it.cats[k] = e.target.checked; refreshPoi(it); };
        d.appendChild(lb);
      });
      li.appendChild(d);
    }
    ul.appendChild(li);
  });
}

// Import de fichiers
function toast(msg) { alert(msg); }

function ingest(txt, ext, name) {
  try {
    if (ext === 'gpx' || ext === 'kml') {
      const dom = new DOMParser().parseFromString(txt, 'text/xml');
      if (dom.querySelector('parsererror')) throw new Error('XML invalide');
      autoPois(addItem({ name, gj: ext === 'gpx' ? toGeoJSON.gpx(dom) : toGeoJSON.kml(dom) }));
    } else {
      const gj = JSON.parse(txt);
      if (gj.app === 'carte-zones') return loadProject(gj);
      if (gj.type === 'Topology') throw new Error('Le TopoJSON n’est pas géré : convertissez-le en GeoJSON.');
      autoPois(addItem({ name, gj }));
    }
  } catch (e) {
    toast('Impossible de lire « ' + name + ' » : ' + e.message);
  }
}

async function readFile(file) {
  ingest(await file.text(), file.name.split('.').pop().toLowerCase(), file.name.replace(/\.[^.]+$/, ''));
}

async function loadUrl(url, name) {
  url = (url || '').trim();
  if (!url) return toast('Collez l’adresse d’un fichier.');
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('réponse ' + r.status);
    const txt = await r.text();
    const path = url.split('?')[0].replace(/\/(raw|download)\/?$/, '').replace(/\/$/, '');
    const last = path.split('/').pop() || 'calque';
    const ext = (last.split('.').pop() || '').toLowerCase();
    const trimmed = txt.trimStart();
    ingest(txt, trimmed.startsWith('<') ? (/<gpx/i.test(txt) ? 'gpx' : 'kml') : 'json',
           name || last.replace(/\.[^.]+$/, ''));
  } catch (e) {
    toast('Chargement impossible (' + e.message + '). Le serveur bloque peut-être l’accès depuis cette page : téléchargez le fichier et déposez-le dans la carte.');
  }
}

function loadProject(p) {
  items.splice(0).forEach(it => map.removeLayer(it.layer));
  p.layers.forEach(l => addItem(l, false));
}

const drop = document.getElementById('drop'), fileIn = document.getElementById('file');
fileIn.onchange = () => { [...fileIn.files].forEach(readFile); fileIn.value = ''; };
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
window.addEventListener('drop', e => [...e.dataTransfer.files].forEach(readFile));

// Chargement par adresse
document.getElementById('urlAdd').onclick = () => loadUrl(document.getElementById('urlIn').value);
document.getElementById('pnr').onclick = () =>
  loadUrl('https://data-interne.ademe.fr/data-fair/api/v1/datasets/pnr/raw', 'Parcs naturels régionaux');

document.getElementById('refView').onclick = () => {
  const b = map.getBounds();
  if (map.getZoom() < 9) return toast('Zoomez d’abord sur la zone voulue (niveau 9 ou plus) pour ne pas charger trop de points.');
  loadUrl('/api/refuges/bbox?bbox=' + [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(x => x.toFixed(4)).join(',') +
    '&type_points=all', 'Refuges (zone affichée)');
};


// Projet
document.getElementById('save').onclick = () => {
  const data = projectData();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = 'projet-carte.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById('open').onclick = () => document.getElementById('proj').click();
document.getElementById('proj').onchange = e => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; };

// --- Projets enregistrés sur le serveur (PostgreSQL)
function projectData() {
  return { app: 'carte-zones', layers: items.map(({ kind, name, gj, url, layers, color, opacity, visible, feats, cats }) =>
    ({ kind, name, gj, url, layers, color, opacity, visible, feats, cats })) };
}
async function api(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error('réponse ' + r.status);
  return r.status === 204 ? null : r.json();
}
const jsonOpt = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const srvList = document.getElementById('srvList'), projName = document.getElementById('projName');
let projects = [];

async function refreshProjects(selectId) {
  try {
    projects = await api('/api/projects');
    srvList.innerHTML = '';
    projects.forEach(p => srvList.add(new Option(p.name + ' (' + new Date(p.updated_at).toLocaleDateString('fr-FR') + ')', p.id)));
    if (selectId) srvList.value = selectId;
  } catch (e) { setStatus('Serveur de projets indisponible (' + e.message + ').'); }
}
document.getElementById('srvSave').onclick = async () => {
  const name = projName.value.trim();
  if (!name) return toast('Donnez un nom au projet.');
  if (!items.length) return toast('Aucun calque à enregistrer.');
  try {
    const ex = projects.find(p => p.name === name);
    const r = await api(ex ? '/api/projects/' + ex.id : '/api/projects', jsonOpt(ex ? 'PUT' : 'POST', { name, data: projectData() }));
    setStatus('Projet « ' + name + ' » enregistré.');
    await refreshProjects(r.id);
  } catch (e) { toast('Enregistrement impossible : ' + e.message); }
};
document.getElementById('srvOpen').onclick = async () => {
  if (!srvList.value) return;
  try {
    const p = await api('/api/projects/' + srvList.value);
    loadProject(p.data);
    projName.value = p.name;
    setStatus('Projet « ' + p.name + ' » ouvert.');
  } catch (e) { toast('Ouverture impossible : ' + e.message); }
};
document.getElementById('srvDel').onclick = async () => {
  const p = projects.find(x => String(x.id) === srvList.value);
  if (!p || !confirm('Supprimer le projet « ' + p.name + ' » ?')) return;
  try { await api('/api/projects/' + p.id, { method: 'DELETE' }); await refreshProjects(); }
  catch (e) { toast('Suppression impossible : ' + e.message); }
};
refreshProjects();
