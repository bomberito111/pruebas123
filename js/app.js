/* ═══════════════════════════════════════════
   app.js — Main init + navigation + utilities
   Bosques Urbanos — forestry engineering app
   Plain <script> tag, all exports on window.
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────── */

window.switchTab = function (tab) {
  // Update nav tab active states
  document.querySelectorAll('.nav-tab').forEach(function (el) {
    el.classList.toggle('active', el.id === 'tab-' + tab);
  });

  // Show / hide views
  var viewIds = ['viewHome', 'viewMap', 'viewDB', 'viewForm'];
  var targetViewId = {
    home: 'viewHome',
    map:  'viewMap',
    db:   'viewDB',
    form: 'viewForm'
  }[tab];

  viewIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active', id === targetViewId);
  });

  // Tab-specific actions
  if (tab === 'home') {
    setTimeout(function () {
      window.initOrRefreshHomeMap && window.initOrRefreshHomeMap();
      window.homeRenderPanel && window.homeRenderPanel();
      window.renderDashboard && window.renderDashboard();
    }, 80);
  }

  if (tab === 'map') {
    setTimeout(function () {
      if (!window.mapInstance) {
        window.initMap && window.initMap();
      } else {
        window.mapInstance.invalidateSize();
        window.refreshMap && window.refreshMap();
      }
    }, 80);
  }

  if (tab === 'db') {
    var lv1 = document.getElementById('db-level-1');
    var lv2 = document.getElementById('db-level-2');
    var lv3 = document.getElementById('db-level-3');
    if (lv1) lv1.style.display = 'flex';
    if (lv2) lv2.style.display = 'none';
    if (lv3) lv3.style.display = 'none';
    if (window.APP) window.APP.dbLevel = 1;
    window.dbRenderLv1 && window.dbRenderLv1();
  }

  if (tab === 'form') {
    // Form view is already shown, nothing extra needed
  }
};

window.closeFormView = function () {
  window.switchTab('home');
};

/* ─────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────── */

var _notifTimer = null;

window.showNotif = function (msg) {
  var el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.add('show');
  if (_notifTimer) clearTimeout(_notifTimer);
  _notifTimer = setTimeout(function () {
    el.classList.remove('show');
    _notifTimer = null;
  }, 3500);
};

/* ─────────────────────────────────────────
   ENGINEER UI
───────────────────────────────────────── */

function updateEngineerUI() {
  var name = (window.APP && window.APP.activeEngineer) || '';
  var hdr = document.getElementById('hdr-engineer');
  if (hdr) hdr.textContent = name || 'Sin evaluador';
  var pill = document.getElementById('eng-pill');
  if (pill) pill.textContent = name || 'Evaluador';
}

window.openEngineerModal = function () {
  var current = (window.APP && window.APP.activeEngineer) || '';
  var name = window.prompt('Nombre del evaluador / ingeniero:', current);
  if (name !== null) {
    window.saveEngineer(name.trim());
    updateEngineerUI();
    window.showNotif('Evaluador actualizado');
  }
};

/* ─────────────────────────────────────────
   CLIENT LIST (datalist + selector)
───────────────────────────────────────── */

window.populateClientList = function () {
  var db = window._dbAll || {};
  var clientsMap = {};

  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var name = window.getClientName(d);
    if (name && name !== '(Sin cliente)') clientsMap[name] = true;
  });

  // Also include clients from _clientesAll
  var ca = window._clientesAll || {};
  Object.keys(ca).forEach(function (key) {
    var c = ca[key];
    var name = c.nombre || c.name || '';
    if (name) clientsMap[name] = true;
  });

  var names = Object.keys(clientsMap).sort();

  // Populate datalist for forms
  var dl = document.getElementById('client-datalist');
  if (dl) {
    dl.innerHTML = names.map(function (n) {
      return '<option value="' + n.replace(/"/g, '&quot;') + '">';
    }).join('');
  }

  // Populate #f-cliente select in DB view
  var fCliente = document.getElementById('f-cliente');
  if (fCliente) {
    var cur = fCliente.value;
    fCliente.innerHTML = '<option value="">Todos</option>';
    names.forEach(function (n) {
      var opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      fCliente.appendChild(opt);
    });
    if (cur && clientsMap[cur]) fCliente.value = cur;
  }

  // Update map client filter too
  window.updateMapFilters && window.updateMapFilters();
};

/* ─────────────────────────────────────────
   FILTERS (DB VIEW)
───────────────────────────────────────── */

window.updateFilters = function () {
  window.populateClientList && window.populateClientList();
  // Re-render current DB level
  if (window.APP && window.APP.dbLevel === 2) {
    window.dbRenderLv2 && window.dbRenderLv2();
  } else if (window.APP && window.APP.dbLevel === 1) {
    window.dbRenderLv1 && window.dbRenderLv1();
  }
  // Refresh dashboard stats
  window.renderDashboard && window.renderDashboard();
  // Refresh home tree list
  window.homeRenderTrees && window.homeRenderTrees();
};

