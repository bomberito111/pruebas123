/* ═══════════════════════════════════════════
   clients.js — Client selector modal + creation
   Bosques Urbanos · Plain JS · window globals

   Depends on:
     window.APP, window._dbAll, window._clientesAll
     window.RISK_COLORS, window.RISK_LABELS
     window.getEffectiveRisk, window.getRiskColor, window.getRiskLabel
     window.showNotif, window.FB
     window.initOrRefreshHomeMap (optional)
     window.homeRenderPanel       (optional)
     window.refreshMap            (optional)
═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── Helpers ─────────────────────────────
  function safeVal(v) {
    return (v === undefined || v === null || v === '') ? '—' : String(v);
  }

  function showNotif(msg, type) {
    if (typeof window.showNotif === 'function') window.showNotif(msg, type);
  }

  function getEffRisk(ev) {
    if (typeof window.getEffectiveRisk === 'function') return window.getEffectiveRisk(ev);
    if (ev && ev.riskOverride && ev.riskOverride.active && ev.riskOverride.level) {
      return ev.riskOverride.level;
    }
    return ev && ev.isaLevel ? ev.isaLevel : 'bajo';
  }

  function getRiskColor(lvl) {
    if (typeof window.getRiskColor === 'function') return window.getRiskColor(lvl);
    var c = { bajo:'#15803d', moderado:'#f59e0b', alto:'#f97316', extremo:'#b91c1c' };
    return c[lvl] || '#15803d';
  }

  function getRiskLabel(lvl) {
    if (typeof window.getRiskLabel === 'function') return window.getRiskLabel(lvl);
    var l = { bajo:'Bajo', moderado:'Moderado', alto:'Alto', extremo:'Extremo' };
    return l[lvl] || 'Bajo';
  }

  var RISK_ORDER = { bajo: 0, moderado: 1, alto: 2, extremo: 3 };

  function worstRisk(levels) {
    var best = null;
    levels.forEach(function (lvl) {
      if (!lvl) return;
      var l = lvl.toLowerCase();
      if (best === null || (RISK_ORDER[l] !== undefined && RISK_ORDER[l] > (RISK_ORDER[best] || 0))) {
        best = l;
      }
    });
    return best || 'bajo';
  }

  // ─────────────────────────────────────────
  // CLIENT SELECTOR MODAL
  // ─────────────────────────────────────────

  window.openClientSelector = function () {
    var modal = document.getElementById('clientSelectorModal');
    if (modal) {
      modal.classList.add('open');
      window.renderClientSelectorList();
    }
  };

  window.closeClientSelector = function () {
    var modal = document.getElementById('clientSelectorModal');
    if (modal) modal.classList.remove('open');
  };

  window.renderClientSelectorList = function () {
    var container = document.getElementById('cs-list');
    if (!container) return;

    var searchEl = document.getElementById('cs-search');
    var query = searchEl ? searchEl.value.trim().toLowerCase() : '';

    var db = window._dbAll || {};
    var clientesAll = window._clientesAll || {};

    // Build client map from evaluations
    var clientMap = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var name = (ev.cliente || '').trim();
      if (!name) return;
      if (!clientMap[name]) clientMap[name] = { name: name, treeIds: {}, evalCount: 0 };
      clientMap[name].evalCount++;
      var aid = ev.arbolId || key;
      clientMap[name].treeIds[aid] = true;
    });

    // Merge from _clientesAll
    Object.keys(clientesAll).forEach(function (k) {
      var c = clientesAll[k];
      var name = (c.nombre || c.name || '').trim();
      if (!name) return;
      if (!clientMap[name]) clientMap[name] = { name: name, treeIds: {}, evalCount: 0 };
    });

    var clients = Object.values(clientMap);

    if (query) {
      clients = clients.filter(function (c) {
        return c.name.toLowerCase().indexOf(query) !== -1;
      });
    }

    clients.sort(function (a, b) { return a.name.localeCompare(b.name); });

    var activeClient = (window.APP && window.APP.activeClient) ? window.APP.activeClient : null;

    var html = '';

    // "Todos los clientes" option
    html += '<div onclick="setActiveClient(\'\')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;border:1.5px solid ' + (!activeClient ? '#15803d' : '#e5e0d5') + ';background:' + (!activeClient ? '#f0fdf4' : '#fafaf8') + ';cursor:pointer;margin-bottom:6px;transition:all .15s;">';
    html += '<div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#0f3320,#166534);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🌳</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:14px;font-weight:700;color:#1a1a1a;">Todos los clientes</div>';
    html += '<div style="font-size:11px;color:#7a746e;">' + clients.length + ' clientes en total</div>';
    html += '</div>';
    if (!activeClient) html += '<span style="color:#15803d;font-size:18px;">✓</span>';
    html += '</div>';

    // Client rows
    clients.forEach(function (c) {
      var letter = c.name.charAt(0).toUpperCase();
      var treeCount = Object.keys(c.treeIds).length;
      var isActive = (activeClient === c.name);
      var encodedName = encodeURIComponent(c.name);

      // Compute worst risk for this client
      var riskLevels = [];
      Object.keys(db).forEach(function (key) {
        var ev = db[key];
        if ((ev.cliente || '').trim() === c.name) {
          riskLevels.push(getEffRisk(ev));
        }
      });
      var worst = worstRisk(riskLevels);
      var dotColor = getRiskColor(worst);

      html += '<div onclick="setActiveClient(\'' + encodedName + '\')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;border:1.5px solid ' + (isActive ? '#15803d' : '#e5e0d5') + ';background:' + (isActive ? '#f0fdf4' : '#fff') + ';cursor:pointer;margin-bottom:6px;transition:all .15s;">';
      html += '<div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#0f3320,#166534);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;font-family:\'Fraunces\',serif;flex-shrink:0;">' + letter + '</div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:14px;font-weight:700;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.name + '</div>';
      html += '<div style="display:flex;gap:8px;align-items:center;margin-top:2px;">';
      html += '<span style="font-size:10px;color:#7a746e;">' + treeCount + ' árbol' + (treeCount !== 1 ? 'es' : '') + ' · ' + c.evalCount + ' eval' + (c.evalCount !== 1 ? 's' : '') + '</span>';
      if (riskLevels.length > 0) {
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';display:inline-block;flex-shrink:0;"></span>';
        html += '<span style="font-size:9px;font-weight:700;color:' + dotColor + ';">' + getRiskLabel(worst) + '</span>';
      }
      html += '</div></div>';
      if (isActive) html += '<span style="color:#15803d;font-size:18px;flex-shrink:0;">✓</span>';
      html += '</div>';
    });

    // New client button
    html += '<button onclick="showNewClientForm()" id="btn-new-client" style="width:100%;padding:12px 14px;border-radius:11px;border:2px dashed #15803d;background:#f0fdf4;color:#15803d;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px;font-family:inherit;transition:background .15s;">➕ Nuevo cliente</button>';

    // New client form (hidden initially)
    html += '<div id="new-client-form" style="display:none;margin-top:10px;padding:14px;border:1.5px solid #e5e0d5;border-radius:12px;background:#fafaf8;flex-direction:column;gap:10px;">';
    html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#15803d;margin-bottom:4px;">Nuevo Cliente</div>';
    html += _inputField('nc-nombre', 'Nombre *', 'Nombre del cliente o municipio', false);
    html += _inputField('nc-rut', 'RUT / ID', 'Opcional', true);
    html += _inputField('nc-direccion', 'Dirección', 'Dirección (opcional)', true);
    html += _textareaField('nc-notas', 'Notas', 'Notas adicionales (opcional)');
    html += '<div style="display:flex;gap:8px;">';
    html += '<button onclick="saveNewClient()" style="flex:1;padding:11px;border-radius:9px;background:#0f3320;color:#fff;border:none;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">Guardar</button>';
    html += '<button onclick="cancelNewClientForm()" style="flex:1;padding:11px;border-radius:9px;background:#fff;color:#7a746e;border:1.5px solid #ddd;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">Cancelar</button>';
    html += '</div></div>';

    container.innerHTML = html;
  };

  function _inputField(id, label, placeholder, optional) {
    return '<div style="display:flex;flex-direction:column;gap:3px;">'
      + '<label style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a746e;">' + label + '</label>'
      + '<input id="' + id + '" type="text" placeholder="' + placeholder + '" '
      + 'style="padding:10px 12px;border:1.5px solid #ddd;border-radius:9px;font-size:14px;font-family:inherit;outline:none;background:#fff;color:#1a1a1a;">'
      + '</div>';
  }

  function _textareaField(id, label, placeholder) {
    return '<div style="display:flex;flex-direction:column;gap:3px;">'
      + '<label style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a746e;">' + label + '</label>'
      + '<textarea id="' + id + '" placeholder="' + placeholder + '" rows="2" '
      + 'style="padding:10px 12px;border:1.5px solid #ddd;border-radius:9px;font-size:14px;font-family:inherit;outline:none;resize:vertical;line-height:1.5;background:#fff;color:#1a1a1a;"></textarea>'
      + '</div>';
  }

  window.showNewClientForm = function () {
    var form = document.getElementById('new-client-form');
    if (form) form.style.display = 'flex';
    var btn = document.getElementById('btn-new-client');
    if (btn) btn.style.display = 'none';
    var inp = document.getElementById('nc-nombre');
    if (inp) inp.focus();
  };

  window.cancelNewClientForm = function () {
    var form = document.getElementById('new-client-form');
    if (form) form.style.display = 'none';
    var btn = document.getElementById('btn-new-client');
    if (btn) btn.style.display = 'flex';
    _clearNewClientForm();
  };

  function _clearNewClientForm() {
    ['nc-nombre','nc-rut','nc-direccion','nc-notas'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  window.saveNewClient = function () {
    var nombreEl = document.getElementById('nc-nombre');
    if (!nombreEl) return;
    var nombre = nombreEl.value.trim();
    if (!nombre) {
      showNotif('El nombre es obligatorio', 'error');
      nombreEl.focus();
      return;
    }

    var rutEl      = document.getElementById('nc-rut');
    var dirEl      = document.getElementById('nc-direccion');
    var notasEl    = document.getElementById('nc-notas');

    var data = {
      nombre:    nombre,
      rut:       rutEl    ? rutEl.value.trim()   : '',
      direccion: dirEl    ? dirEl.value.trim()   : '',
      notas:     notasEl  ? notasEl.value.trim() : '',
      createdAt: Date.now()
    };

    window.FB.pushCliente(data)
      .then(function (newKey) {
        // Add to local cache
        if (!window._clientesAll) window._clientesAll = {};
        window._clientesAll[newKey] = data;

        showNotif('Cliente "' + nombre + '" creado', 'success');
        _clearNewClientForm();
        window.closeClientSelector();
        window.setActiveClient(encodeURIComponent(nombre));
      })
      .catch(function (e) {
        showNotif('Error al crear cliente: ' + e.message, 'error');
      });
  };

  // ─────────────────────────────────────────
  // SET ACTIVE CLIENT
  // ─────────────────────────────────────────
  window.setActiveClient = function (encodedName) {
    if (!window.APP) window.APP = {};
    window.APP.activeClient = encodedName ? decodeURIComponent(encodedName) : null;

    window.closeClientSelector();
    window.updateClientUI();

    // Render panel immediately so client bar shows right away
    if (typeof window.homeRenderPanel === 'function') {
      window.homeRenderPanel();
    }

    // Refresh map after short delay to ensure DOM is ready
    setTimeout(function () {
      if (typeof window.initOrRefreshHomeMap === 'function') {
        window.initOrRefreshHomeMap();
      } else if (typeof window.refreshHomeMap === 'function') {
        window.refreshHomeMap();
      }
    }, 80);
  };

  // ─────────────────────────────────────────
  // CLIENT UI UPDATE
  // ─────────────────────────────────────────
  window.updateClientUI = function () {
    var activeClient = (window.APP && window.APP.activeClient) ? window.APP.activeClient : null;
    var db = window._dbAll || {};

    // Compute stats for this client
    var treeIds = {};
    var riskLevels = [];

    if (activeClient) {
      Object.keys(db).forEach(function (key) {
        var ev = db[key];
        if ((ev.cliente || '').trim() === activeClient) {
          var aid = ev.arbolId || key;
          treeIds[aid] = true;
          riskLevels.push(getEffRisk(ev));
        }
      });
    }

    var treeCount  = Object.keys(treeIds).length;
    var worst      = activeClient ? worstRisk(riskLevels) : null;
    var dotColor   = worst ? getRiskColor(worst) : '#22c55e';
    var clientName = activeClient || 'Todos los clientes';
    var countText  = activeClient
      ? treeCount + ' árbol' + (treeCount !== 1 ? 'es' : '')
      : 'Vista global';

    // #hdr-client-name
    var hdrName = document.getElementById('hdr-client-name');
    if (hdrName) hdrName.textContent = clientName;

    // #hdr-client-dot
    var hdrDot = document.getElementById('hdr-client-dot');
    if (hdrDot) hdrDot.style.background = dotColor;

    // #home-map-client-name
    var mapName = document.getElementById('home-map-client-name');
    if (mapName) mapName.textContent = clientName + ' ▾';

    // #home-map-client-dot
    var mapDot = document.getElementById('home-map-client-dot');
    if (mapDot) mapDot.style.background = dotColor;

    // #home-map-count
    var mapCount = document.getElementById('home-map-count');
    if (mapCount) mapCount.textContent = countText;

    // Also update map subtitle
    var mapSub = document.getElementById('mapSubtitle');
    if (mapSub) {
      mapSub.textContent = activeClient
        ? activeClient + ' · ' + countText
        : 'Vista global · ' + Object.keys(db).length + ' evaluaciones';
    }

    // Show/hide info button
    var infoBtn = document.getElementById('btn-client-info');
    if (infoBtn) {
      infoBtn.style.display = activeClient ? 'flex' : 'none';
    }
  };

  // ─────────────────────────────────────────
  // CLIENT INFO SHEET
  // ─────────────────────────────────────────
  window.openClientInfoSheet = function () {
    var activeClient = window.APP && window.APP.activeClient;
    if (!activeClient) return;

    var db = window._dbAll || {};
    var clientesAll = window._clientesAll || {};

    // Find client metadata
    var clientMeta = null;
    Object.keys(clientesAll).forEach(function (k) {
      var c = clientesAll[k];
      if ((c.nombre || c.name || '').trim() === activeClient) clientMeta = c;
    });

    // Gather trees + evaluations
    var treeMap = {};
    var riskLevels = [];
    var lastTs = 0;

    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      if ((ev.cliente || '').trim() !== activeClient) return;
      var aid = ev.arbolId || key;
      if (!treeMap[aid]) treeMap[aid] = [];
      treeMap[aid].push({ key: key, ev: ev });
      var ts = ev.ts || ev.timestamp || 0;
      if (ts > lastTs) lastTs = ts;
    });

    var treeIds = Object.keys(treeMap);
    treeIds.forEach(function (aid) {
      treeMap[aid].sort(function (a, b) { return (b.ev.timestamp || 0) - (a.ev.timestamp || 0); });
      riskLevels.push(getEffRisk(treeMap[aid][0].ev));
    });

    var worst = worstRisk(riskLevels);
    var worstColor = getRiskColor(worst);
    var riskCounts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
    riskLevels.forEach(function (r) { riskCounts[r] = (riskCounts[r] || 0) + 1; });

    // Update header
    var cisName = document.getElementById('cis-name');
    var cisDot = document.getElementById('cis-dot');
    if (cisName) cisName.textContent = activeClient;
    if (cisDot) { cisDot.style.background = worstColor; }

    // Build body
    var html = '';

    // Client metadata if available
    if (clientMeta) {
      html += '<div style="background:#f0fdf4;border-radius:12px;padding:12px 14px;margin-bottom:14px;">';
      if (clientMeta.rut) html += '<div style="font-size:12px;color:#166534;margin-bottom:3px;">RUT: <strong>' + clientMeta.rut + '</strong></div>';
      if (clientMeta.direccion || clientMeta.address) html += '<div style="font-size:12px;color:#166534;margin-bottom:3px;">📍 ' + (clientMeta.direccion || clientMeta.address) + '</div>';
      if (clientMeta.notas || clientMeta.notes) html += '<div style="font-size:12px;color:#555;margin-top:4px;">' + (clientMeta.notas || clientMeta.notes) + '</div>';
      html += '</div>';
    }

    // Stats row
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += '<div style="background:#f9f8f6;border-radius:10px;padding:10px 8px;text-align:center;"><div style="font-size:20px;font-weight:900;color:#0f3320;">' + treeIds.length + '</div><div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Árboles</div></div>';
    html += '<div style="background:' + getRiskColor('bajo') + '1a;border-radius:10px;padding:10px 8px;text-align:center;"><div style="font-size:20px;font-weight:900;color:' + getRiskColor('bajo') + ';">' + (riskCounts.bajo || 0) + '</div><div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Bajo</div></div>';
    html += '<div style="background:' + getRiskColor('alto') + '1a;border-radius:10px;padding:10px 8px;text-align:center;"><div style="font-size:20px;font-weight:900;color:' + getRiskColor('alto') + ';">' + (riskCounts.alto || 0) + '</div><div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Alto</div></div>';
    html += '<div style="background:' + getRiskColor('extremo') + '1a;border-radius:10px;padding:10px 8px;text-align:center;"><div style="font-size:20px;font-weight:900;color:' + getRiskColor('extremo') + ';">' + (riskCounts.extremo || 0) + '</div><div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Extremo</div></div>';
    html += '</div>';

    // Actions row
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
    html += '<button onclick="closeClientInfoSheet();window.dbOpenClient&&window.dbOpenClient(encodeURIComponent(\'' + activeClient.replace(/'/g, "\\'") + '\'))" style="flex:1;padding:12px 8px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">📋 Ver registros</button>';
    html += '<button onclick="closeClientInfoSheet();window.openDocsModal&&window.openDocsModal(encodeURIComponent(\'' + activeClient.replace(/'/g, "\\'") + '\'))" style="flex:1;padding:12px 8px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">📁 Archivos</button>';
    html += '</div>';

    // Trees list
    html += '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;margin-bottom:8px;">Árboles del cliente</div>';
    treeIds.forEach(function (aid) {
      var latest = treeMap[aid][0];
      var ev = latest.ev;
      var risk = getEffRisk(ev);
      var color = getRiskColor(risk);
      var photos = (window.FB ? window.FB.getPhotoUrls(ev) : (ev.photoUrls || ev.photos || [])).filter(function (u) { return u && typeof u === 'string'; });
      html += '<div onclick="closeClientInfoSheet();window.openMASFromKey&&window.openMASFromKey(\'' + latest.key + '\')" style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:11px;border:1.5px solid #e8e4dc;background:#fafaf8;cursor:pointer;margin-bottom:6px;">';
      html += '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:13px;font-weight:800;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + aid + '</div>';
      html += '<div style="font-size:11px;color:#7a746e;">' + (ev.especie || '—') + ' · ' + getRiskLabel(risk);
      if (photos.length > 0) html += ' · 📷 ' + photos.length;
      html += '</div>';
      html += '</div>';
      html += '<span style="font-size:14px;color:#bbb;">›</span>';
      html += '</div>';
    });

    if (treeIds.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:#7a746e;font-weight:600;">Sin árboles registrados</div>';
    }

    var body = document.getElementById('cis-body');
    if (body) body.innerHTML = html;

    var sheet = document.getElementById('clientInfoSheet');
    if (sheet) sheet.classList.add('open');
  };

  window.closeClientInfoSheet = function () {
    var sheet = document.getElementById('clientInfoSheet');
    if (sheet) sheet.classList.remove('open');
  };

  // ─────────────────────────────────────────
  // ENGINEER SELECTOR
  // ─────────────────────────────────────────
  window.openEngineerSelector = function () {
    var modal = document.getElementById('engineerSelectorModal');
    if (modal) {
      _buildEngineerModal();
      modal.classList.add('open');
      return;
    }

    // Build modal on the fly if it doesn't exist in HTML
    var overlay = document.createElement('div');
    overlay.id = 'engineerSelectorModal';
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = '<div class="modal-inner" style="max-height:70vh;">'
      + '<div class="modal-drag"></div>'
      + '<div class="modal-head">'
      + '<span class="modal-title">👷 Seleccionar Asesor</span>'
      + '<button class="modal-close" onclick="closeEngineerSelector()">✕</button>'
      + '</div>'
      + '<div class="modal-body" id="eng-modal-body"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    _buildEngineerModal();
  };

  function _buildEngineerModal() {
    var body = document.getElementById('eng-modal-body');
    if (!body) return;

    var db = window._dbAll || {};
    var names = {};
    Object.keys(db).forEach(function (k) {
      var n = (db[k].evaluador || '').trim();
      if (n) names[n] = true;
    });

    var stored = typeof window.loadEngineer === 'function' ? window.loadEngineer() : (localStorage.getItem('bu_engineer') || '');
    var knownNames = Object.keys(names).sort();

    var html = '<div style="margin-bottom:14px;">';
    html += '<label style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a746e;display:block;margin-bottom:5px;">Nombre del asesor</label>';
    html += '<input id="eng-name-input" type="text" value="' + safeVal(stored === '—' ? '' : stored) + '" placeholder="Nombre completo" style="width:100%;padding:11px 13px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;font-family:inherit;outline:none;color:#1a1a1a;">';
    html += '</div>';

    if (knownNames.length > 0) {
      html += '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a746e;margin-bottom:6px;">Asesores conocidos</div>';
      html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px;">';
      knownNames.forEach(function (n) {
        html += '<div onclick="document.getElementById(\'eng-name-input\').value=\'' + n.replace(/'/g, "\\'") + '\'" style="padding:9px 12px;border-radius:9px;border:1px solid #e5e0d5;background:#fafaf8;font-size:13px;font-weight:600;cursor:pointer;color:#1a1a1a;transition:background .12s;" onmouseover="this.style.background=\'#f0fdf4\'" onmouseout="this.style.background=\'#fafaf8\'">' + n + '</div>';
      });
      html += '</div>';
    }

    html += '<button onclick="_saveEngineerFromModal()" style="width:100%;padding:13px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Guardar</button>';

    body.innerHTML = html;

    var inp = document.getElementById('eng-name-input');
    if (inp) inp.focus();
  }

  window._saveEngineerFromModal = function () {
    var inp = document.getElementById('eng-name-input');
    if (!inp) return;
    var name = inp.value.trim();
    if (!name) { showNotif('Escribe un nombre', 'error'); inp.focus(); return; }

    if (typeof window.saveEngineer === 'function') {
      window.saveEngineer(name);
    } else {
      localStorage.setItem('bu_engineer', name);
    }

    showNotif('Asesor: ' + name, 'success');
    window.closeEngineerSelector();
  };

  window.closeEngineerSelector = function () {
    var modal = document.getElementById('engineerSelectorModal');
    if (modal) modal.classList.remove('open');
  };

}());
