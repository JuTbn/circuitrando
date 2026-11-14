# index.HTML

<section>
    <h2>Ajouter un service WMS</h2>
    <input type="text" id="wmsUrl" placeholder="Adresse du service WMS">
    <input type="text" id="wmsLayers" placeholder="Nom de la couche (ex. : couche1,couche2)">
    <button id="wmsAdd">Ajouter le service</button>
</section>

# style.CSS

#wmsAdd,#save{background:var(--accent);border-color:var(--accent);color:#fff}
#wmsAdd:hover,#save:hover{background:var(--accent-d);border-color:var(--accent-d);color:#fff}


# app.js

function build(it) {
    ...
    } else if (it.kind === 'wms') {
        it.layer = L.tileLayer.wms(it.url, {    layers: it.layers, format: 'image/png',    transparent: true, opacity: it.opacity });
    } 
    ...
}

... ... 

function addItem(data, fit = true) {
  const it = Object.assign({ id: ++uid, visible: true, opacity: data.kind === 'wms' ? .7 : .35,
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

... ... 

function render() {
  const ul = document.getElementById('layers');
  document.getElementById('empty').style.display = items.length ? 'none' : '';
  ul.innerHTML = '';
  items.forEach(it => {
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="row"><input type="checkbox" ' + (it.visible ? 'checked' : '') + ' aria-label="Afficher">' +
      '<span class="name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
      (it.kind === 'wms' || it.kind === 'poi' ? '' : '<input type="color" value="' + it.color + '" aria-label="Couleur">') + '</div>' +
      '<div class="row tools">' + (it.kind === 'poi' ? '' : '<input type="range" min="0" max="1" step=".05" value="' + it.opacity + '" aria-label="Opacité">') +
      (it.kind === 'wms' ? '' : '<button data-a="zoom">Centrer</button>') +
      '<button data-a="del">Supprimer</button></div>';
    li.style.borderLeftColor = (it.kind === 'wms' || it.kind === 'poi') ? '#667781' : it.color;
    const [chk, color] = li.querySelectorAll('input[type=checkbox],input[type=color]');
    chk.onchange = () => { it.visible = chk.checked; chk.checked ? it.layer.addTo(map) : map.removeLayer(it.layer); };
    if (color) color.oninput = () => { it.color = color.value; li.style.borderLeftColor = it.color; it.layer.setStyle(styleFor(it)); };
    const rg = li.querySelector('input[type=range]');
    if (rg) rg.oninput = e => {
      it.opacity = +e.target.value;
      it.kind === 'wms' ? it.layer.setOpacity(it.opacity) : it.layer.setStyle(styleFor(it));
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


// WMS
document.getElementById('wmsAdd').onclick = () => {
  const url = document.getElementById('wmsUrl').value.trim();
  const layers = document.getElementById('wmsLayers').value.trim();
  if (!url || !layers) return toast('Indiquez l’adresse du service et le nom de la couche.');
  addItem({ kind: 'wms', name: layers, url, layers }, false);
};