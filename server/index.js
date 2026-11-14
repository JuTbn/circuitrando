const path = require('path');
const express = require('express');
const { pool, init } = require('./db');
const { lookupSite, UA } = require('./site');

const app = express();
app.use(express.json({ limit: '50mb' }));
if (process.env.LIVE_RELOAD) require('./livereload')(app, path.join(__dirname, '..', 'public'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'erreur serveur' }); });
const validProject = b => b && typeof b.name === 'string' && b.name.trim() && b.name.length <= 200 &&
  b.data && typeof b.data === 'object' && Array.isArray(b.data.layers);

app.get('/api/health', wrap(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));

// --- Projets
app.get('/api/projects', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC');
  res.json(rows);
}));
app.get('/api/projects/:id(\\d+)', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, data FROM projects WHERE id = $1', [req.params.id]);
  rows[0] ? res.json(rows[0]) : res.sendStatus(404);
}));
app.post('/api/projects', wrap(async (req, res) => {
  if (!validProject(req.body)) return res.status(400).json({ error: 'projet invalide' });
  const { rows } = await pool.query('INSERT INTO projects (name, data) VALUES ($1, $2) RETURNING id, name',
    [req.body.name.trim(), req.body.data]);
  res.status(201).json(rows[0]);
}));
app.put('/api/projects/:id(\\d+)', wrap(async (req, res) => {
  if (!validProject(req.body)) return res.status(400).json({ error: 'projet invalide' });
  const { rows } = await pool.query('UPDATE projects SET name = $2, data = $3, updated_at = now() WHERE id = $1 RETURNING id, name',
    [req.params.id, req.body.name.trim(), req.body.data]);
  rows[0] ? res.json(rows[0]) : res.sendStatus(404);
}));
app.delete('/api/projects/:id(\\d+)', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  res.sendStatus(r.rowCount ? 204 : 404);
}));

// --- Relais vers refuges.info (évite les blocages CORS du navigateur)
app.get('/api/refuges/site', wrap(async (req, res) => {
  const id = String(req.query.id || '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'id invalide' });
  const hit = await pool.query("SELECT site FROM refuge_sites WHERE id = $1 AND fetched_at > now() - interval '30 days'", [id]);
  if (hit.rows[0]) return res.json({ site: hit.rows[0].site });
  const { site, reached } = await lookupSite(id, String(req.query.lien || ''));
  if (!site && !reached) return res.status(502).json({ error: 'refuges.info inaccessible' });
  await pool.query(`INSERT INTO refuge_sites (id, site) VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET site = EXCLUDED.site, fetched_at = now()`, [id, site]);
  res.json({ site });
}));

const ENDPOINTS = new Set(['bbox', 'massif', 'point']);
app.get('/api/refuges/:ep', wrap(async (req, res) => {
  if (!ENDPOINTS.has(req.params.ep)) return res.sendStatus(404);
  const qs = new URLSearchParams(req.query).toString();
  let r;
  try {
    r = await fetch(`https://www.refuges.info/api/${req.params.ep}?${qs}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  } catch (e) { return res.status(502).json({ error: 'refuges.info inaccessible' }); }
  res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(Buffer.from(await r.arrayBuffer()));
}));

const port = process.env.PORT || 3000;
init().then(() => app.listen(port, () => console.log(`Circuit Rando sur http://localhost:${port}`)))
  .catch(e => { console.error('Impossible d’initialiser la base :', e.message); process.exit(1); });
