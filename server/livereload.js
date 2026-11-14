// Rechargement automatique du navigateur (développement uniquement, LIVE_RELOAD=1)
const fs = require('fs');
const path = require('path');

module.exports = function liveReload(app, dir) {
  const clients = new Set();
  const SNIPPET = `<script>(() => {
  const es = new EventSource('/__livereload');
  let down = false;
  es.onerror = () => { down = true; };
  es.onopen = () => { if (down) location.reload(); };
  es.addEventListener('reload', () => location.reload());
  es.addEventListener('css', () => document.querySelectorAll('link[rel=stylesheet]').forEach(l => {
    const u = new URL(l.href);
    if (u.origin === location.origin) { u.searchParams.set('_', Date.now()); l.href = u.href; }
  }));
})();</script>`;

  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/__livereload', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  app.get(['/', '/index.html'], (req, res, next) => {
    fs.readFile(path.join(dir, 'index.html'), 'utf8', (err, html) =>
      err ? next() : res.type('html').send(html.replace('</body>', SNIPPET + '</body>')));
  });

  // Surveillance par sondage : fonctionne aussi avec les dossiers partagés Docker (Windows, macOS)
  const snapshot = () => {
    const m = {};
    (function walk(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        f.isDirectory() ? walk(p) : (m[p] = fs.statSync(p).mtimeMs);
      }
    })(dir);
    return m;
  };
  let prev = snapshot();
  setInterval(() => {
    let cur;
    try { cur = snapshot(); } catch (e) { return; }
    const changed = [...new Set([...Object.keys(cur), ...Object.keys(prev)])].filter(k => cur[k] !== prev[k]);
    prev = cur;
    if (!changed.length) return;
    const names = changed.map(f => path.basename(f)).join(',');
    const event = changed.every(f => f.endsWith('.css')) ? 'css' : 'reload';
    clients.forEach(c => c.write(`event: ${event}\ndata: ${names}\n\n`));
    console.log(`[livereload] ${names} → ${event}`);
  }, 400);
  console.log('Rechargement automatique actif');
};
