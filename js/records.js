/* ═══════════════════════════════════════════
   records.js — 3-level records system
   Bosques Urbanos · Plain JS · window globals

   Depends on:
     window.APP, window._dbAll, window._clientesAll
     window.RISK_COLORS, window.RISK_LABELS
     window.getClientName, window.getEffectiveRisk
     window.getRiskColor, window.getRiskLabel
     window.showNotif, window.FB, window.QS
═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── Internal state ───────────────────────
  var _dbClient   = null;   // active client name (decoded)
  var _dbTreeId   = null;   // active arbolId (decoded)
  var _dbRisk     = null;   // active risk filter string or null
  var _dbRevalBase = null;  // eval object used for re-eval pre-population

  // ─── Risk level ordering ──────────────────
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

  function safeVal(v) {
    return (v === undefined || v === null || v === '') ? '—' : String(v);
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 10) || '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
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

  function showNotif(msg, type) {
    if (typeof window.showNotif === 'function') window.showNotif(msg, type);
  }

  // ─────────────────────────────────────────
  // NAV
  // ─────────────────────────────────────────
  window.dbNav = function (level) {
    for (var i = 1; i <= 3; i++) {
      var el = document.getElementById('db-level-' + i);
      if (el) el.style.display = (i === level) ? 'flex' : 'none';
    }
    if (level === 1) window.dbRenderLv1();
    if (level === 2) window.dbRenderLv2();
    if (level === 3) window.dbRenderLv3();
  };

  // ─────────────────────────────────────────
  // LEVEL 1 — Clients list
  // ─────────────────────────────────────────
  window.dbRenderLv1 = function () {
    var container = document.getElementById('db-lv1-list');
    if (!container) return;

    var searchEl = document.getElementById('lv1-search');
    var query = searchEl ? searchEl.value.trim().toLowerCase() : '';

    var db = window._dbAll || {};
    var clientesAll = window._clientesAll || {};

    // Gather client names from evaluations (supports old ev.cliente and ev.answers.cliente)
    var clientMap = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var name = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || (ev.answers && ev.answers.cliente) || '')).trim();
      if (!name || name === '(Sin cliente)') return;
      if (!clientMap[name]) {
        clientMap[name] = { name: name, evals: [], trees: {}, fromDB: true };
      }
      clientMap[name].evals.push({ key: key, ev: ev });
      var aid = ev.arbolId || key;
      if (!clientMap[name].trees[aid]) clientMap[name].trees[aid] = [];
      clientMap[name].trees[aid].push({ key: key, ev: ev });
    });

    // Merge from _clientesAll (dedicated records)
    Object.keys(clientesAll).forEach(function (k) {
      var c = clientesAll[k];
      var name = (c.nombre || c.name || '').trim();
      if (!name) return;
      if (!clientMap[name]) {
        clientMap[name] = { name: name, evals: [], trees: {}, fromDB: false };
      }
      clientMap[name]._clientKey = k;
      clientMap[name]._clientData = c;
    });

    var clients = Object.values(clientMap);
    if (query) {
      clients = clients.filter(function (c) {
        return c.name.toLowerCase().indexOf(query) !== -1;
      });
    }

    if (clients.length === 0) {
      container.innerHTML = '<div class="db-empty">🌱 Sin clientes registrados.</div>';
      return;
    }

    // Sort by name
    clients.sort(function (a, b) { return a.name.localeCompare(b.name); });

    var html = '';
    clients.forEach(function (c) {
      var treeIds = Object.keys(c.trees);
      var totalTrees = treeIds.length;
      var totalEvals = c.evals.length;

      // Latest eval per tree
      var latestEvals = treeIds.map(function (tid) {
        var evs = c.trees[tid];
        evs.sort(function (a, b) { return (b.ev.timestamp || 0) - (a.ev.timestamp || 0); });
        return evs[0];
      });

      // Risk counts
      var riskCounts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
      var riskLevels = [];
      latestEvals.forEach(function (item) {
        var r = getEffRisk(item.ev);
        riskCounts[r] = (riskCounts[r] || 0) + 1;
        riskLevels.push(r);
      });

      var worst = worstRisk(riskLevels);
      var extremoCount = riskCounts.extremo || 0;

      // Last eval date
      var lastTs = 0;
      c.evals.forEach(function (item) {
        if ((item.ev.timestamp || 0) > lastTs) lastTs = item.ev.timestamp;
      });

      var encodedName = encodeURIComponent(c.name);
      var letter = c.name.charAt(0).toUpperCase();

      // Risk bar proportions
      var barTotal = totalTrees || 1;
      var barHtml = '';
      ['bajo', 'moderado', 'alto', 'extremo'].forEach(function (r) {
        var pct = ((riskCounts[r] || 0) / barTotal * 100).toFixed(1);
        if (riskCounts[r] > 0) {
          barHtml += '<div class="crb-' + r + '" style="flex:' + riskCounts[r] + '"></div>';
        }
      });

      html += '<div class="client-card" onclick="dbOpenClient(\'' + encodedName + '\')">';
      // Head
      html += '<div class="cc-head">';
      html += '<div class="cc-avatar">' + letter + '</div>';
      html += '<div class="cc-info">';
      html += '<span class="cc-name">' + c.name + '</span>';
      html += '<div class="cc-meta">';
      html += '<span>' + fmtDate(lastTs) + '</span>';
      html += '<span style="background:' + getRiskColor(worst) + ';color:#fff;padding:1px 7px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;">' + getRiskLabel(worst) + '</span>';
      html += '</div></div>';
      html += '</div>'; // cc-head

      // Risk bar
      if (barHtml) {
        html += '<div class="cc-risk-bar">' + barHtml + '</div>';
      }

      // Stats
      html += '<div class="cc-stats">';
      html += '<div class="cc-stat"><span class="cc-stat-val">' + totalTrees + '</span><span class="cc-stat-lbl">Árboles</span></div>';
      html += '<div class="cc-stat"><span class="cc-stat-val">' + totalEvals + '</span><span class="cc-stat-lbl">Evals</span></div>';
      html += '<div class="cc-stat' + (extremoCount > 0 ? ' extremo' : '') + '"><span class="cc-stat-val">' + extremoCount + '</span><span class="cc-stat-lbl">Extremo</span></div>';
      html += '</div>';

      // Risk counts pills
      html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">';
      ['extremo','alto','moderado','bajo'].forEach(function (r) {
        if (riskCounts[r] > 0) {
          html += '<span style="display:inline-flex;align-items:center;gap:3px;background:' + getRiskColor(r) + '1a;color:' + getRiskColor(r) + ';border:1px solid ' + getRiskColor(r) + '33;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:800;">' + riskCounts[r] + ' ' + getRiskLabel(r) + '</span>';
        }
      });
      html += '</div>';

      // Actions
      html += '<div class="client-actions">';
      html += '<button class="ca-btn" onclick="event.stopPropagation();openDocsModal(\'' + encodedName + '\')">📁 Archivos</button>';
      html += '<button class="ca-btn" onclick="event.stopPropagation();dbOpenClient(\'' + encodedName + '\')">🌳 Ver árboles</button>';
      html += '<button class="ca-btn" style="background:#1d4ed8;color:#fff;border-color:#1d4ed8;" onclick="event.stopPropagation();dbExportClientPDF(\'' + encodedName + '\')">📄 PDF</button>';
      html += '<button class="ca-btn" style="background:#fee2e2;color:#b91c1c;border-color:#fecaca;" onclick="event.stopPropagation();deleteClientFromRecords(\'' + encodedName + '\')">🗑 Eliminar</button>';
      html += '</div>';

      html += '</div>'; // client-card
    });

    container.innerHTML = html;

    // Update count
    var countEl = document.getElementById('lv1-count');
    if (countEl) countEl.textContent = clients.length + ' cliente' + (clients.length !== 1 ? 's' : '');
  };

  window.dbOpenClient = function (encodedName) {
    _dbClient = decodeURIComponent(encodedName);
    _dbRisk = null;
    window.dbNav(2);
  };

  window.dbExportClientPDF = function (encodedName) {
    var clientName = decodeURIComponent(encodedName);
    var db = window._dbAll || {};
    var keys = [];
    var latest = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      if ((ev.cliente || '').trim() !== clientName) return;
      var aid = ev.arbolId || key;
      var ts = ev.ts || ev.timestamp || 0;
      if (!latest[aid] || ts > (latest[aid].ts || 0)) {
        latest[aid] = { key: key, ts: ts };
      }
    });
    Object.keys(latest).forEach(function (aid) { keys.push(latest[aid].key); });
    if (keys.length === 0) { showNotif('Sin árboles para exportar', 'info'); return; }
    if (!window.APP) window.APP = {};
    window.APP.selectedTrees = keys; // use array so exportToPDF works
    showNotif('Preparando PDF · ' + keys.length + ' árbol' + (keys.length !== 1 ? 'es' : '') + '...');
    setTimeout(function () { window.exportToPDF(); }, 300);
  };

  // ─────────────────────────────────────────
  // EXPORT FUNCTIONS
  // ─────────────────────────────────────────

  function _getClientTrees(clientName) {
    var db = window._dbAll || {};
    var latest = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var evClient = (typeof window.getClientName === 'function'
        ? window.getClientName(ev) : (ev.cliente || '')).trim();
      if (evClient !== clientName) return;
      var aid = ev.arbolId || key;
      var ts = ev.timestamp || ev.ts || 0;
      if (!latest[aid] || ts > (latest[aid].ts || 0)) {
        latest[aid] = { key: key, ev: ev, ts: ts };
      }
    });
    return Object.values(latest);
  }

  window.dbExportClientCSV = function () {
    var clientName = _dbClient;
    if (!clientName) { showNotif('Selecciona un cliente primero', 'info'); return; }
    var trees = _getClientTrees(clientName);
    if (!trees.length) { showNotif('Sin árboles para exportar', 'info'); return; }

    var header = ['ArbolID','Especie','Riesgo','GPS','Fecha','Evaluador','DAP_cm','Altura_m'];
    var rows = trees.map(function (t) {
      var ev = t.ev;
      var gps = (window._normalizeGPS && window._normalizeGPS(ev)) || ev.gps || '';
      var risk = (typeof window.getEffectiveRisk === 'function') ? window.getEffectiveRisk(ev) : (ev.isaLevel || '');
      return [
        ev.arbolId || t.key,
        ev.especie || '',
        risk,
        gps,
        ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('es-CO') : '',
        ev.evaluador || '',
        ev.answers && ev.answers.dap ? ev.answers.dap : (ev.dap || ''),
        ev.answers && ev.answers.altura ? ev.answers.altura : (ev.altura || '')
      ].map(function (v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
    });

    var csv = header.join(',') + '\n' + rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = clientName.replace(/\s+/g,'_') + '_arboles.csv';
    a.click();
    showNotif('✅ CSV descargado', 'success');
  };

  window.dbExportClientXLSX = function () {
    var clientName = _dbClient;
    if (!clientName) { showNotif('Selecciona un cliente primero', 'info'); return; }
    if (!window.XLSX) { showNotif('SheetJS no cargado', 'error'); return; }
    var trees = _getClientTrees(clientName);
    if (!trees.length) { showNotif('Sin árboles para exportar', 'info'); return; }

    var rows = [['ArbolID','Especie','Riesgo','GPS','Fecha','Evaluador','DAP (cm)','Altura (m)']];
    trees.forEach(function (t) {
      var ev = t.ev;
      var gps = (window._normalizeGPS && window._normalizeGPS(ev)) || ev.gps || '';
      var risk = (typeof window.getEffectiveRisk === 'function') ? window.getEffectiveRisk(ev) : (ev.isaLevel || '');
      rows.push([
        ev.arbolId || t.key,
        ev.especie || '',
        risk,
        gps,
        ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('es-CO') : '',
        ev.evaluador || '',
        ev.answers && ev.answers.dap ? ev.answers.dap : (ev.dap || ''),
        ev.answers && ev.answers.altura ? ev.answers.altura : (ev.altura || '')
      ]);
    });

    var ws = XLSX.utils.aoa_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Árboles');
    XLSX.writeFile(wb, clientName.replace(/\s+/g,'_') + '_arboles.xlsx');
    showNotif('✅ Excel descargado', 'success');
  };

  // ── Document list exports ──

  window.dbExportDocsXLSX = function () {
    if (!window.XLSX) { showNotif('SheetJS no cargado', 'error'); return; }
    if (!_docsLocal || !_docsLocal.length) { showNotif('Sin documentos para exportar', 'info'); return; }
    var rows = [['Nombre','Fecha','Tipo','URL']];
    _docsLocal.forEach(function (doc) {
      var ext = (doc.name || '').split('.').pop().toUpperCase();
      var fecha = doc.ts ? new Date(doc.ts).toLocaleDateString('es-CO') : '';
      rows.push([doc.name || '', fecha, ext, doc.url || '']);
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos');
    XLSX.writeFile(wb, (_docsClient || 'documentos').replace(/\s+/g,'_') + '_docs.xlsx');
    showNotif('✅ Excel descargado', 'success');
  };

  window.dbExportDocsPDF = function () {
    if (!_docsLocal || !_docsLocal.length) { showNotif('Sin documentos para exportar', 'info'); return; }

    var printContainer = document.getElementById('print-container');
    if (!printContainer) return;
    var html = '<h2 style="font-family:serif;color:#0f3320;margin-bottom:8px">Documentos · ' + (_docsClient || '') + '</h2>';
    html += '<p style="font-size:12px;color:#666;margin-bottom:16px">Generado: ' + new Date().toLocaleString('es-CO') + '</p>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#0f3320;color:#fff"><th style="padding:8px;text-align:left">Nombre</th><th style="padding:8px;text-align:left">Fecha</th><th style="padding:8px;text-align:left">Tipo</th><th style="padding:8px;text-align:left">URL</th></tr></thead>';
    html += '<tbody>';
    _docsLocal.forEach(function (doc, i) {
      var bg = i % 2 === 0 ? '#f9f9f9' : '#fff';
      var ext = (doc.name || '').split('.').pop().toUpperCase();
      var fecha = doc.ts ? new Date(doc.ts).toLocaleDateString('es-CO') : '—';
      html += '<tr style="background:' + bg + '">';
      html += '<td style="padding:7px 8px;border-bottom:1px solid #eee">' + (doc.name || '—') + '</td>';
      html += '<td style="padding:7px 8px;border-bottom:1px solid #eee">' + fecha + '</td>';
      html += '<td style="padding:7px 8px;border-bottom:1px solid #eee">' + ext + '</td>';
      html += '<td style="padding:7px 8px;border-bottom:1px solid #eee"><a href="' + (doc.url || '#') + '">' + (doc.url ? 'Ver' : '—') + '</a></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    printContainer.innerHTML = html;
    window.print();
    showNotif('🖨️ Enviado a imprimir', 'success');
  };

  // ─────────────────────────────────────────
  // LEVEL 2 — Trees of client
  // ─────────────────────────────────────────
  window.dbRenderLv2 = function () {
    var container = document.getElementById('db-lv2-list');
    if (!container) return;

    // Update breadcrumb
    var titleEl = document.getElementById('db-lv2-title');
    if (titleEl) titleEl.textContent = _dbClient || 'Cliente';

    var searchEl = document.getElementById('lv2-search');
    var query = searchEl ? searchEl.value.trim().toLowerCase() : '';

    var db = window._dbAll || {};

    // Group by arbolId, keep only this client (supports all legacy formats)
    var treeMap = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var evClient = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || (ev.answers && ev.answers.cliente) || '')).trim();
      if (evClient !== _dbClient) return;
      var aid = ev.arbolId || key;
      if (!treeMap[aid]) treeMap[aid] = [];
      treeMap[aid].push({ key: key, ev: ev });
    });

    // Get latest eval per tree
    var trees = Object.keys(treeMap).map(function (aid) {
      var evs = treeMap[aid];
      evs.sort(function (a, b) { return (b.ev.timestamp || 0) - (a.ev.timestamp || 0); });
      return { aid: aid, latest: evs[0], count: evs.length, all: evs };
    });

    // Filter by risk
    if (_dbRisk) {
      trees = trees.filter(function (t) {
        return getEffRisk(t.latest.ev) === _dbRisk;
      });
    }

    // Filter by search
    if (query) {
      trees = trees.filter(function (t) {
        var ev = t.latest.ev;
        return (
          (t.aid || '').toLowerCase().indexOf(query) !== -1 ||
          (ev.especie || '').toLowerCase().indexOf(query) !== -1 ||
          (ev.evaluador || '').toLowerCase().indexOf(query) !== -1
        );
      });
    }

    if (trees.length === 0) {
      container.innerHTML = '<div class="db-empty">🌳 Sin árboles para este cliente.</div>';
      window.updatePDFBtnText();
      return;
    }

    trees.sort(function (a, b) { return (a.aid || '').localeCompare(b.aid || ''); });

    var html = '';
    trees.forEach(function (t) {
      var ev = t.latest.ev;
      var key = t.latest.key;
      var risk = getEffRisk(ev);
      var color = getRiskColor(risk);
      var label = getRiskLabel(risk);
      var _st = window.APP && window.APP.selectedTrees;
      var selected = _st && (typeof _st.has === 'function' ? _st.has(key) : _st.indexOf(key) !== -1);

      var gpsHtml = '';
      var gpsRaw = (typeof window._normalizeGPS === 'function') ? window._normalizeGPS(ev) : (ev.gps || '');
      if (gpsRaw) {
        var gpsParts2 = String(gpsRaw).split(',');
        var gpsLat2 = parseFloat(gpsParts2[0]);
        var gpsLng2 = parseFloat(gpsParts2[1]);
        if (!isNaN(gpsLat2) && !isNaN(gpsLng2)) {
          gpsHtml = '<span class="tc-gps">📍 ' + gpsLat2.toFixed(5) + ', ' + gpsLng2.toFixed(5) + '</span>';
        }
      }

      html += '<div class="tree-card" style="border-left:4px solid ' + color + ';">';

      // Checkbox row
      html += '<div style="padding:8px 14px 0;display:flex;align-items:center;gap:8px;">';
      html += '<input type="checkbox" ' + (selected ? 'checked' : '') + ' onclick="toggleSelection(event,\'' + key + '\')" style="width:16px;height:16px;accent-color:' + color + ';cursor:pointer;">';
      html += '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;font-weight:700;color:#1d4ed8;">' + (ev.arbolId || key) + '</span>';
      html += '<span class="tc-eval-badge">' + t.count + ' eval' + (t.count > 1 ? 's' : '') + '</span>';
      var nP = (window.FB ? window.FB.getPhotoUrls(ev) : (ev.photoUrls || ev.photos || [])).filter(function (u) { return u && typeof u === 'string'; }).length;
      if (nP > 0) html += '<span style="font-size:10px;color:#7a746e;margin-left:auto;">📷 ' + nP + '</span>';
      html += '</div>';

      // Head
      html += '<div class="tc-head" onclick="showTreeDetail(\'' + key + '\')">';
      html += '<div class="tc-risk-dot trd-' + risk + '">🌳</div>';
      html += '<div class="tc-info">';
      html += '<span class="tc-species">' + safeVal(ev.especie) + '</span>';
      html += '<span class="tc-id">' + safeVal(ev.evaluador) + ' · ' + fmtDate(ev.timestamp) + '</span>';
      html += '</div>';
      html += '<div class="tc-chevron">›</div>';
      html += '</div>';

      // Body
      html += '<div class="tc-body" onclick="showTreeDetail(\'' + key + '\')">';
      html += '<div class="tc-pills">';

      // Risk pills for each diana group
      var dianasKeys = ['copa_dianas', 'tronco_dianas', 'raices_dianas'];
      var dianasLabels = { copa_dianas: 'Copa', tronco_dianas: 'Tronco', raices_dianas: 'Raíces' };
      dianasKeys.forEach(function (dk) {
        if (ev[dk] && ev[dk].length) {
          ev[dk].forEach(function (d) {
            if (d.riesgo) {
              html += '<span class="tc-pill tp-' + d.riesgo + '">' + dianasLabels[dk] + ': ' + getRiskLabel(d.riesgo) + '</span>';
            }
          });
        }
      });
      if (!ev.copa_dianas && !ev.tronco_dianas && !ev.raices_dianas) {
        html += '<span class="tc-pill tp-' + risk + '">' + label + '</span>';
      }
      html += '</div>';

      html += '<div class="tc-meta">';
      html += gpsHtml;
      var _haGps = !!gpsHtml;
      if (_haGps) {
        html += '<button onclick="event.stopPropagation();switchTab(\'home\');setTimeout(function(){window.setActiveClient&&setActiveClient(encodeURIComponent(\'' + (ev.cliente || '').replace(/'/g, '') + '\'));setTimeout(function(){window.openMASFromKey&&openMASFromKey(\'' + key + '\')},300)},100)" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1.5px solid #15803d;background:#dcfce7;cursor:pointer;font-weight:700;color:#15803d;">🗺️ Mapa</button>';
      }
      html += '<button onclick="event.stopPropagation();dbOpenTree(\'' + encodeURIComponent(t.aid) + '\')" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1.5px solid #ddd;background:#fff;cursor:pointer;font-weight:700;color:#555;">↺ Historial</button>';
      html += '<button onclick="event.stopPropagation();deleteTree(\'' + encodeURIComponent(t.aid) + '\')" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1.5px solid #fecaca;background:#fee2e2;cursor:pointer;font-weight:700;color:#b91c1c;">🗑 Eliminar</button>';
      html += '</div>';
      html += '</div>'; // tc-body

      html += '</div>'; // tree-card
    });

    container.innerHTML = html;
    window.updatePDFBtnText();

    // Update stats label with GPS count
    var statsEl = document.getElementById('lv2-stats');
    if (statsEl) {
      var withGps = trees.filter(function (t) {
        return !!(typeof window._normalizeGPS === 'function' ? window._normalizeGPS(t.latest.ev) : t.latest.ev.gps);
      }).length;
      statsEl.textContent = trees.length + ' árbol' + (trees.length !== 1 ? 'es' : '') +
        ' · 📍 ' + withGps + ' con GPS';
    }
  };

  window.dbSetRisk = function (btn, lvl) {
    _dbRisk = (_dbRisk === lvl) ? null : lvl;
    var chips = document.querySelectorAll('.rf-chip');
    chips.forEach(function (c) { c.classList.remove('active'); });
    if (_dbRisk && btn) btn.classList.add('active');
    window.dbRenderLv2();
  };

  window.dbLv2OpenClientFiles = function () {
    if (!_dbClient) return;
    if (typeof window.openDocsModal === 'function') {
      window.openDocsModal(encodeURIComponent(_dbClient));
    }
  };

  // ─────────────────────────────────────────
  // LEVEL 3 — Tree history timeline
  // ─────────────────────────────────────────
  window.dbRenderLv3 = function () {
    var container = document.getElementById('db-lv3-list');
    if (!container) return;

    var titleEl = document.getElementById('db-lv3-title');
    if (titleEl) titleEl.textContent = _dbTreeId || 'Árbol';

    var db = window._dbAll || {};
    var evals = [];
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      if ((ev.arbolId || key) === _dbTreeId && (ev.cliente || '').trim() === _dbClient) {
        evals.push({ key: key, ev: ev });
      }
    });

    evals.sort(function (a, b) { return (b.ev.timestamp || 0) - (a.ev.timestamp || 0); });

    if (evals.length === 0) {
      container.innerHTML = '<div class="db-empty">Sin historial para este árbol.</div>';
      return;
    }

    // Set _dbRevalBase for re-eval
    _dbRevalBase = evals[0].ev;

    // Group by year
    var byYear = {};
    evals.forEach(function (item) {
      var yr = item.ev.timestamp ? new Date(item.ev.timestamp).getFullYear() : 'S/F';
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(item);
    });

    // Re-eval banner
    var html = '<div style="background:linear-gradient(135deg,#0f3320,#166534);border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">';
    html += '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#86efac;">Árbol</div>';
    html += '<div style="font-family:\'Fraunces\',serif;font-size:18px;font-weight:900;color:#fff;">' + safeVal(_dbTreeId) + '</div>';
    html += '<div style="font-size:11px;color:rgba(255,255,255,.65);">' + evals.length + ' evaluación' + (evals.length !== 1 ? 'es' : '') + '</div></div>';
    html += '<button onclick="dbStartReeval()" style="padding:10px 18px;border-radius:10px;border:1.5px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;">↺ Re-eval</button>';
    html += '</div>';

    // Timeline
    var years = Object.keys(byYear).sort(function (a, b) { return b - a; });
    years.forEach(function (yr) {
      html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#15803d;margin-bottom:8px;padding-top:6px;">' + yr + '</div>';
      html += '<div style="position:relative;padding-left:24px;">';

      byYear[yr].forEach(function (item, idx) {
        var ev = item.ev;
        var risk = getEffRisk(ev);
        var color = getRiskColor(risk);
        var isLatest = (item.key === evals[0].key);

        // Vertical line
        var isLast = (idx === byYear[yr].length - 1);
        html += '<div style="position:absolute;left:7px;top:0;bottom:' + (isLast ? '50%' : '0') + ';width:2px;background:#e5e7eb;"></div>';

        // Dot
        html += '<div style="position:absolute;left:0;top:14px;width:16px;height:16px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 0 0 1.5px ' + color + ';z-index:1;"></div>';

        // Card
        html += '<div class="' + (isLatest ? 'timeline-card-latest' : '') + '" style="margin-bottom:10px;background:' + (isLatest ? 'rgba(15,51,32,.05)' : '#fff') + ';border:1.5px solid ' + (isLatest ? color : '#e5e7eb') + ';border-radius:12px;padding:12px 14px;cursor:pointer;" onclick="showTreeDetail(\'' + item.key + '\')">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">';
        html += '<span style="font-size:12px;font-weight:700;color:#1a1a1a;">' + fmtDate(ev.timestamp) + '</span>';
        html += '<span style="background:' + color + ';color:#fff;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:800;text-transform:uppercase;">' + getRiskLabel(risk) + '</span>';
        if (isLatest) html += '<span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#15803d;">Última</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:#7a746e;">👷 ' + safeVal(ev.evaluador) + '</div>';
        var _tlGps = ev.gps || (ev.answers && ev.answers.gps) || (ev.lat && ev.lng ? ev.lat + ',' + ev.lng : '');
        if (_tlGps) {
          var _tlParts = String(_tlGps).split(',');
          var _tlLat = parseFloat(_tlParts[0]); var _tlLng = parseFloat(_tlParts[1]);
          if (!isNaN(_tlLat) && !isNaN(_tlLng)) {
            html += '<div style="font-size:10px;color:#15803d;margin-top:4px;">📍 ' + _tlLat.toFixed(5) + ', ' + _tlLng.toFixed(5) + '</div>';
          }
        }
        if (ev.riskOverride && ev.riskOverride.active) {
          html += '<div style="margin-top:6px;font-size:10px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:6px;padding:3px 8px;display:inline-block;">⚠ Override manual</div>';
        }
        html += '</div>'; // card
      });

      html += '</div>'; // relative
    });

    container.innerHTML = html;
  };

  window.dbOpenTree = function (encodedId) {
    _dbTreeId = decodeURIComponent(encodedId);
    window.dbNav(3);
  };

  // ─────────────────────────────────────────
  // RE-EVALUATION
  // ─────────────────────────────────────────
  window.dbStartReeval = function () {
    if (!_dbRevalBase) { showNotif('Sin base para re-evaluación', 'error'); return; }
    if (typeof window.resetFormFn === 'function') {
      window.resetFormFn(_dbRevalBase);
    }
    if (typeof window.switchTab === 'function') {
      window.switchTab('form');
    }
  };

  // ─────────────────────────────────────────
  // PDF EXPORT
  // ─────────────────────────────────────────
  window.toggleSelection = function (event, key) {
    if (!window.APP) window.APP = {};
    // Normalize Set → Array for records.js operations
    if (!window.APP.selectedTrees || typeof window.APP.selectedTrees.indexOf !== 'function') {
      window.APP.selectedTrees = window.APP.selectedTrees ? Array.from(window.APP.selectedTrees) : [];
    }
    var idx = window.APP.selectedTrees.indexOf(key);
    if (event.target && event.target.checked) {
      if (idx === -1) window.APP.selectedTrees.push(key);
    } else {
      if (idx !== -1) window.APP.selectedTrees.splice(idx, 1);
    }
    window.updatePDFBtnText();
  };

  window.selectAllVisible = function () {
    var db = window._dbAll || {};
    if (!window.APP) window.APP = {};
    if (!window.APP.selectedTrees) window.APP.selectedTrees = [];

    // Gather visible keys from current level
    var checkboxes = document.querySelectorAll('#db-lv2-list input[type="checkbox"]');
    if (checkboxes.length === 0) {
      // Fall back to all of current client
      Object.keys(db).forEach(function (key) {
        var ev = db[key];
        if (!_dbClient || (ev.cliente || '').trim() === _dbClient) {
          if (window.APP.selectedTrees.indexOf(key) === -1) window.APP.selectedTrees.push(key);
        }
      });
      window.updatePDFBtnText();
      return;
    }

    var allChecked = Array.from(checkboxes).every(function (cb) { return cb.checked; });
    checkboxes.forEach(function (cb) {
      cb.checked = !allChecked;
      var key = cb.getAttribute('onclick').match(/'([^']+)'\)/);
      if (key && key[1]) {
        var k = key[1];
        var i = window.APP.selectedTrees.indexOf(k);
        if (!allChecked && i === -1) window.APP.selectedTrees.push(k);
        if (allChecked && i !== -1) window.APP.selectedTrees.splice(i, 1);
      }
    });
    window.updatePDFBtnText();
  };

  window.updatePDFBtnText = function () {
    var _st2 = window.APP && window.APP.selectedTrees;
    var count = _st2 ? (typeof _st2.size === 'number' ? _st2.size : _st2.length) : 0;
    var btns = document.querySelectorAll('#btnExportPDF, .pdf-export-btn');
    btns.forEach(function (btn) {
      btn.textContent = '📄 PDF (' + count + ')';
    });
  };

  window.exportToPDF = function () {
    var _rawST = (window.APP && window.APP.selectedTrees);
    var keys = _rawST ? (typeof _rawST.forEach === 'function' && typeof _rawST.indexOf !== 'function' ? Array.from(_rawST) : _rawST) : [];
    if (keys.length === 0) { showNotif('Selecciona al menos un árbol', 'warning'); return; }

    var db = window._dbAll || {};
    var qs = window.QS || [];

    var riskColorMap = { bajo:'#15803d', moderado:'#f59e0b', alto:'#f97316', extremo:'#b91c1c' };
    var riskLabelMap = { bajo:'BAJO', moderado:'MODERADO', alto:'ALTO', extremo:'EXTREMO' };

    function pdfSafeVal(v) {
      if (v === undefined || v === null || v === '') return '—';
      if (Array.isArray(v)) return v.join(', ');
      if (typeof v === 'object') {
        return Object.entries(v).map(function (e) { return e[0] + ': ' + e[1]; }).join(', ');
      }
      return String(v);
    }

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">';
    html += '<title>Informe Bosques Urbanos</title>';
    html += '<style>';
    html += 'body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0;padding:0;}';
    html += '.page-break{page-break-after:always;}';
    html += '.header{background:#0f3320;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;}';
    html += '.header h1{font-size:20pt;margin:0;}';
    html += '.header .sub{font-size:9pt;color:#86efac;margin-top:4px;}';
    html += '.risk-banner{padding:12px 16px;border-radius:8px;text-align:center;border:2px solid;margin:12px 0;}';
    html += '.section-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#166534;border-bottom:2px solid #dcfce7;padding-bottom:4px;margin:14px 0 8px;}';
    html += '.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}';
    html += '.item{background:#fafaf8;border:1px solid #e5e0d5;border-radius:6px;padding:7px 9px;}';
    html += '.item-label{font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#7a746e;display:block;margin-bottom:2px;}';
    html += '.item-val{font-size:11pt;font-weight:700;color:#1a1a1a;}';
    html += '.diana-row{padding:5px 8px;border-radius:6px;font-size:10pt;margin-bottom:4px;border:1px solid #ddd;}';
    html += '@page{margin:1.5cm;}';
    html += '</style></head><body>';

    keys.forEach(function (key, ki) {
      var ev = db[key];
      if (!ev) return;
      var risk = getEffRisk(ev);
      var rColor = riskColorMap[risk] || '#15803d';
      var rLabel = riskLabelMap[risk] || 'BAJO';

      if (ki > 0) html += '<div class="page-break"></div>';

      // Header
      html += '<div class="header"><div>';
      html += '<div style="font-size:14pt;font-weight:900;">Bosques Urbanos · Informe de Riesgo</div>';
      html += '<div class="sub">ISA TRAQ · ' + new Date().toLocaleDateString('es-CL') + '</div>';
      html += '</div><div style="text-align:right;font-size:10pt;color:#86efac;">';
      html += safeVal(ev.cliente) + '<br>' + safeVal(ev.arbolId);
      html += '</div></div>';

      // Risk banner
      html += '<div class="risk-banner" style="background:' + rColor + '20;border-color:' + rColor + ';color:' + rColor + ';">';
      html += '<div style="font-size:22pt;font-weight:900;">' + rLabel + '</div>';
      html += '<div style="font-size:9pt;font-weight:700;">Nivel de Riesgo ISA TRAQ</div>';
      if (ev.riskOverride && ev.riskOverride.active) {
        html += '<div style="font-size:8pt;margin-top:4px;">Override manual: ' + pdfSafeVal(ev.riskOverride.reason) + '</div>';
      }
      html += '</div>';

      // Basic info
      html += '<div class="section-title">Identificación</div>';
      html += '<div class="grid">';
      html += '<div class="item"><span class="item-label">ID Árbol</span><span class="item-val">' + safeVal(ev.arbolId) + '</span></div>';
      html += '<div class="item"><span class="item-label">Cliente</span><span class="item-val">' + safeVal(ev.cliente) + '</span></div>';
      html += '<div class="item"><span class="item-label">Especie</span><span class="item-val">' + safeVal(ev.especie) + '</span></div>';
      html += '<div class="item"><span class="item-label">Evaluador</span><span class="item-val">' + safeVal(ev.evaluador) + '</span></div>';
      html += '<div class="item"><span class="item-label">Fecha</span><span class="item-val">' + fmtDate(ev.timestamp) + '</span></div>';
      if (ev.lat && ev.lng) {
        html += '<div class="item"><span class="item-label">GPS</span><span class="item-val">' + Number(ev.lat).toFixed(6) + ', ' + Number(ev.lng).toFixed(6) + '</span></div>';
      }
      html += '</div>';

      // All QS answers
      html += '<div class="section-title">Respuestas del Formulario</div>';
      html += '<div class="grid">';

      qs.forEach(function (q) {
        if (q.type === 'risk_target_group') {
          // Handled separately below
          return;
        }
        var val = ev[q.id];
        if (val === undefined || val === null) return;

        if (q.type === 'group' && q.fields) {
          var grp = ev[q.id] || {};
          q.fields.forEach(function (f) {
            var fv = grp[f.id];
            if (fv === undefined || fv === null || fv === '') return;
            html += '<div class="item"><span class="item-label">' + f.label + '</span><span class="item-val">' + pdfSafeVal(fv) + '</span></div>';
          });
          return;
        }

        html += '<div class="item"><span class="item-label">' + q.label + '</span><span class="item-val">' + pdfSafeVal(val) + '</span></div>';
      });
      html += '</div>';

      // Diana groups
      var dianaGroups = [
        { key: 'copa_dianas',    label: 'Dianas Copa' },
        { key: 'tronco_dianas',  label: 'Dianas Tronco' },
        { key: 'raices_dianas',  label: 'Dianas Raíces' }
      ];
      dianaGroups.forEach(function (dg) {
        var arr = ev[dg.key];
        if (!arr || !arr.length) return;
        html += '<div class="section-title">' + dg.label + '</div>';
        arr.forEach(function (d) {
          var dr = d.riesgo || 'bajo';
          var dc = riskColorMap[dr] || '#15803d';
          html += '<div class="diana-row" style="border-color:' + dc + ';background:' + dc + '18;">';
          html += '<strong>Diana:</strong> ' + pdfSafeVal(d.diana || d.ocupacion) + ' · ';
          html += '<strong>Prob. Fallo:</strong> ' + pdfSafeVal(d.prob_fallo) + ' · ';
          html += '<strong>Impacto:</strong> ' + pdfSafeVal(d.impacto) + ' · ';
          html += '<strong>Riesgo:</strong> <span style="font-weight:900;color:' + dc + ';">' + (riskLabelMap[dr] || dr.toUpperCase()) + '</span>';
          html += '</div>';
        });
      });

      // Rinntech
      if (ev.H || ev.Di || ev.Dd) {
        html += '<div class="section-title">Biometría Rinntech</div>';
        html += '<div class="grid">';
        ['H','C','Di','Hd','Dd','tActual','topologia'].forEach(function (k) {
          if (ev[k]) html += '<div class="item"><span class="item-label">' + k + '</span><span class="item-val">' + pdfSafeVal(ev[k]) + '</span></div>';
        });
        html += '</div>';
      }

      // Notes
      if (ev.notes) {
        html += '<div class="section-title">Notas</div>';
        html += '<div style="background:#fafaf8;border:1px solid #e5e0d5;border-radius:8px;padding:10px 12px;font-size:10.5pt;">' + pdfSafeVal(ev.notes) + '</div>';
      }
    });

    html += '</body></html>';

    var pc = document.getElementById('print-container');
    if (pc) {
      pc.innerHTML = html;
    }
    window.print();
  };

  // ─────────────────────────────────────────
  // TREE DETAIL MODAL
  // ─────────────────────────────────────────
  window.showTreeDetail = function (key) {
    var db = window._dbAll || {};
    var ev = db[key];
    if (!ev) { showNotif('Evaluación no encontrada', 'error'); return; }

    var risk = getEffRisk(ev);
    var color = getRiskColor(risk);
    var label = getRiskLabel(risk);

    // Set modal title
    var titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = (ev.arbolId || key) + ' · ' + safeVal(ev.especie);

    var html = '';

    // 1. Risk banner
    html += '<div class="risk-banner rb-' + risk + '">';
    html += '<span class="rb-level">' + label.toUpperCase() + '</span>';
    html += '<span class="rb-label">Nivel de Riesgo ISA TRAQ</span>';
    if (ev.riskOverride && ev.riskOverride.active) {
      html += '<div style="margin-top:6px;font-size:11px;font-weight:700;">Override: ' + safeVal(ev.riskOverride.reason) + '</div>';
    }
    html += '</div>';

    // 2. Biometría Rinntech
    if (ev.H || ev.Di || ev.Dd || ev.tActual) {
      html += '<div class="detail-section">';
      html += '<span class="detail-sec-title">Biometría Rinntech</span>';
      html += '<div class="r-bio">';
      var rinnFields = [
        { k:'H', l:'Altura total H' }, { k:'C', l:'Inicio copa C' },
        { k:'Di', l:'Diám. sección intacta Di' }, { k:'Hd', l:'Altura defecto Hd' },
        { k:'Dd', l:'Diám. exterior defecto Dd' }, { k:'tActual', l:'Pared residual t_actual' },
        { k:'topologia', l:'Topología' }
      ];
      rinnFields.forEach(function (f) {
        if (ev[f.k] !== undefined && ev[f.k] !== null && ev[f.k] !== '') {
          html += '<div class="r-bio-row"><span class="r-bio-key">' + f.l + '</span>';
          html += '<span class="rv-neu">' + safeVal(ev[f.k]) + '</span></div>';
        }
      });

      // APO calculation
      if (ev.tActual && ev.Dd) {
        var tA = parseFloat(ev.tActual);
        var Dd = parseFloat(ev.Dd);
        if (!isNaN(tA) && !isNaN(Dd) && Dd > 0) {
          var tMin = Dd * 0.15;
          var pct = (tA / Dd * 100).toFixed(1);
          var apo_cls = tA >= tMin ? 'rv-ok' : 'rv-bad';
          html += '<div class="r-bio-row"><span class="r-bio-key">APO (t/D ratio)</span>';
          html += '<span class="' + apo_cls + '">' + pct + '% · ' + (tA >= tMin ? 'Adecuado' : 'Crítico') + '</span></div>';
        }
      }
      html += '</div></div>';
    }

    // 3. Photos
    var photosRaw = window.FB ? window.FB.getPhotoUrls(ev) : (ev.photoUrls || ev.photos || []);
    var photos = photosRaw.filter(function (u) { return u && typeof u === 'string' && u.length > 0; });
    html += '<div class="detail-section">';
    html += '<span class="detail-sec-title">Fotos (' + photos.length + ')</span>';
    html += '<div class="photos-grid">';
    photos.forEach(function (url, idx) {
      html += '<div class="photo-thumb" onclick="openPhotoModal(\'' + key + '\',' + idx + ')">';
      html += '<img src="' + url + '" alt="Foto ' + (idx + 1) + '" loading="lazy" onerror="this.closest(\'.photo-thumb\').style.display=\'none\'">';
      html += '<button class="photo-del" onclick="event.stopPropagation();deletePhoto(\'' + key + '\',' + idx + ')">✕</button>';
      html += '</div>';
    });
    html += '<div class="photo-add-btn" onclick="triggerPhotoInput(\'' + key + '\',\'camera\')" title="Cámara">';
    html += '<span style="font-size:22px;">📷</span>';
    html += '<span class="photo-add-label">Cámara</span>';
    html += '</div>';
    html += '<div class="photo-add-btn" onclick="triggerPhotoInput(\'' + key + '\',\'gallery\')" title="Galería" style="background:#eff6ff;">';
    html += '<span style="font-size:22px;">🖼️</span>';
    html += '<span class="photo-add-label">Galería</span>';
    html += '</div>';
    html += '</div></div>';

    // 4. Notes
    html += '<div class="detail-section">';
    html += '<span class="detail-sec-title">Notas del Técnico</span>';
    html += '<textarea id="detail-notes-' + key + '" style="width:100%;min-height:80px;padding:10px 12px;border:1.5px solid #ddd;border-radius:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;line-height:1.5;" placeholder="Añade notas, observaciones...">' + safeVal(ev.notes === '—' ? '' : (ev.notes || '')) + '</textarea>';
    html += '<button onclick="saveTreeNotes(\'' + key + '\')" style="margin-top:6px;padding:9px 20px;background:#0f3320;color:#fff;border:none;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer;width:100%;">💾 Guardar notas</button>';
    html += '</div>';

    // 5. Identification + All form answers
    var ans = ev.answers || {}; // old records store data in ev.answers
    html += '<div class="detail-section">';
    html += '<span class="detail-sec-title">Datos de la Evaluación</span>';
    html += '<div class="detail-grid">';

    // Always show identification fields
    var idFields = [
      { id: 'arbolId',   label: 'ID Árbol' },
      { id: 'especie',   label: 'Especie' },
      { id: 'cliente',   label: 'Cliente' },
      { id: 'evaluador', label: 'Evaluador' }
    ];
    idFields.forEach(function (f) {
      var v = ev[f.id] || ans[f.id];
      if (v) html += '<div class="detail-item"><span class="di-label">' + f.label + '</span><span class="di-val">' + safeVal(v) + '</span></div>';
    });

    // Date
    var ts = ev.timestamp || ev.ts || ev.fecha;
    if (ts) html += '<div class="detail-item"><span class="di-label">Fecha</span><span class="di-val">' + fmtDate(ts) + '</span></div>';

    // Method badge
    if (ev.riskSource === 'manual' || ev.evaluationMethod === 'manual') {
      html += '<div class="detail-item"><span class="di-label">Método</span><span class="di-val" style="color:#b45309;font-weight:700;">📋 Riesgo Manual</span></div>';
    } else if (ev.evaluationMethod === 'isa' || ev.isaLevel) {
      html += '<div class="detail-item"><span class="di-label">Método</span><span class="di-val" style="color:#0f3320;font-weight:700;">📊 ISA TRAQ</span></div>';
    }

    var qs = window.QS || [];
    qs.forEach(function (q) {
      if (q.type === 'risk_target_group') return; // handled separately
      // skip identification fields already shown above
      if (['arbolId','especie','cliente','evaluador'].indexOf(q.id) !== -1) return;

      // Support both top-level ev and legacy ev.answers
      var val = (ev[q.id] !== undefined && ev[q.id] !== null) ? ev[q.id]
              : (ans[q.id] !== undefined && ans[q.id] !== null) ? ans[q.id]
              : undefined;
      if (val === undefined || val === null) return;

      if (q.type === 'group' && q.fields) {
        var grp = (typeof val === 'object' && !Array.isArray(val)) ? val : {};
        q.fields.forEach(function (f) {
          var fv = grp[f.id];
          if (fv === undefined || fv === null || fv === '') return;
          html += '<div class="detail-item"><span class="di-label">' + f.label + '</span><span class="di-val">' + safeVal(fv) + '</span></div>';
        });
        return;
      }

      var displayVal = Array.isArray(val) ? val.join(', ') : safeVal(val);
      html += '<div class="detail-item"><span class="di-label">' + q.label + '</span><span class="di-val">' + displayVal + '</span></div>';
    });
    html += '</div>';

    // Diana groups special display
    var dianaGroups = [
      { key: 'copa_dianas',   label: 'Dianas Copa' },
      { key: 'tronco_dianas', label: 'Dianas Tronco' },
      { key: 'raices_dianas', label: 'Dianas Raíces' }
    ];
    dianaGroups.forEach(function (dg) {
      var arr = ev[dg.key];
      if (!arr || !arr.length) return;
      html += '<div style="margin-top:10px;">';
      html += '<span class="detail-sec-title">' + dg.label + '</span>';
      arr.forEach(function (d) {
        var dr = d.riesgo || 'bajo';
        var dc = getRiskColor(dr);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;border:1.5px solid ' + dc + ';background:' + dc + '1a;margin-bottom:5px;">';
        html += '<div style="width:10px;height:10px;border-radius:50%;background:' + dc + ';flex-shrink:0;"></div>';
        html += '<div style="flex:1;font-size:11px;font-weight:600;">';
        if (d.diana || d.ocupacion) html += '<div>' + safeVal(d.diana || d.ocupacion) + '</div>';
        if (d.prob_fallo) html += '<div style="color:#7a746e;">Prob. fallo: ' + d.prob_fallo + '</div>';
        if (d.impacto) html += '<div style="color:#7a746e;">Impacto: ' + d.impacto + '</div>';
        html += '</div>';
        html += '<span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#fff;background:' + dc + ';padding:2px 8px;border-radius:20px;">' + getRiskLabel(dr) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    });

    html += '</div>'; // detail-section

    // 6. GPS
    var gpsStr = typeof window._normalizeGPS === 'function' ? window._normalizeGPS(ev) : (ev.gps || (ev.lat && ev.lng ? ev.lat + ',' + ev.lng : ''));
    if (gpsStr) {
      var gpsParts = String(gpsStr).split(',');
      var gpsLat = parseFloat(gpsParts[0]);
      var gpsLng = parseFloat(gpsParts[1]);
      if (!isNaN(gpsLat) && !isNaN(gpsLng)) {
        html += '<div class="detail-section">';
        html += '<span class="detail-sec-title">Ubicación GPS</span>';
        html += '<a href="https://maps.google.com/?q=' + gpsLat + ',' + gpsLng + '" target="_blank" style="display:flex;align-items:center;gap:8px;padding:11px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;text-decoration:none;color:#15803d;font-weight:700;font-size:13px;">';
        html += '📍 ' + gpsLat.toFixed(6) + ', ' + gpsLng.toFixed(6);
        html += ' <span style="margin-left:auto;font-size:11px;">Ver en Maps ›</span>';
        html += '</a></div>';
      }
    }

    // 7. Risk override
    var ovActive = (ev.riskOverride && ev.riskOverride.active) ? true : false;
    var ovLevel = ev.riskOverride && ev.riskOverride.level ? ev.riskOverride.level : risk;
    var ovReason = ev.riskOverride && ev.riskOverride.reason ? ev.riskOverride.reason : '';

    html += '<div class="detail-section">';
    html += '<span class="detail-sec-title">Override de Riesgo</span>';
    html += '<div class="risk-override-box">';
    html += '<div class="override-row">';
    html += '<span class="override-label">Activar override manual de riesgo</span>';
    html += '<label class="toggle-switch"><input type="checkbox" id="ov-toggle-' + key + '" ' + (ovActive ? 'checked' : '') + ' onchange="toggleRiskOverride(\'' + key + '\',this.checked)"><span class="toggle-slider"></span></label>';
    html += '</div>';
    html += '<div id="ov-fields-' + key + '" style="display:' + (ovActive ? 'flex' : 'none') + ';flex-direction:column;gap:8px;">';
    html += '<select id="ov-level-' + key + '" class="override-select">';
    ['bajo','moderado','alto','extremo'].forEach(function (lvl) {
      html += '<option value="' + lvl + '"' + (ovLevel === lvl ? ' selected' : '') + '>' + getRiskLabel(lvl) + '</option>';
    });
    html += '</select>';
    html += '<textarea id="ov-reason-' + key + '" class="override-note" placeholder="Motivo del override...">' + ovReason + '</textarea>';
    html += '<button onclick="saveRiskOverride(\'' + key + '\')" class="override-save-btn">💾 Guardar Override</button>';
    html += '</div>';
    html += '</div></div>';

    // 8. Actions
    html += '<div class="detail-section" style="margin-top:20px;display:flex;flex-direction:column;gap:8px;">';
    html += '<button onclick="closeModal();window.masNewISAFromKey && window.masNewISAFromKey(\'' + key + '\')" style="width:100%;padding:12px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">📊 Nueva evaluación ISA TRAQ</button>';
    html += '<button onclick="if(confirm(\'¿Eliminar esta evaluación?\'))deleteEval(\'' + key + '\')" style="width:100%;padding:12px;background:#fee2e2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">🗑 Eliminar evaluación</button>';
    html += '</div>';

    var modalBody = document.getElementById('modalBody');
    if (modalBody) modalBody.innerHTML = html;

    var modal = document.getElementById('detailModal');
    if (modal) modal.classList.add('open');
  };

  window.closeModal = function () {
    var modal = document.getElementById('detailModal');
    if (modal) modal.classList.remove('open');
  };

  // ─────────────────────────────────────────
  // RISK OVERRIDE
  // ─────────────────────────────────────────
  window.toggleRiskOverride = function (key, checked) {
    var fields = document.getElementById('ov-fields-' + key);
    if (fields) fields.style.display = checked ? 'flex' : 'none';
  };

  window.saveRiskOverride = function (key) {
    var levelEl = document.getElementById('ov-level-' + key);
    var reasonEl = document.getElementById('ov-reason-' + key);
    var toggleEl = document.getElementById('ov-toggle-' + key);

    if (!levelEl) return;
    var overrideData = {
      active: toggleEl ? toggleEl.checked : true,
      level: levelEl.value,
      reason: reasonEl ? reasonEl.value : ''
    };

    // Update local cache
    if (window._dbAll && window._dbAll[key]) {
      window._dbAll[key].riskOverride = overrideData;
      if (overrideData.active) window._dbAll[key].isaLevel = overrideData.level;
    }

    window.FB.saveOverride(key, overrideData)
      .then(function () { showNotif('Override guardado', 'success'); })
      .catch(function (e) { showNotif('Error: ' + e.message, 'error'); });
  };

  // ─────────────────────────────────────────
  // NOTES
  // ─────────────────────────────────────────
  window.saveTreeNotes = function (key) {
    var el = document.getElementById('detail-notes-' + key);
    if (!el) return;
    var note = el.value.trim();

    if (window._dbAll && window._dbAll[key]) {
      window._dbAll[key].notes = note;
    }

    window.FB.saveNote(key, note)
      .then(function () { showNotif('Notas guardadas', 'success'); })
      .catch(function (e) { showNotif('Error: ' + e.message, 'error'); });
  };

  // ─────────────────────────────────────────
  // PHOTOS IN DETAIL
  // ─────────────────────────────────────────
  window.openPhotoModal = function (key, idx) {
    var db = window._dbAll || {};
    var ev = db[key];
    if (!ev) return;
    var photos = window.FB ? window.FB.getPhotoUrls(ev) : (ev.photoUrls || ev.photos || []);
    if (idx >= photos.length) return;
    var url = photos[idx];

    // Create or reuse photo modal
    var pm = document.getElementById('photoViewModal');
    if (!pm) {
      pm = document.createElement('div');
      pm.id = 'photoViewModal';
      pm.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;';
      pm.innerHTML = '<img id="photoViewImg" style="max-width:96vw;max-height:80vh;border-radius:10px;object-fit:contain;">'
        + '<button onclick="closePhotoModal()" style="padding:10px 28px;background:#fff;color:#1a1a1a;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">✕ Cerrar</button>';
      document.body.appendChild(pm);
    }
    document.getElementById('photoViewImg').src = url;
    pm.style.display = 'flex';
  };

  window.closePhotoModal = function () {
    var pm = document.getElementById('photoViewModal');
    if (pm) pm.style.display = 'none';
  };

  window.deletePhoto = function (key, idx) {
    if (!confirm('¿Eliminar esta foto?')) return;
    window.FB.deletePhoto(key, idx)
      .then(function () {
        showNotif('Foto eliminada', 'success');
        window.showTreeDetail(key);
      })
      .catch(function (e) { showNotif('Error: ' + e.message, 'error'); });
  };

  window.triggerPhotoInput = function (key, source) {
    if (!window.APP) window.APP = {};
    window.APP.detailKey = key;
    var inputId = (source === 'gallery') ? 'photo-input-gallery' : 'photo-input';
    var inp = document.getElementById(inputId);
    if (inp) { inp.dataset.arbolId = ''; inp.value = ''; inp.click(); }
  };

  // ─────────────────────────────────────────
  // PHOTO CAPTURE (from input)
  // ─────────────────────────────────────────
  window.handlePhotoCapture = function (event) {
    var files = event.target.files;
    if (!files || !files.length) return;
    var key = window.APP && window.APP.detailKey;
    if (!key) return;

    var db = window._dbAll || {};
    var ev = db[key];
    if (!ev) return;

    var file = files[0];
    var clienteId = (ev.cliente || 'general').replace(/\s+/g, '_');
    var arbolId = (ev.arbolId || key).replace(/\s+/g, '_');

    window.FB.uploadPhoto(clienteId, arbolId, file)
      .then(function (result) {
        return window.FB.addPhotoToEval(key, result.url);
      })
      .then(function () {
        showNotif('Foto añadida', 'success');
        window.showTreeDetail(key);
      })
      .catch(function (e) { showNotif('Error subiendo foto: ' + e.message, 'error'); });

    event.target.value = '';
  };

  // ─────────────────────────────────────────
  // DOCUMENT MODAL
  // ─────────────────────────────────────────
  var _docsClient = null;
  var _docsLocal  = [];

  window.openDocsModal = function (encodedName) {
    _docsClient = decodeURIComponent(encodedName);
    _docsLocal = [];

    var modal = document.getElementById('docsModal');
    if (modal) modal.classList.add('open');

    var container = document.getElementById('docs-modal-list');
    if (container) container.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#7a746e;font-size:13px;">⏳ Cargando documentos...</div>';

    // Load from Firebase
    var clientKey = (_docsClient || '').replace(/\s+/g,'_').toLowerCase();
    if (typeof window._fbOnArchivosCliente === 'function') {
      window._fbOnArchivosCliente(clientKey, function (snap) {
        var data = snap && snap.val ? snap.val() : null;
        _docsLocal = data ? Object.values(data).filter(Boolean) : [];
        window.renderDocsModal();
      });
    } else {
      window.renderDocsModal();
    }
  };

  window.closeDocsModal = function () {
    var modal = document.getElementById('docsModal');
    if (modal) modal.classList.remove('open');
  };

  window.renderDocsModal = function () {
    var container = document.getElementById('docs-modal-list');
    if (!container) return;

    var titleEl = document.getElementById('docs-modal-title');
    if (titleEl) titleEl.textContent = 'Archivos · ' + (_docsClient || '');

    if (_docsLocal.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#7a746e;font-size:13px;">Sin documentos cargados en esta sesión.</div>';
    } else {
      var html = '';
      _docsLocal.forEach(function (doc, idx) {
        var icon = doc.name && doc.name.endsWith('.pdf') ? '📄' : '📎';
        html += '<div class="doc-item">';
        html += '<span class="doc-icon">' + icon + '</span>';
        html += '<a href="' + doc.url + '" target="_blank" class="doc-name">' + safeVal(doc.name) + '</a>';
        html += '<span class="doc-date">' + (doc.ts ? fmtDate(doc.ts) : '') + '</span>';
        html += '<button class="doc-del" onclick="deleteDoc(' + idx + ')">✕</button>';
        html += '</div>';
      });
      container.innerHTML = html;
    }

    // Upload area
    container.innerHTML += '<div class="upload-area" onclick="document.getElementById(\'doc-input\').click()">';
    container.innerHTML += '<span class="upload-area-icon">📁</span>';
    container.innerHTML += '<span class="upload-area-label">Toca para subir documento</span>';
    container.innerHTML += '</div>';
    container.innerHTML += '<input type="file" id="doc-input" style="display:none;" onchange="handleDocUpload(event)" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">';
  };

  window.deleteDoc = function (idx) {
    _docsLocal.splice(idx, 1);
    window.renderDocsModal();
  };

  window.handleDocUpload = function (event) {
    var files = event.target.files;
    if (!files || !files.length) return;
    var file = files[0];
    var clienteId = (_docsClient || 'general').replace(/\s+/g, '_').toLowerCase();

    window.FB.uploadDoc(clienteId, file)
      .then(function (result) {
        if (!result.ts) result.ts = Date.now();
        if (!result.name) result.name = file.name;
        // Persist to Firebase DB under /archivos/{clientKey}/
        if (typeof window._fbPushArchivo === 'function') {
          window._fbPushArchivo(clienteId, result);
        }
        _docsLocal.push(result);
        showNotif('Documento subido', 'success');
        window.renderDocsModal();
      })
      .catch(function (e) { showNotif('Error: ' + e.message, 'error'); });

    event.target.value = '';
  };

  // ─────────────────────────────────────────
  // POPULATE SELECTORS
  // ─────────────────────────────────────────
  window.populateClientList = function () {
    var db = window._dbAll || {};
    var clientesAll = window._clientesAll || {};

    var names = {};

    // From evaluations
    Object.keys(db).forEach(function (k) {
      var n = (db[k].cliente || '').trim();
      if (n) names[n] = true;
    });

    // From _clientesAll
    Object.keys(clientesAll).forEach(function (k) {
      var c = clientesAll[k];
      var n = (c.nombre || c.name || '').trim();
      if (n) names[n] = true;
    });

    var sorted = Object.keys(names).sort();

    // Datalist
    var dl = document.getElementById('client-datalist');
    if (dl) {
      dl.innerHTML = sorted.map(function (n) { return '<option value="' + n + '">'; }).join('');
    }

    // Map select
    var mapSel = document.getElementById('map-f-cliente');
    if (mapSel) {
      var current = mapSel.value;
      mapSel.innerHTML = '<option value="">Todos los clientes</option>';
      sorted.forEach(function (n) {
        mapSel.innerHTML += '<option value="' + n + '"' + (current === n ? ' selected' : '') + '>' + n + '</option>';
      });
    }

    // DB filter select
    var fSel = document.getElementById('f-cliente');
    if (fSel) {
      var cur = fSel.value;
      fSel.innerHTML = '<option value="">Todos</option>';
      sorted.forEach(function (n) {
        fSel.innerHTML += '<option value="' + n + '"' + (cur === n ? ' selected' : '') + '>' + n + '</option>';
      });
    }

    // Lv1 list — refresh if visible
    var lv1 = document.getElementById('db-level-1');
    if (lv1 && lv1.style.display !== 'none') {
      window.dbRenderLv1();
    }
  };

  // ─────────────────────────────────────────
  // DELETE FUNCTIONS
  // ─────────────────────────────────────────

  /** Delete a single evaluation */
  window.deleteEval = async function (key) {
    if (!confirm('¿Eliminar esta evaluación? Esta acción es irreversible.')) return;
    try {
      await window.FB.removeEval(key);
      if (window._dbAll) delete window._dbAll[key];
      if (window._fbRawAll) delete window._fbRawAll[key];
      showNotif('🗑 Evaluación eliminada', 'success');
      window.closeModal();
      window.dbRenderLv2();
    } catch (e) {
      showNotif('❌ Error: ' + (e.message || 'desconocido'), 'error');
    }
  };

  /** Delete ALL evaluations for a specific tree (arbolId) of the active client */
  window.deleteTree = async function (encodedAid) {
    var aid = decodeURIComponent(encodedAid);
    var db = window._dbAll || {};
    var keysToDelete = Object.keys(db).filter(function (k) {
      var ev = db[k];
      return (ev.arbolId || k) === aid && (ev.cliente || '').trim() === _dbClient;
    });
    if (!confirm('¿Eliminar árbol "' + aid + '" y sus ' + keysToDelete.length + ' evaluaciones? Irreversible.')) return;
    try {
      for (var i = 0; i < keysToDelete.length; i++) {
        await window.FB.removeEval(keysToDelete[i]);
        if (window._dbAll) delete window._dbAll[keysToDelete[i]];
        if (window._fbRawAll) delete window._fbRawAll[keysToDelete[i]];
      }
      showNotif('🗑 Árbol eliminado (' + keysToDelete.length + ' eval.)', 'success');
      window.dbRenderLv2();
    } catch (e) {
      showNotif('❌ Error: ' + (e.message || 'desconocido'), 'error');
    }
  };

  /** Delete ALL evaluations for a client + the client record */
  window.deleteClientFromRecords = async function (encodedName) {
    var clientName = decodeURIComponent(encodedName);
    var db = window._dbAll || {};
    var keysToDelete = Object.keys(db).filter(function (k) {
      var ev = db[k];
      var evClient = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || '')).trim();
      return evClient === clientName;
    });
    if (!confirm('¿Eliminar cliente "' + clientName + '" y sus ' + keysToDelete.length + ' evaluaciones? Irreversible.')) return;
    try {
      for (var i = 0; i < keysToDelete.length; i++) {
        await window.FB.removeEval(keysToDelete[i]);
        if (window._dbAll) delete window._dbAll[keysToDelete[i]];
        if (window._fbRawAll) delete window._fbRawAll[keysToDelete[i]];
      }
      // Also remove from /clientes/ collection
      var clientesAll = window._clientesAll || {};
      var entries = Object.entries(clientesAll);
      for (var j = 0; j < entries.length; j++) {
        if ((entries[j][1].nombre || '').trim() === clientName) {
          await window.FB.removeCliente(entries[j][0]);
          break;
        }
      }
      showNotif('🗑 Cliente eliminado', 'success');
      window.dbRenderLv1();
    } catch (e) {
      showNotif('❌ Error: ' + (e.message || 'desconocido'), 'error');
    }
  };

}());