/* ─────────────────────────────────────────
   DEBOUNCE HELPER
───────────────────────────────────────── */

window.debounce = function (fn, wait) {
  var t;
  return function () {
    var args = arguments;
    var ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait || 250);
  };
};

/* ─────────────────────────────────────────
   PHOTO CAPTURE (home panel "add photo")
───────────────────────────────────────── */

function handlePhotoCapture(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) { e.target.value = ''; return; }

  // Wizard mode: hand off to wizard
  if (e.target.dataset.wizMode === '1') {
    e.target.dataset.wizMode = '';
    e.target.value = '';
    window.wizReceivePhoto && window.wizReceivePhoto(file);
    return;
  }

  // Context priority: panel arbolId > detail modal evalKey > home evalKey
  var panelArbolId = e.target.dataset.arbolId || '';
  e.target.dataset.arbolId = '';
  e.target.value = '';

  if (panelArbolId) {
    // Triggered from photos panel per-tree button
    window.panelUploadPhoto && window.panelUploadPhoto(file, panelArbolId);
    return;
  }

  // Detail modal context (triggerPhotoInput sets APP.detailKey)
  var evalKey = (window.APP && window.APP.detailKey) || (window.APP && window.APP.homePhotoKey);
  if (!evalKey) { window.showNotif('Selecciona un árbol primero'); return; }
  window.APP.detailKey = null;
  window.APP.homePhotoKey = null;

  window.showNotif('Subiendo foto...');
  var d = window._dbAll && window._dbAll[evalKey];
  var clienteId = d ? (window.getClientName(d) || 'unknown') : 'unknown';
  var arbolId   = d ? (d.arbolId || evalKey) : evalKey;

  window.FB.uploadPhoto(clienteId, arbolId, file)
    .then(function (res) { return window.FB.addPhotoToEval(evalKey, res.url); })
    .then(function () {
      window.showNotif('📸 Foto guardada');
      window.homeRenderTrees && window.homeRenderTrees();
      window.renderPanelPhotos && window.renderPanelPhotos();
    })
    .catch(function (err) {
      console.error('handlePhotoCapture:', err);
      window.showNotif('Error al guardar foto');
    });
}

/* ─────────────────────────────────────────
   DOC UPLOAD (client documents)
───────────────────────────────────────── */

function handleDocUpload(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) { e.target.value = ''; return; }

  // Wizard mode: hand off to wizard
  if (e.target.dataset.wizMode === '1') {
    e.target.dataset.wizMode = '';
    e.target.value = '';
    window.wizReceiveDoc && window.wizReceiveDoc(file);
    return;
  }

  var arbolId = e.target.dataset.arbolId || null;
  e.target.dataset.arbolId = '';
  e.target.value = '';

  // Delegate to panel upload (handles client-level and tree-level)
  if (window.panelUploadFile) {
    window.panelUploadFile(file, arbolId);
    return;
  }

  // Fallback: old in-memory approach
  var clienteId = window.APP && (window.APP.activeClient || window.APP.docsClient);
  if (!clienteId) { window.showNotif('Selecciona un cliente primero'); return; }
  window.showNotif('Subiendo documento...');
  window.FB.uploadDoc(clienteId, file)
    .then(function (docInfo) {
      window.showNotif('📄 Documento guardado');
      window.renderPanelFiles && window.renderPanelFiles();
    })
    .catch(function (err) {
      console.error('handleDocUpload:', err);
      window.showNotif('Error al subir documento');
    });
}

/* ─────────────────────────────────────────
   START NEW TREE (shortcut)
───────────────────────────────────────── */

window.startNewTree = function () {
  window.APP.dbRevalBase = null;
  // Use wizard if available (defined in form.js), otherwise fall back
  if (typeof window.openTreeWizard === 'function') {
    window.openTreeWizard();
  } else {
    if (typeof window.resetForm === 'function') window.resetForm(false);
    window.switchTab('form');
  }
};

/* ─────────────────────────────────────────
   SELECT ALL VISIBLE (DB batch export)
───────────────────────────────────────── */

window.selectAllVisible = function () {
  var filtered = window.APP && window.APP.currentFiltered;
  if (!filtered || filtered.length === 0) {
    // Fall back to currentFilteredEntries used by records.js
    filtered = window.currentFilteredEntries || [];
  }
  var keys = filtered.map(function (item) { return item.key || item[0]; });
  window.selectAllTrees(keys);

  // Update PDF button count
  _updatePdfBtn();
  window.showNotif('Seleccionados ' + keys.length + ' registros');
};

window.toggleTreeSelection = (function (_orig) {
  return function (key) {
    _orig(key);
    _updatePdfBtn();
  };
}(window.toggleTreeSelection || function (key) {
  if (!window.APP.selectedTrees) window.APP.selectedTrees = new Set();
  if (window.APP.selectedTrees.has(key)) {
    window.APP.selectedTrees.delete(key);
  } else {
    window.APP.selectedTrees.add(key);
  }
  window.emit('selection:changed', Array.from(window.APP.selectedTrees));
}));

function _updatePdfBtn() {
  var btn = document.getElementById('btnExportPDF');
  if (btn) {
    var n = window.APP.selectedTrees ? window.APP.selectedTrees.size : 0;
    btn.textContent = '📄 PDF (' + n + ')';
  }
}

window.on('selection:changed', function () { _updatePdfBtn(); });

/* ─────────────────────────────────────────
   EXPORT PDF (fallback stub if records.js absent)
───────────────────────────────────────── */

if (typeof window.exportToPDF !== 'function') {
  window.exportToPDF = function () {
    window.showNotif('Preparando PDF...');
    setTimeout(function () { window.print(); }, 300);
  };
}

/* ─────────────────────────────────────────
   DOMContentLoaded — INIT
───────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', function initApp() {

  // 1. Restore engineer name
  window.loadEngineer && window.loadEngineer();
  updateEngineerUI();

  // 2. Build form (form.js must be loaded before app.js for buildForm to exist,
  //    or it may be inlined in index.html — call if available)
  if (typeof window.buildForm === 'function') window.buildForm();

  // 3. Set the default active view to 'form' (matches index.html initial state)
  //    and make sure nav reflects it
  document.querySelectorAll('.nav-tab').forEach(function (el) {
    el.classList.toggle('active', el.id === 'tab-form');
  });

  // 4. Initialise home map after a short delay (DOM must be fully painted)
  setTimeout(function () {
    window.initHomeMap && window.initHomeMap();
  }, 200);

  // 5. Photo input change (camera + gallery)
  var photoInput = document.getElementById('photo-input');
  if (photoInput) photoInput.addEventListener('change', handlePhotoCapture);
  var photoGallery = document.getElementById('photo-input-gallery');
  if (photoGallery) photoGallery.addEventListener('change', handlePhotoCapture);

  // 6. File upload input change
  var fileInput = document.getElementById('file-upload-input');
  if (fileInput) fileInput.addEventListener('change', handleDocUpload);

  // 7. Risk filter chips in DB view (.rf-chip)
  document.querySelectorAll('.rf-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var lvl = chip.dataset.risk || chip.getAttribute('data-risk') || '';
      document.querySelectorAll('.rf-chip').forEach(function (c) { c.classList.remove('active'); });
      if (window.APP.dbRiskFilter !== lvl) {
        window.APP.dbRiskFilter = lvl;
        chip.classList.add('active');
      } else {
        window.APP.dbRiskFilter = '';
      }
      window.updateFilters();
    });
  });

  // 8. Listen for engineer changes
  window.on('engineer:changed', function () {
    updateEngineerUI();
  });

  // 9. Firebase data subscription — after Firebase SDK inline script resolves
  //    We poll in case the module script hasn't set _fbOnValue yet.
  var _fbPollAttempts = 0;
  function tryAttachFirebase() {
    _fbPollAttempts++;
    if (typeof window._fbOnValue === 'function') {
      window._fbOnValue(function (snap) {
        window._dbAll = (snap && typeof snap.val === 'function') ? (snap.val() || {}) : (snap || {});
        window.populateClientList && window.populateClientList();
        window.updateFilters && window.updateFilters();
        window.refreshMap && window.refreshMap();
        window.refreshHomeMap && window.refreshHomeMap();
        window.renderDashboard && window.renderDashboard();
        window.homeRenderTrees && window.homeRenderTrees();
      });
      if (typeof window._fbOnClientes === 'function') {
        window._fbOnClientes(function (snap) {
          window._clientesAll = (snap && typeof snap.val === 'function') ? (snap.val() || {}) : (snap || {});
          window.populateClientList && window.populateClientList();
        });
      }
    } else if (_fbPollAttempts < 30) {
      setTimeout(tryAttachFirebase, 300);
    }
  }
  tryAttachFirebase();

  // 10. DB search input debounce
  var dbSearch = document.getElementById('dbSearch');
  if (dbSearch) {
    dbSearch.addEventListener('input', window.debounce(function () {
      window.updateFilters();
    }, 220));
  }

  // 11. Home tree search debounce
  var homeSearch = document.getElementById('homeTreeSearch');
  if (homeSearch) {
    homeSearch.addEventListener('input', window.debounce(function () {
      window.homeFilterTrees && window.homeFilterTrees();
    }, 220));
  }
});
