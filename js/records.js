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

    // ── FORCE container display (bypass any CSS/cache issues) ──
    container.style.display       = 'block';
    container.style.flexDirection = '';
    container.style.gap           = '';
    container.style.alignContent  = '';
    container.style.overflowY     = 'auto';
    container.style.overflowX     = 'hidden';
    container.style.padding       = '12px 14px 90px';
    container.style.minHeight     = '0';
    container.style.flex          = '1';

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
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#9ca3af;font-size:14px;">🌱 Sin clientes registrados aún.</div>';
      return;
    }

    // Sort by worst risk then name
    var RORD = { extremo: 0, alto: 1, moderado: 2, bajo: 3 };
    clients.sort(function (a, b) {
      var ra = worstRisk(Object.values(a.trees).map(function(evs) {
        evs.sort(function(x,y){return(y.ev.timestamp||0)-(x.ev.timestamp||0);});
        return getEffRisk(evs[0].ev);
      }));
      var rb = worstRisk(Object.values(b.trees).map(function(evs) {
        evs.sort(function(x,y){return(y.ev.timestamp||0)-(x.ev.timestamp||0);});
        return getEffRisk(evs[0].ev);
      }));
      var d = (RORD[ra]||3) - (RORD[rb]||3);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });

    // ── Inline style constants (immune to any CSS) ──
    var CARD = 'display:block;width:100%;box-sizing:border-box;background:#ffffff;border:1.5px solid #e5e7eb;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:14px;overflow:visible;cursor:pointer;-webkit-tap-highlight-color:transparent;';
    var RBAR_COLORS = { bajo: '#22c55e', moderado: '#f59e0b', alto: '#f97316', extremo: '#b91c1c' };

    var html = '';
    clients.forEach(function (c) {
      var treeIds = Object.keys(c.trees);
      var totalTrees = treeIds.length;
      var totalEvals = c.evals.length;

      // Latest eval per tree
      var latestEvals = treeIds.map(function (tid) {
        var evs = c.trees[tid].slice().sort(function (a, b) {
          return (b.ev.timestamp || 0) - (a.ev.timestamp || 0);
        });
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
      var altoCount    = riskCounts.alto || 0;
      var wColor = getRiskColor(worst);

      // Last eval date
      var lastTs = 0;
      c.evals.forEach(function (item) {
        var t = item.ev.timestamp || item.ev.ts || 0;
        if (t > lastTs) lastTs = t;
      });

      var enc = encodeURIComponent(c.name);
      var letter = c.name.charAt(0).toUpperCase();

      // ── Risk bar ──
      var barTotal = totalTrees || 1;
      var barHtml = '';
      ['bajo','moderado','alto','extremo'].forEach(function (r) {
        if (riskCounts[r] > 0) {
          barHtml += '<div style="flex:' + riskCounts[r] + ';background:' + RBAR_COLORS[r] + ';height:100%;"></div>';
        }
      });

      // ── Card HTML (100% inline styles) ──
      html += '<div onclick="dbOpenClient(\'' + enc + '\')" style="' + CARD + '">';

      // Top row: avatar + info + chevron
      html += '<div style="display:flex;align-items:center;gap:12px;padding:14px 14px 12px;">';
      html += '<div style="width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#0a2410 0%,#166534 100%);font-size:20px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:Georgia,serif;">' + letter + '</div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">' + c.name + '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">';
      html += '<span style="font-size:11px;color:#6b7280;">📅 ' + fmtDate(lastTs) + '</span>';
      html += '<span style="background:' + wColor + ';color:#fff;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">' + getRiskLabel(worst) + '</span>';
      html += '</div></div>';
      html += '<div style="font-size:22px;color:#d1d5db;flex-shrink:0;line-height:1;">›</div>';
      html += '</div>';

      // Risk distribution bar
      if (barHtml) {
        html += '<div style="height:5px;display:flex;width:100%;overflow:hidden;">' + barHtml + '</div>';
      }

      // Stats row (3 columns)
      html += '<div style="display:flex;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;">';
      html += '<div style="flex:1;padding:10px 6px;text-align:center;border-right:1px solid #f3f4f6;">';
      html +=   '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:20px;font-weight:800;color:#111827;line-height:1;">' + totalTrees + '</div>';
      html +=   '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-top:2px;">Árboles</div>';
      html += '</div>';
      html += '<div style="flex:1;padding:10px 6px;text-align:center;border-right:1px solid #f3f4f6;">';
      html +=   '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:20px;font-weight:800;color:#111827;line-height:1;">' + totalEvals + '</div>';
      html +=   '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-top:2px;">Evaluaciones</div>';
      html += '</div>';
      html += '<div style="flex:1;padding:10px 6px;text-align:center;">';
      html +=   '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:20px;font-weight:800;color:' + (extremoCount > 0 ? '#b91c1c' : altoCount > 0 ? '#ea580c' : '#9ca3af') + ';line-height:1;">' + (extremoCount || altoCount || '—') + '</div>';
      html +=   '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-top:2px;">' + (extremoCount > 0 ? 'Extremo' : altoCount > 0 ? 'Alto' : 'Riesgo') + '</div>';
      html += '</div>';
      html += '</div>';

      // Risk pills (if varied)
      var pillHtml = '';
      ['extremo','alto','moderado','bajo'].forEach(function (r) {
        if (riskCounts[r] > 0) {
          var rc = getRiskColor(r);
          pillHtml += '<span style="background:' + rc + '18;color:' + rc + ';border:1px solid ' + rc + '55;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">' + riskCounts[r] + ' ' + getRiskLabel(r) + '</span>';
        }
      });
      if (pillHtml) {
        html += '<div style="padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;">' + pillHtml + '</div>';
      }

      // Action buttons (2×2 grid)
      var btnBase = 'display:flex;align-items:center;justify-content:center;gap:5px;padding:12px 8px;background:#fff;border:none;border-top:1px solid #f3f4f6;font-size:12px;font-weight:700;color:#374151;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;white-space:nowrap;width:100%;box-sizing:border-box;';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #f3f4f6;">';
      html += '<button onclick="event.stopPropagation();dbOpenClient(\'' + enc + '\')" style="' + btnBase + 'border-right:1px solid #f3f4f6;border-radius:0 0 0 14px;">🌳 Ver árboles</button>';
      html += '<button onclick="event.stopPropagation();openDocsModal(\'' + enc + '\')" style="' + btnBase + 'border-radius:0 0 14px 0;">📁 Archivos</button>';
      html += '<button onclick="event.stopPropagation();dbExportClientPDF(\'' + enc + '\')" style="' + btnBase + 'border-right:1px solid #f3f4f6;border-top:1px solid #f3f4f6;color:#1d4ed8;border-radius:0;">📄 PDF</button>';
      html += '<button onclick="event.stopPropagation();if(confirm(\'¿Eliminar cliente ' + c.name.replace(/'/g,"\\'") + '?\'))deleteClientFromRecords(\'' + enc + '\')" style="' + btnBase + 'border-top:1px solid #f3f4f6;color:#b91c1c;border-radius:0 0 14px 0;">🗑 Eliminar</button>';
      html += '</div>';

      html += '</div>'; // card end
    });

    container.innerHTML = html;

    // Update count
    var countEl = document.getElementById('lv1-count');
    if (countEl) countEl.textContent = clients.length + ' cliente' + (clients.length !== 1 ? 's' : '');
  };

  window.dbOpenClient = function (encodedName) {
    _dbClient = decodeURIComponent(encodedName);
    _dbRisk = null;
    window._lv2PortalCfg = {}; // reset portal cache
    window.dbNav(2);
    _loadLv2PortalConfig(); // async load portal visibility config
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
  // INDIVIDUAL TREE PDF
  // ─────────────────────────────────────────

  window.dbExportTreePDF = function (key) {
    var db = window._dbAll || {};
    var ev = db[key];
    if (!ev) { showNotif('Evaluación no encontrada', 'error'); return; }
    if (!window.APP) window.APP = {};
    window.APP.selectedTrees = [key];
    showNotif('Preparando PDF del árbol ' + (ev.arbolId || key) + '...');
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

    // FORCE container style (bypass CSS cache)
    container.style.display       = 'block';
    container.style.flexDirection = '';
    container.style.gap           = '';
    container.style.overflowY     = 'auto';
    container.style.padding       = '12px 14px 100px';
    container.style.flex          = '1';
    container.style.minHeight     = '0';

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

    // ── Inline style constants ──
    var CARD_BASE = 'display:block;width:100%;box-sizing:border-box;background:#fff;border-radius:14px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.07);overflow:visible;font-family:\'IBM Plex Sans\',sans-serif;border:1.5px solid #e5e7eb;';
    var BTN = 'display:flex;align-items:center;justify-content:center;gap:4px;padding:10px 8px;background:#fff;border:none;border-top:1px solid #f3f4f6;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;width:100%;box-sizing:border-box;';
    var RCOLORS = { bajo: '#22c55e', moderado: '#f59e0b', alto: '#f97316', extremo: '#b91c1c' };

    // Load portal config for this client (async, updates cards after load)
    var _portalCfgCache = window._lv2PortalCfg || {};

    var html = '';
    trees.forEach(function (t) {
      var ev = t.latest.ev;
      var ans = ev.answers || {};
      var key = t.latest.key;
      var risk = getEffRisk(ev);
      var color = getRiskColor(risk);
      var label = getRiskLabel(risk);
      var _st = window.APP && window.APP.selectedTrees;
      var selected = _st && (typeof _st.has === 'function' ? _st.has(key) : _st.indexOf(key) !== -1);
      var arbolId = ev.arbolId || ans.arbolId || key;
      var especie = ev.especie || ans.especie || '—';
      var evaluador = ev.evaluador || ans.evaluador || '—';
      var fecha = fmtDate(ev.timestamp || ev.ts);

      // GPS (supports string, object, legacy)
      var gpsStr = '';
      var gpsRaw = (typeof window._normalizeGPS === 'function') ? window._normalizeGPS(ev)
        : (ev.gps || ans.gps || (ev.lat ? ev.lat + ',' + ev.lng : null) || '');
      if (gpsRaw && typeof gpsRaw === 'object' && gpsRaw.lat) gpsStr = gpsRaw.lat.toFixed(5) + ',' + gpsRaw.lng.toFixed(5);
      else if (gpsRaw) gpsStr = String(gpsRaw);

      // Diana groups (check both ev and ev.answers)
      var DIANA_KEYS = ['copa_dianas', 'tronco_dianas', 'raices_dianas'];
      var DIANA_LABELS = { copa_dianas: 'Copa', tronco_dianas: 'Tronco', raices_dianas: 'Raíces' };
      var dianaPills = '';
      var hasDianas = false;
      DIANA_KEYS.forEach(function (dk) {
        var d = ev[dk] || ans[dk] || [];
        if (d && d.length) {
          hasDianas = true;
          d.forEach(function (item) {
            if (item && item.riesgo) {
              var dc = getRiskColor(item.riesgo);
              dianaPills += '<span style="background:' + dc + '18;color:' + dc + ';border:1px solid ' + dc + '55;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;margin:2px;">' + DIANA_LABELS[dk] + ': ' + getRiskLabel(item.riesgo) + '</span>';
            }
          });
        }
      });

      // ISA summary
      var isaScore = ev.isaImpacto !== undefined && ev.isaImpacto !== null ? (parseFloat(ev.isaImpacto) * 100).toFixed(0) + '%' : null;
      var bioMargin = ev.bioMargin !== undefined && ev.bioMargin !== null ? parseFloat(ev.bioMargin).toFixed(2) : null;

      // Photos
      var photos = (window.FB ? window.FB.getPhotoUrls(ev) : (ev.photoUrls || ans.photoUrls || [])).filter(function (u) { return u && typeof u === 'string'; });

      // Portal visibility for this tree
      var fsArbol = (arbolId + '').replace(/[.#$[\]/]/g, '_');
      var fsCli = (_dbClient || '').replace(/[.#$[\]/]/g, '_');
      var portalKey = fsCli + '_' + fsArbol;
      var portalVisible = _portalCfgCache[portalKey] === true;

      // ── CARD HTML ──
      html += '<div id="tc-' + key + '" style="' + CARD_BASE + 'border-left:4px solid ' + color + ';">';

      // Top row: checkbox + ID + risk badge + portal toggle
      html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;">';
      html += '<input type="checkbox" ' + (selected ? 'checked' : '') + ' onclick="toggleSelection(event,\'' + key + '\')" style="width:17px;height:17px;accent-color:' + color + ';cursor:pointer;flex-shrink:0;">';
      html += '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;font-weight:700;color:#1d4ed8;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🌳 ' + arbolId + '</span>';
      html += '<span style="background:' + color + ';color:#fff;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:800;text-transform:uppercase;flex-shrink:0;">' + label + '</span>';
      // Portal toggle button
      html += '<button onclick="event.stopPropagation();dbTogglePortalTree(\'' + fsCli + '\',\'' + fsArbol + '\',this)" title="' + (portalVisible ? 'Visible al cliente' : 'Oculto al cliente') + '" style="background:' + (portalVisible ? '#dcfce7' : '#f3f4f6') + ';color:' + (portalVisible ? '#15803d' : '#9ca3af') + ';border:1.5px solid ' + (portalVisible ? '#86efac' : '#e5e7eb') + ';border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">' + (portalVisible ? '👁 Portal' : '🚫 Portal') + '</button>';
      html += '</div>';

      // Species + evaluator + date
      html += '<div onclick="showTreeDetail(\'' + key + '\')" style="padding:0 14px 10px;cursor:pointer;">';
      html += '<div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;">' + especie + '</div>';
      html += '<div style="font-size:11px;color:#6b7280;display:flex;gap:10px;flex-wrap:wrap;">';
      html += '<span>👤 ' + evaluador + '</span>';
      html += '<span>📅 ' + fecha + '</span>';
      if (t.count > 1) html += '<span style="color:#1d4ed8;font-weight:700;">↺ ' + t.count + ' evaluaciones</span>';
      if (photos.length) html += '<span>📷 ' + photos.length + ' foto' + (photos.length !== 1 ? 's' : '') + '</span>';
      html += '</div>';
      html += '</div>';

      // GPS
      if (gpsStr) {
        var gp = gpsStr.split(',');
        html += '<div style="padding:0 14px 8px;font-size:11px;color:#1d4ed8;font-family:\'IBM Plex Mono\',monospace;">📍 ' + (parseFloat(gp[0])||0).toFixed(5) + ', ' + (parseFloat(gp[1])||0).toFixed(5) + '</div>';
      }

      // ISA results row
      if (isaScore || bioMargin) {
        html += '<div style="padding:8px 14px;background:#f9fafb;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;display:flex;gap:14px;flex-wrap:wrap;">';
        if (isaScore) html += '<span style="font-size:11px;"><span style="font-weight:700;color:#374151;">ISA Impacto:</span> <span style="color:' + color + ';font-weight:700;">' + isaScore + '</span></span>';
        if (bioMargin) html += '<span style="font-size:11px;"><span style="font-weight:700;color:#374151;">Margen bio:</span> <span style="font-weight:600;">' + bioMargin + ' cm</span></span>';
        html += '</div>';
      }

      // Diana pills
      if (hasDianas) {
        html += '<div style="padding:8px 14px;display:flex;flex-wrap:wrap;gap:4px;">' + dianaPills + '</div>';
      } else {
        html += '<div style="padding:6px 14px;"><span style="background:' + color + '18;color:' + color + ';border:1px solid ' + color + '55;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;">Riesgo General: ' + label + '</span></div>';
      }

      // Action buttons (2×2 grid)
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-top:1px solid #f3f4f6;">';
      html += '<button onclick="event.stopPropagation();showTreeDetail(\'' + key + '\')" style="' + BTN + 'color:#0f3320;border-radius:0 0 0 12px;">🔍 Detalle</button>';
      if (gpsStr) {
        var encCliente = encodeURIComponent(_dbClient || '');
        html += '<button onclick="event.stopPropagation();switchTab(\'home\');setTimeout(function(){window.setActiveClient&&setActiveClient(\'' + encCliente + '\');setTimeout(function(){window.openMASFromKey&&openMASFromKey(\'' + key + '\')},300)},100)" style="' + BTN + 'color:#1d4ed8;">🗺️ Mapa</button>';
      } else {
        html += '<button style="' + BTN + 'color:#9ca3af;cursor:not-allowed;" disabled>🗺️ GPS</button>';
      }
      html += '<button onclick="event.stopPropagation();dbOpenTree(\'' + encodeURIComponent(t.aid) + '\')" style="' + BTN + 'color:#7c3aed;">↺ Historial</button>';
      html += '<button onclick="event.stopPropagation();if(confirm(\'¿Eliminar árbol ' + arbolId.replace(/'/g,"\\'") + '?\'))deleteTree(\'' + encodeURIComponent(t.aid) + '\')" style="' + BTN + 'color:#b91c1c;border-radius:0 0 12px 0;">🗑 Borrar</button>';
      html += '</div>';

      html += '</div>'; // card end
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

  // ── Quick portal tree toggle from Level 2 ──
  window._lv2PortalCfg = {};

  window.dbTogglePortalTree = function (clientKey, arbolKey, btn) {
    var portalKey = clientKey + '_' + arbolKey;
    var isNowVisible = window._lv2PortalCfg[portalKey] !== true;
    window._lv2PortalCfg[portalKey] = isNowVisible;

    // Update button UI
    if (btn) {
      btn.textContent = isNowVisible ? '👁 Portal' : '🚫 Portal';
      btn.style.background = isNowVisible ? '#dcfce7' : '#f3f4f6';
      btn.style.color = isNowVisible ? '#15803d' : '#9ca3af';
      btn.style.border = '1.5px solid ' + (isNowVisible ? '#86efac' : '#e5e7eb');
    }

    // Save to Firebase
    if (typeof window._fbSetPortalTree === 'function') {
      window._fbSetPortalTree(clientKey, arbolKey, { visible: isNowVisible });
    }
    window.showNotif && window.showNotif(isNowVisible ? '👁 Árbol ahora visible al cliente' : '🚫 Árbol ocultado al cliente');
  };

  // Load portal config for current client (called when entering Level 2)
  function _loadLv2PortalConfig() {
    if (!_dbClient) return;
    var clientKey = _dbClient.replace(/[.#$[\]/]/g, '_');
    if (typeof window._fbGetPortalConfig === 'function') {
      window._fbGetPortalConfig(clientKey, function (snap) {
        var data = snap && snap.val ? snap.val() : null;
        window._lv2PortalCfg = {};
        if (data && data.trees) {
          Object.keys(data.trees).forEach(function (ak) {
            window._lv2PortalCfg[clientKey + '_' + ak] = data.trees[ak].visible === true;
          });
        }
        // Re-render to show updated portal state
        window.dbRenderLv2();
      });
    }
  }

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
      html += '<div class="item"><span class="item-label">Fecha</span><span class="item-val">' + fmtDate(ev.timestamp || ev.ts) + '</span></div>';
      // GPS — handle object {lat,lng}, string "lat,lng", or legacy ev.lat/ev.lng
      var _pdfGps = ev.gps || ((ev.answers) && ev.answers.gps) || null;
      var _pdfLat = null, _pdfLng = null;
      if (_pdfGps && typeof _pdfGps === 'object' && _pdfGps.lat) {
        _pdfLat = parseFloat(_pdfGps.lat); _pdfLng = parseFloat(_pdfGps.lng);
      } else if (typeof _pdfGps === 'string' && _pdfGps.indexOf(',') !== -1) {
        var _pg = _pdfGps.split(','); _pdfLat = parseFloat(_pg[0]); _pdfLng = parseFloat(_pg[1]);
      } else if (ev.lat && ev.lng) {
        _pdfLat = parseFloat(ev.lat); _pdfLng = parseFloat(ev.lng);
      }
      if (_pdfLat && _pdfLng && !isNaN(_pdfLat) && !isNaN(_pdfLng)) {
        html += '<div class="item"><span class="item-label">GPS</span><span class="item-val">' + _pdfLat.toFixed(6) + ', ' + _pdfLng.toFixed(6) + '</span></div>';
      }
      if (ev.isaLevel) html += '<div class="item"><span class="item-label">Nivel ISA</span><span class="item-val" style="color:' + (riskColorMap[ev.isaLevel]||'#333') + ';font-weight:900;">' + (riskLabelMap[ev.isaLevel]||ev.isaLevel.toUpperCase()) + '</span></div>';
      if (ev.isaImpacto) html += '<div class="item"><span class="item-label">Prob. combinada</span><span class="item-val">' + pdfSafeVal(ev.isaImpacto) + '</span></div>';
      if (ev.bioMargin !== null && ev.bioMargin !== undefined) {
        var _bm = typeof ev.bioMargin === 'number' ? ev.bioMargin.toFixed(1) + '%' : pdfSafeVal(ev.bioMargin);
        html += '<div class="item"><span class="item-label">Margen Rinntech</span><span class="item-val" style="color:' + (ev.bioCritical ? '#b91c1c' : '#15803d') + ';">' + _bm + (ev.bioCritical ? ' ⚠️ Crítico' : ' ✅ OK') + '</span></div>';
      }
      html += '</div>';

      // All QS answers
      html += '<div class="section-title">Respuestas del Formulario</div>';
      html += '<div class="grid">';

      var _pdfAns = ev.answers || {};
      qs.forEach(function (q) {
        if (q.type === 'risk_target_group') return; // handled below
        if (['arbolId','especie','cliente','evaluador'].indexOf(q.id) !== -1) return; // already shown
        var val = (ev[q.id] !== undefined && ev[q.id] !== null) ? ev[q.id]
                : (_pdfAns[q.id] !== undefined && _pdfAns[q.id] !== null) ? _pdfAns[q.id]
                : undefined;
        if (val === undefined || val === null) return;

        if (q.type === 'group' && q.fields) {
          var grp = (typeof val === 'object' && !Array.isArray(val)) ? val : {};
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

      // Diana groups — check both top-level and ev.answers
      var dianaGroups = [
        { key: 'copa_dianas',    label: 'Dianas Copa' },
        { key: 'tronco_dianas',  label: 'Dianas Tronco' },
        { key: 'raices_dianas',  label: 'Dianas Raíces' }
      ];
      dianaGroups.forEach(function (dg) {
        var arr = ev[dg.key] || _pdfAns[dg.key];
        if (!arr || !arr.length) return;
        html += '<div class="section-title">' + dg.label + '</div>';
        arr.forEach(function (d) {
          var dr = d.riesgo || 'bajo';
          var dc = riskColorMap[dr] || '#15803d';
          html += '<div class="diana-row" style="border-color:' + dc + ';background:' + dc + '18;">';
          html += '<strong>Diana:</strong> ' + pdfSafeVal(d.diana || d.ocupacion) + ' &nbsp;·&nbsp; ';
          html += '<strong>Prob. Fallo:</strong> ' + pdfSafeVal(d.prob_fallo) + ' &nbsp;·&nbsp; ';
          html += '<strong>Impacto:</strong> ' + pdfSafeVal(d.impacto) + ' &nbsp;·&nbsp; ';
          if (d.conseq || d.consecuencia) html += '<strong>Consecuencia:</strong> ' + pdfSafeVal(d.conseq || d.consecuencia) + ' &nbsp;·&nbsp; ';
          if (d.probComb) html += '<strong>Prob. comb.:</strong> ' + pdfSafeVal(d.probComb) + ' &nbsp;·&nbsp; ';
          html += '<strong>Riesgo:</strong> <span style="font-weight:900;color:' + dc + ';">' + (riskLabelMap[dr] || dr.toUpperCase()) + '</span>';
          html += '</div>';
        });
      });

      // Rinntech — check both top-level and ev.answers
      if (ev.H || ev.Di || ev.Dd || _pdfAns.H || _pdfAns.Di || _pdfAns.Dd) {
        html += '<div class="section-title">Biometría Rinntech</div>';
        html += '<div class="grid">';
        ['H','C','Di','Hd','Dd','tActual','topologia'].forEach(function (k) {
          var _rv = (ev[k] !== undefined && ev[k] !== null && ev[k] !== '') ? ev[k] : (_pdfAns[k] || null);
          if (_rv) html += '<div class="item"><span class="item-label">' + k + '</span><span class="item-val">' + pdfSafeVal(_rv) + '</span></div>';
        });
        if (ev.bioMargin !== null && ev.bioMargin !== undefined) {
          var _bm2 = typeof ev.bioMargin === 'number' ? ev.bioMargin.toFixed(1) + '%' : pdfSafeVal(ev.bioMargin);
          html += '<div class="item"><span class="item-label">Margen Rinntech</span><span class="item-val" style="color:' + (ev.bioCritical ? '#b91c1c' : '#15803d') + ';">' + _bm2 + '</span></div>';
        }
        if (ev.tReq) html += '<div class="item"><span class="item-label">t_req (mm)</span><span class="item-val">' + pdfSafeVal(ev.tReq) + '</span></div>';
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

    var ans   = ev.answers || {};
    var risk  = getEffRisk(ev);
    var color = getRiskColor(risk);
    var label = getRiskLabel(risk);

    // Helper: get value from ev or ev.answers
    function gv(id) {
      if (ev[id] !== undefined && ev[id] !== null && ev[id] !== '') return ev[id];
      if (ans[id] !== undefined && ans[id] !== null && ans[id] !== '') return ans[id];
      return null;
    }
    function row(lbl, val) {
      if (val === null || val === undefined || val === '') return '';
      var display = Array.isArray(val) ? val.join(', ') : String(val);
      return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f5f0e8;">' +
        '<span style="flex:0 0 44%;font-size:11px;font-weight:700;color:#7a746e;padding-right:8px;">' + lbl + '</span>' +
        '<span style="flex:1;font-size:12px;font-weight:600;color:#1a1a1a;word-break:break-word;">' + display + '</span>' +
      '</div>';
    }
    function section(title, content, icon) {
      if (!content) return '';
      return '<div style="margin-bottom:16px;border:1.5px solid #e8e4dd;border-radius:12px;overflow:hidden;">' +
        '<div style="background:#f9f7f3;padding:9px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#5a5550;display:flex;align-items:center;gap:6px;">' +
          (icon || '') + ' ' + title +
        '</div>' +
        '<div style="padding:6px 14px 4px;">' + content + '</div>' +
      '</div>';
    }

    // Set modal title
    var titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = (gv('arbolId') || key) + (gv('especie') ? ' · ' + gv('especie') : '');

    var html = '';

    // ═══ 1. RISK BANNER ═══
    html += '<div style="background:' + color + ';color:#fff;padding:18px 18px 14px;text-align:center;">';
    html += '<div style="font-size:26px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">' + label + '</div>';
    html += '<div style="font-size:11px;opacity:.85;margin-top:2px;font-weight:600;">Nivel de Riesgo ISA TRAQ</div>';
    if (ev.riskSource === 'manual') {
      html += '<div style="margin-top:6px;font-size:10px;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:20px;display:inline-block;">📋 Asignado manualmente</div>';
    }
    if (ev.riskOverride && ev.riskOverride.active) {
      html += '<div style="margin-top:6px;font-size:10px;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:20px;display:inline-block;">⚡ Override activo</div>';
    }
    html += '</div>';

    html += '<div style="padding:14px 14px 20px;">';

    // ═══ 2. IDENTIFICATION ═══
    var idContent = '';
    idContent += row('ID Árbol', gv('arbolId'));
    idContent += row('Especie', gv('especie'));
    idContent += row('Cliente', gv('cliente'));
    idContent += row('Evaluador', gv('evaluador'));
    var ts = ev.timestamp || ev.ts || ans.timestamp || ans.ts;
    if (ts) idContent += row('Fecha de evaluación', fmtDate(ts));
    if (ev.evaluationMethod === 'manual' || ev.riskSource === 'manual') {
      idContent += row('Método', '📋 Riesgo seleccionado manualmente');
    } else if (ev.isaLevel) {
      idContent += row('Método', '📊 Formulario ISA TRAQ completo');
    }
    html += section('Identificación', idContent, '🆔');

    // ═══ 3. ISA COMPUTED RESULTS ═══
    var isaContent = '';
    if (ev.isaLevel)    isaContent += row('Nivel ISA global', '<span style="font-weight:900;color:' + color + ';text-transform:uppercase;">' + label + '</span>');
    if (ev.isaImpacto)  isaContent += row('Probabilidad combinada', ev.isaImpacto);
    if (ev.bioMargin !== null && ev.bioMargin !== undefined) {
      var marginOk = typeof ev.bioMargin === 'number' && ev.bioMargin >= 100;
      isaContent += row('Margen estructural Rinntech',
        (typeof ev.bioMargin === 'number' ? ev.bioMargin.toFixed(1) + '%' : ev.bioMargin) +
        (marginOk ? ' ✅ Adecuado' : ' ⚠️ Crítico'));
    }
    if (ev.tReq !== null && ev.tReq !== undefined) isaContent += row('Pared mínima requerida (t_req)', safeVal(ev.tReq) + ' mm');
    if (isaContent) html += section('Resultados ISA TRAQ', isaContent, '📊');

    // ═══ 4. PHOTOS ═══
    var photosRaw = ev.photoUrls || ev.photos || ans.photoUrls || ans.photos || [];
    if (typeof window.FB !== 'undefined' && window.FB.getPhotoUrls) photosRaw = window.FB.getPhotoUrls(ev);
    var photos = Array.isArray(photosRaw) ? photosRaw.filter(function(u){ return u && typeof u === 'string'; }) : [];
    if (photos.length > 0) {
      var photoHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;padding:6px 0 4px;">';
      photos.forEach(function(url, i) {
        photoHtml +=
          '<div style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;background:#eee;" onclick="openPhotoModal(\'' + key + '\',' + i + ')">' +
            '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" loading="lazy" ' +
              'onerror="this.closest(\'div\').style.display=\'none\'">' +
            '<button onclick="event.stopPropagation();deletePhoto(\'' + key + '\',' + i + ')" ' +
              'style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;">✕</button>' +
          '</div>';
      });
      photoHtml += '</div>';
      photoHtml +=
        '<div style="display:flex;gap:6px;padding:6px 0 4px;">' +
          '<button onclick="triggerPhotoInput(\'' + key + '\',\'camera\')" ' +
            'style="flex:1;padding:8px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;font-size:11px;font-weight:700;color:#15803d;cursor:pointer;">📷 Cámara</button>' +
          '<button onclick="triggerPhotoInput(\'' + key + '\',\'gallery\')" ' +
            'style="flex:1;padding:8px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;font-size:11px;font-weight:700;color:#1d4ed8;cursor:pointer;">🖼️ Galería</button>' +
        '</div>';
      html += section('Fotos (' + photos.length + ')', photoHtml, '📷');
    } else {
      var noPhotoHtml =
        '<div style="display:flex;gap:6px;padding:4px 0;">' +
          '<button onclick="triggerPhotoInput(\'' + key + '\',\'camera\')" ' +
            'style="flex:1;padding:9px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;font-size:11px;font-weight:700;color:#15803d;cursor:pointer;">📷 Añadir foto</button>' +
          '<button onclick="triggerPhotoInput(\'' + key + '\',\'gallery\')" ' +
            'style="flex:1;padding:9px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;font-size:11px;font-weight:700;color:#1d4ed8;cursor:pointer;">🖼️ Galería</button>' +
        '</div>';
      html += section('Fotos (0)', noPhotoHtml, '📷');
    }

    // ═══ 5. ALL FORM ANSWERS — Grouped by ISA TRAQ Phase ═══
    var qs = window.QS || [];
    var phases = window.PHASES || [];
    var SKIP_IDS = ['arbolId','especie','cliente','evaluador'];

    // Group questions by phase index
    var phaseGroups = {};
    qs.forEach(function(q) {
      if (q.type === 'risk_target_group') return; // shown separately in sections 6+
      if (SKIP_IDS.indexOf(q.id) !== -1) return; // already in identification section
      var ph = (q.ph !== undefined && q.ph !== null) ? q.ph : 99;
      if (!phaseGroups[ph]) phaseGroups[ph] = [];
      phaseGroups[ph].push(q);
    });

    // Render one section per phase — always show ALL fields (empty = "—")
    Object.keys(phaseGroups).sort(function(a,b){ return parseInt(a) - parseInt(b); }).forEach(function(ph) {
      var pIdx = parseInt(ph);
      var phaseInfo = phases[pIdx] || { label: 'Fase ' + (pIdx + 1), icon: '📋', desc: '' };
      var phTitle = 'Fase ' + (pIdx + 1) + ': ' + phaseInfo.label;
      var phContent = '';

      phaseGroups[ph].forEach(function(q) {
        var val = gv(q.id);

        if (q.type === 'group' && q.fields) {
          // Group header
          var grp = (val && typeof val === 'object' && !Array.isArray(val)) ? val : {};
          phContent +=
            '<div style="padding:6px 0 3px;margin:6px 0 2px;border-bottom:1px dashed #e8e4dd;">' +
              '<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#a09890;">' +
                q.label +
              '</span>' +
            '</div>';
          q.fields.forEach(function(f) {
            var fv = grp[f.id];
            var dv = (fv !== undefined && fv !== null && fv !== '') ? fv : '—';
            phContent +=
              '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #f5f0e8;">' +
                '<span style="flex:0 0 44%;font-size:11px;font-weight:700;color:#7a746e;padding-right:8px;">' + f.label + '</span>' +
                '<span style="flex:1;font-size:12px;font-weight:600;color:' + (dv === '—' ? '#c0bbb5' : '#1a1a1a') + ';word-break:break-word;">' + dv + '</span>' +
              '</div>';
          });
          return;
        }

        // Compute display value — always show something
        var displayVal;
        if (val === null || val === undefined || val === '') {
          displayVal = '—';
        } else if (Array.isArray(val)) {
          displayVal = val.length > 0 ? val.join(', ') : '—';
        } else {
          displayVal = String(val);
        }
        phContent +=
          '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f5f0e8;">' +
            '<span style="flex:0 0 44%;font-size:11px;font-weight:700;color:#7a746e;padding-right:8px;">' + q.label + '</span>' +
            '<span style="flex:1;font-size:12px;font-weight:600;color:' + (displayVal === '—' ? '#c0bbb5' : '#1a1a1a') + ';word-break:break-word;">' + displayVal + '</span>' +
          '</div>';
      });

      if (phContent) html += section(phTitle, phContent, phaseInfo.icon);
    });

    // ═══ 6. DIANA GROUPS — full detail ═══
    var dianaGroups = [
      { key: 'copa_dianas',   label: 'Dianas Copa',   icon: '🌿' },
      { key: 'tronco_dianas', label: 'Dianas Tronco', icon: '🪵' },
      { key: 'raices_dianas', label: 'Dianas Raíces', icon: '🌱' }
    ];
    dianaGroups.forEach(function(dg) {
      var arr = ev[dg.key] || ans[dg.key];
      if (!arr || !arr.length) return;
      var dContent = '';
      arr.forEach(function(d, idx) {
        var dr  = d.riesgo || 'bajo';
        var dc  = getRiskColor(dr);
        dContent +=
          '<div style="border:1.5px solid ' + dc + ';border-radius:9px;background:' + dc + '0f;padding:10px 12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
              '<span style="font-size:12px;font-weight:800;color:#1a1a1a;">' + dg.icon + ' ' + safeVal(d.diana || d.ocupacion || ('Diana ' + (idx+1))) + '</span>' +
              '<span style="font-size:10px;font-weight:800;text-transform:uppercase;color:#fff;background:' + dc + ';padding:2px 10px;border-radius:20px;">' + getRiskLabel(dr) + '</span>' +
            '</div>' +
            (d.prob_fallo   ? '<div style="font-size:11px;color:#374151;margin-bottom:2px;"><strong>Prob. fallo:</strong> ' + d.prob_fallo   + '</div>' : '') +
            (d.impacto      ? '<div style="font-size:11px;color:#374151;margin-bottom:2px;"><strong>Impacto:</strong> '      + d.impacto      + '</div>' : '') +
            (d.conseq || d.consecuencia ? '<div style="font-size:11px;color:#374151;margin-bottom:2px;"><strong>Consecuencia:</strong> ' + safeVal(d.conseq || d.consecuencia) + '</div>' : '') +
            (d.probComb     ? '<div style="font-size:11px;color:#374151;"><strong>Prob. combinada:</strong> '  + d.probComb     + '</div>' : '') +
          '</div>';
      });
      html += section(dg.label + ' (' + arr.length + ')', dContent, dg.icon);
    });

    // ═══ 7. BIOMETRÍA RINNTECH ═══
    var bioContent = '';
    var rinnFields = [
      { k:'H', l:'Altura total (H)' }, { k:'C', l:'Inicio copa (C)' },
      { k:'Di', l:'Diám. sección intacta (Di)' }, { k:'Hd', l:'Altura defecto (Hd)' },
      { k:'Dd', l:'Diám. exterior defecto (Dd)' }, { k:'tActual', l:'Pared residual (t_actual)' },
      { k:'topologia', l:'Topología' }
    ];
    rinnFields.forEach(function(f) {
      var v = gv(f.k);
      if (v !== null) bioContent += row(f.l, v);
    });
    if (ev.tReq !== null && ev.tReq !== undefined) bioContent += row('Pared mínima requerida (t_req)', safeVal(ev.tReq) + ' mm');
    if (ev.bioMargin !== null && ev.bioMargin !== undefined) {
      var marginOk = typeof ev.bioMargin === 'number' && ev.bioMargin >= 100;
      bioContent += row('Margen estructural (%)', (typeof ev.bioMargin === 'number' ? ev.bioMargin.toFixed(1) + '%' : ev.bioMargin) + (marginOk ? ' ✅' : ' ⚠️'));
    }
    if (bioContent) html += section('Biometría Rinntech', bioContent, '🔬');

    // ═══ 8. GPS ═══
    var _gpsObj = ev.gps || ans.gps || null;
    var gpLat = null, gpLng = null, gpAcc = null, gpSrc = null;
    if (_gpsObj && typeof _gpsObj === 'object' && _gpsObj.lat) {
      gpLat = parseFloat(_gpsObj.lat); gpLng = parseFloat(_gpsObj.lng);
      gpAcc = _gpsObj.acc; gpSrc = _gpsObj.source;
    } else if (typeof _gpsObj === 'string' && _gpsObj.indexOf(',') !== -1) {
      var _gp = _gpsObj.split(','); gpLat = parseFloat(_gp[0]); gpLng = parseFloat(_gp[1]);
    } else if (ev.lat && ev.lng) {
      gpLat = parseFloat(ev.lat); gpLng = parseFloat(ev.lng);
    }
    if (!isNaN(gpLat) && !isNaN(gpLng) && gpLat && gpLng) {
      var gpsContent =
        '<a href="https://maps.google.com/?q=' + gpLat + ',' + gpLng + '" target="_blank" ' +
          'style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;text-decoration:none;color:#15803d;font-weight:700;font-size:12px;margin-bottom:6px;">' +
          '📍 ' + gpLat.toFixed(6) + ', ' + gpLng.toFixed(6) +
          (gpAcc ? ' <span style="font-size:10px;color:#6b7280;font-weight:400;">±' + Math.round(gpAcc) + 'm</span>' : '') +
          (gpSrc === 'ip' ? ' <span style="font-size:9px;color:#f59e0b;">(aprox. por IP)</span>' : '') +
          '<span style="margin-left:auto;font-size:11px;">Ver en Maps →</span>' +
        '</a>';
      html += section('Ubicación GPS', gpsContent, '📍');
    }

    // ═══ 9. WEATHER DATA ═══
    var wx = ev.weatherData || ans.weatherData;
    if (wx && typeof wx === 'object') {
      var wxContent = '';
      if (wx.temp !== undefined)      wxContent += row('Temperatura', wx.temp + ' °C');
      if (wx.humidity !== undefined)  wxContent += row('Humedad', wx.humidity + ' %');
      if (wx.windSpeed !== undefined) wxContent += row('Viento', wx.windSpeed + ' m/s');
      if (wx.windDir !== undefined)   wxContent += row('Dirección viento', wx.windDir);
      if (wx.description)             wxContent += row('Condición', wx.description);
      if (wxContent) html += section('Datos Climáticos al Evaluar', wxContent, '🌤️');
    }

    // ═══ 10. NOTES ═══
    var noteContent =
      '<textarea id="detail-notes-' + key + '" ' +
        'style="width:100%;min-height:80px;padding:10px 12px;border:1.5px solid #e8e4dd;border-radius:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;line-height:1.5;box-sizing:border-box;" ' +
        'placeholder="Añade notas, observaciones del campo...">' +
        safeVal(ev.notes === '—' ? '' : (ev.notes || '')) +
      '</textarea>' +
      '<button onclick="saveTreeNotes(\'' + key + '\')" ' +
        'style="margin-top:6px;padding:9px 20px;background:#0f3320;color:#fff;border:none;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer;width:100%;">💾 Guardar notas</button>';
    html += section('Notas del Técnico', noteContent, '📝');

    // ═══ 11. RISK OVERRIDE ═══
    var ovActive = ev.riskOverride && ev.riskOverride.active;
    var ovLevel  = (ev.riskOverride && ev.riskOverride.level) ? ev.riskOverride.level : risk;
    var ovReason = (ev.riskOverride && ev.riskOverride.reason) ? ev.riskOverride.reason : '';
    var ovContent =
      '<div class="risk-override-box">' +
        '<div class="override-row">' +
          '<span class="override-label">Activar override manual de riesgo</span>' +
          '<label class="toggle-switch"><input type="checkbox" id="ov-toggle-' + key + '" ' + (ovActive ? 'checked' : '') + ' onchange="toggleRiskOverride(\'' + key + '\',this.checked)"><span class="toggle-slider"></span></label>' +
        '</div>' +
        '<div id="ov-fields-' + key + '" style="display:' + (ovActive ? 'flex' : 'none') + ';flex-direction:column;gap:8px;">' +
          '<select id="ov-level-' + key + '" class="override-select">' +
          ['bajo','moderado','alto','extremo'].map(function(lvl) {
            return '<option value="' + lvl + '"' + (ovLevel === lvl ? ' selected' : '') + '>' + getRiskLabel(lvl) + '</option>';
          }).join('') +
          '</select>' +
          '<textarea id="ov-reason-' + key + '" class="override-note" placeholder="Motivo del override...">' + ovReason + '</textarea>' +
          '<button onclick="saveRiskOverride(\'' + key + '\')" class="override-save-btn">💾 Guardar Override</button>' +
        '</div>' +
      '</div>';
    html += section('Override de Riesgo', ovContent, '⚡');

    // ═══ 12. ACTIONS ═══
    html +=
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">' +
        '<button onclick="dbExportTreePDF(\'' + key + '\')" style="width:100%;padding:12px;background:#1d4ed8;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">📄 Descargar PDF completo</button>' +
        '<button onclick="closeModal();window.masNewISAFromKey&&window.masNewISAFromKey(\'' + key + '\')" style="width:100%;padding:12px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">📊 Nueva evaluación ISA TRAQ</button>' +
        '<button onclick="if(confirm(\'¿Eliminar esta evaluación?\'))deleteEval(\'' + key + '\')" style="width:100%;padding:12px;background:#fee2e2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">🗑 Eliminar evaluación</button>' +
      '</div>';

    html += '</div>'; // main padding wrapper

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



  // ═══════════════════════════════════════════════════════
  // ADMIN SECTION — Administración de Clientes
  // ═══════════════════════════════════════════════════════

  var _adminMapInstance    = null;
  var _adminCurrentClient  = null;
  var _adminCurrentTab     = 'resumen';
  var _adminChatUnsub      = null;
  var _adminPortalCfgCache = null;
  var _adminAllChatsUnsub  = null;
  var _adminAllChatsData   = {};   // { clientKey: {messages, unreadCount, lastMsg, clientName} }
  var _adminTotalUnread    = 0;
  var _adminSubView        = 'clientes'; // 'clientes' | 'mensajes'

  function _fsKeyAdmin(name) {
    if (typeof window._fsKey === 'function') return window._fsKey(name);
    return (name || '').toLowerCase().replace(/[.#$[\]/\s]/g, '_');
  }

  function _escAdmin(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Reverse-lookup: clientKey → client name ── */
  function _adminNameFromKey(clientKey) {
    var db2 = window._dbAll || {};
    var found = null;
    Object.keys(db2).forEach(function(key) {
      if (found) return;
      var ev   = db2[key];
      var name = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || (ev.answers && ev.answers.cliente) || '')).trim();
      if (name && _fsKeyAdmin(name) === clientKey) found = name;
    });
    return found;
  }

  /* ── Start listening to ALL client chats ── */
  function _startAdminChatListener() {
    if (_adminAllChatsUnsub) return;
    if (typeof window._fbOnAllChats !== 'function') return;
    _adminAllChatsUnsub = window._fbOnAllChats(function(snap) {
      var all = snap && snap.val ? snap.val() : null;
      _adminAllChatsData = {};
      _adminTotalUnread  = 0;
      if (all) {
        Object.keys(all).forEach(function(clientKey) {
          var msgs   = (all[clientKey] && all[clientKey].messages) || {};
          var unread = 0;
          var lastMsg = null;
          Object.keys(msgs).forEach(function(mk) {
            var m = msgs[mk];
            if (m.from === 'cliente' && !m.read) unread++;
            if (!lastMsg || (m.ts || 0) > (lastMsg.ts || 0)) lastMsg = Object.assign({}, m, {_key: mk});
          });
          var clientName = _adminNameFromKey(clientKey) || clientKey;
          _adminAllChatsData[clientKey] = { messages: msgs, unreadCount: unread, lastMsg: lastMsg, clientName: clientName };
          _adminTotalUnread += unread;
        });
      }
      _updateAdminNavBadge();
      _updateAdminUnreadBadge();
      _updateDetailChatTabBadge();
      if (_adminSubView === 'mensajes') {
        var cont = document.getElementById('db-admin-list');
        if (cont) _renderAdminMessages(cont);
      }
    });
  }

  function _stopAdminChatListener() {
    if (_adminAllChatsUnsub) { try { _adminAllChatsUnsub(); } catch(e) {} _adminAllChatsUnsub = null; }
  }

  function _updateAdminNavBadge() {
    var dot = document.getElementById('admin-nav-dot');
    if (dot) dot.style.display = _adminTotalUnread > 0 ? 'block' : 'none';
  }

  function _updateAdminUnreadBadge() {
    var badge = document.getElementById('admin-unread-badge');
    var btn   = document.getElementById('admin-chat-inbox-btn');
    if (badge) { badge.style.display = _adminTotalUnread > 0 ? 'inline-block' : 'none'; badge.textContent = String(_adminTotalUnread); }
    if (btn) { btn.style.background = _adminTotalUnread > 0 ? '#fee2e2' : '#f3f4f6'; btn.style.borderColor = _adminTotalUnread > 0 ? '#fecaca' : '#e5e7eb'; btn.style.color = _adminTotalUnread > 0 ? '#b91c1c' : '#6b7280'; }
  }

  function _updateDetailChatTabBadge() {
    if (!_adminCurrentClient) return;
    var clientKey  = _fsKeyAdmin(_adminCurrentClient);
    var data       = _adminAllChatsData[clientKey];
    var unread     = data ? data.unreadCount : 0;
    var chatBtn    = document.getElementById('db-admtab-chat');
    if (!chatBtn) return;
    if (unread > 0) {
      chatBtn.innerHTML = '💬 Chat <span style="background:#b91c1c;color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:10px;margin-left:2px">' + unread + '</span>';
      if (_adminCurrentTab !== 'chat') { chatBtn.style.background = '#fee2e2'; chatBtn.style.color = '#b91c1c'; chatBtn.style.border = '1.5px solid #fecaca'; }
    } else {
      chatBtn.innerHTML = '💬 Chat';
    }
  }

  /* ── Switch between Clientes / Mensajes sub-views ── */
  window.dbAdminSubView = function(view) {
    _adminSubView = view;
    var pillC  = document.getElementById('admin-pill-clientes');
    var pillM  = document.getElementById('admin-pill-mensajes');
    var search = document.getElementById('admin-client-search');
    var ACT = 'padding:6px 16px;background:#0f3320;color:#fff;border:none;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif';
    var OFF = 'padding:6px 16px;background:#f3f4f6;color:#6b7280;border:none;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif';
    if (pillC) pillC.style.cssText = view === 'clientes' ? ACT : OFF;
    if (pillM) pillM.style.cssText = view === 'mensajes' ? ACT : OFF;
    if (search) search.style.display = view === 'clientes' ? '' : 'none';
    var cont = document.getElementById('db-admin-list');
    if (!cont) return;
    if (view === 'clientes') window.dbRenderAdminClients();
    else _renderAdminMessages(cont);
  };

  /* ── Messages inbox view ── */
  function _renderAdminMessages(container) {
    var keys = Object.keys(_adminAllChatsData);
    keys.sort(function(a, b) {
      var da = _adminAllChatsData[a], db3 = _adminAllChatsData[b];
      if (da.unreadCount > 0 && db3.unreadCount === 0) return -1;
      if (da.unreadCount === 0 && db3.unreadCount > 0) return  1;
      return (db3.lastMsg ? db3.lastMsg.ts || 0 : 0) - (da.lastMsg ? da.lastMsg.ts || 0 : 0);
    });

    if (keys.length === 0) {
      container.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 20px;gap:14px">' +
          '<div style="font-size:52px">💬</div>' +
          '<div style="font-size:16px;font-weight:700;color:#374151">Sin conversaciones</div>' +
          '<div style="font-size:13px;color:#9ca3af;text-align:center">Cuando un cliente te escriba, aparecerá aquí</div>' +
        '</div>';
      return;
    }

    var unreadKeys = keys.filter(function(k) { return _adminAllChatsData[k].unreadCount > 0; });
    var readKeys   = keys.filter(function(k) { return _adminAllChatsData[k].unreadCount === 0; });
    var html = '';

    if (unreadKeys.length > 0) {
      html += '<div style="padding:12px 16px 4px;font-size:10px;font-weight:900;color:#b91c1c;text-transform:uppercase;letter-spacing:.12em;display:flex;align-items:center;gap:6px">';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:#b91c1c;display:inline-block;animation:pulse 1.5s infinite"></span>';
      html += 'Sin leer · ' + unreadKeys.length + '</div>';
      unreadKeys.forEach(function(k) { html += _adminChatListItem(k, true); });
    }
    if (readKeys.length > 0) {
      html += '<div style="padding:12px 16px 4px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em">Conversaciones anteriores</div>';
      readKeys.forEach(function(k) { html += _adminChatListItem(k, false); });
    }
    container.innerHTML = html;
  }

  function _adminChatListItem(clientKey, hasUnread) {
    var data       = _adminAllChatsData[clientKey];
    var clientName = data.clientName || clientKey;
    var unread     = data.unreadCount || 0;
    var lastMsg    = data.lastMsg;
    var lastText   = lastMsg ? (lastMsg.text || lastMsg.mensaje || '') : '';
    var lastTs     = lastMsg ? (lastMsg.ts || 0) : 0;
    var fromClient = lastMsg && lastMsg.from === 'cliente';
    var enc        = encodeURIComponent(clientName);
    var letter     = clientName.charAt(0).toUpperCase();

    return (
      '<div onclick="dbOpenAdminClient(\'' + enc + '\',\'chat\')" ' +
        'style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:' + (hasUnread ? '#fff5f5' : '#fff') + ';border-bottom:1.5px solid ' + (hasUnread ? '#ffe4e4' : '#f3f4f6') + ';cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s">' +
        '<div style="position:relative;flex-shrink:0">' +
          '<div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#0f3320,#22c55e);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;font-family:Georgia,serif">' + letter + '</div>' +
          (hasUnread ? '<div style="position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;background:#b91c1c;border:2.5px solid #fff5f5"></div>' : '') +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:' + (hasUnread ? '800' : '600') + ';font-size:14px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escAdmin(clientName) + '</div>' +
          '<div style="font-size:12px;color:' + (hasUnread ? '#374151' : '#9ca3af') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:' + (hasUnread ? '600' : '400') + ';margin-top:2px">' +
            (fromClient ? '' : '<span style="color:#9ca3af">Tú: </span>') + _escAdmin(lastText.substring(0, 55) || '—') +
          '</div>' +
        '</div>' +
        '<div style="flex-shrink:0;text-align:right">' +
          '<div style="font-size:10px;color:' + (hasUnread ? '#b91c1c' : '#9ca3af') + ';margin-bottom:4px">' + fmtDate(lastTs) + '</div>' +
          (unread > 0 ? '<div style="background:#b91c1c;color:#fff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:20px;text-align:center">' + unread + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  /* ── Show/hide admin tab bar based on role (tab bar removed — no-op kept for compatibility) ── */
  window._dbCheckAdminTabBar = function () {};

  /* ── Switch between Records and Admin sections ── */
  window.dbSwitchSection = function (section) {
    var lv1 = document.getElementById('db-level-1');
    var lv2 = document.getElementById('db-level-2');
    var lv3 = document.getElementById('db-level-3');
    var admList   = document.getElementById('db-admin-list-wrap');
    var admDetail = document.getElementById('db-admin-detail-wrap');
    var tabR = document.getElementById('db-tab-records');
    var tabA = document.getElementById('db-tab-admin');
    var ACT = '2.5px solid #0f3320', OFF = '2.5px solid transparent';
    if (tabR) { tabR.style.borderBottom = section === 'records' ? ACT : OFF; tabR.style.color = section === 'records' ? '#0f3320' : '#9ca3af'; tabR.style.fontWeight = section === 'records' ? '700' : '600'; }
    if (tabA) { tabA.style.borderBottom = section === 'admin'   ? ACT : OFF; tabA.style.color = section === 'admin'   ? '#0f3320' : '#9ca3af'; tabA.style.fontWeight = section === 'admin'   ? '700' : '600'; }
    if (section === 'records') {
      if (lv1) lv1.style.display = 'flex';
      if (lv2) lv2.style.display = 'none';
      if (lv3) lv3.style.display = 'none';
      if (admList)   admList.style.display = 'none';
      if (admDetail) admDetail.style.display = 'none';
    } else {
      if (lv1) lv1.style.display = 'none';
      if (lv2) lv2.style.display = 'none';
      if (lv3) lv3.style.display = 'none';
      if (admList)   admList.style.display = 'flex';
      if (admDetail) admDetail.style.display = 'none';
      _startAdminChatListener();
      _adminSubView = 'clientes';
      window.dbRenderAdminClients();
    }
  };

  /* ── Build tree map for a client ── */
  function _buildClientTreeMap(clientName) {
    var db2 = window._dbAll || {};
    var treeBest = {};
    Object.keys(db2).forEach(function (key) {
      var ev  = db2[key];
      var cli = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || (ev.answers && ev.answers.cliente) || '')).trim();
      if (cli.toLowerCase() !== (clientName || '').toLowerCase()) return;
      var aid = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
      if (!treeBest[aid] || (ev.timestamp || 0) > (treeBest[aid].timestamp || 0)) {
        treeBest[aid] = Object.assign({}, ev, { _arbolId: aid, _key: key });
      }
    });
    return treeBest;
  }

  function _extractGPSAdmin(ev) {
    var g = ev.gps || (ev.answers && ev.answers.gps) || '';
    if (!g && ev.lat && ev.lng) g = ev.lat + ',' + ev.lng;
    if (!g && ev.answers && ev.answers.lat && ev.answers.lng) g = ev.answers.lat + ',' + ev.answers.lng;
    if (g && typeof g === 'object' && g.lat) g = g.lat + ',' + g.lng;
    return (typeof g === 'string' && g.indexOf(',') > 0) ? g : null;
  }

  /* ── Render client admin list (improved visual hierarchy) ── */
  window.dbRenderAdminClients = function () {
    var container = document.getElementById('db-admin-list');
    if (!container) return;
    var searchEl = document.getElementById('admin-client-search');
    var query    = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var db2         = window._dbAll       || {};
    var clientesAll = window._clientesAll || {};

    var clientMap = {};
    Object.keys(db2).forEach(function (key) {
      var ev   = db2[key];
      var name = (typeof window.getClientName === 'function'
        ? window.getClientName(ev)
        : (ev.cliente || (ev.answers && ev.answers.cliente) || '')).trim();
      if (!name || name === '(Sin cliente)') return;
      if (!clientMap[name]) clientMap[name] = { name: name, evals: [], trees: {} };
      clientMap[name].evals.push({ key: key, ev: ev });
      var aid = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
      if (!clientMap[name].trees[aid]) clientMap[name].trees[aid] = [];
      clientMap[name].trees[aid].push({ key: key, ev: ev });
    });
    Object.keys(clientesAll).forEach(function (k) {
      var c    = clientesAll[k];
      var name = (c.nombre || c.name || '').trim();
      if (!name) return;
      if (!clientMap[name]) clientMap[name] = { name: name, evals: [], trees: {} };
      clientMap[name]._clientKey = k;
    });

    var clients = Object.values(clientMap);
    if (query) clients = clients.filter(function (c) { return c.name.toLowerCase().indexOf(query) !== -1; });
    clients.sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });

    if (clients.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px">🌱 No hay clientes registrados</div>';
      return;
    }

    var RISK_BORDER = { bajo: '#22c55e', moderado: '#f59e0b', alto: '#f97316', extremo: '#b91c1c' };
    var html = '';
    clients.forEach(function (c) {
      var treeCount = Object.keys(c.trees).length;
      var evalCount = c.evals.length;
      var enc       = encodeURIComponent(c.name);
      var letter    = c.name.charAt(0).toUpperCase();
      var clientKey = _fsKeyAdmin(c.name);
      var chatData  = _adminAllChatsData[clientKey] || {};
      var chatUnread = chatData.unreadCount || 0;
      var lastMsg    = chatData.lastMsg;

      var riskCounts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
      var riskLevels = [];
      var lastTs = 0;
      Object.values(c.trees).forEach(function (evs) {
        evs.sort(function (a, b) { return (b.ev.timestamp || 0) - (a.ev.timestamp || 0); });
        var r = getEffRisk(evs[0].ev);
        riskCounts[r] = (riskCounts[r] || 0) + 1;
        riskLevels.push(r);
        var t = evs[0].ev.timestamp || 0;
        if (t > lastTs) lastTs = t;
      });
      var worst      = worstRisk(riskLevels) || 'bajo';
      var wColor     = getRiskColor(worst);
      var borderLeft = RISK_BORDER[worst] || '#e5e7eb';
      var isUrgent   = worst === 'extremo' || worst === 'alto';

      var barHtml = '';
      ['bajo','moderado','alto','extremo'].forEach(function(r) {
        if (riskCounts[r] > 0) barHtml += '<div style="flex:' + riskCounts[r] + ';background:' + getRiskColor(r) + ';height:100%"></div>';
      });

      // Card with strong left border indicating risk
      html += '<div style="background:#fff;border:1.5px solid ' + (isUrgent ? wColor + '44' : '#e8e3db') + ';border-left:4px solid ' + borderLeft + ';border-radius:0 14px 14px 0;margin:0 14px 12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07)">';

      // Unread chat banner (only if has unread messages)
      if (chatUnread > 0) {
        html += '<div style="background:#fee2e2;padding:6px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #fecaca">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:#b91c1c;flex-shrink:0"></span>';
        html += '<div style="font-size:11px;font-weight:700;color:#b91c1c;flex:1">' + chatUnread + ' mensaje' + (chatUnread !== 1 ? 's' : '') + ' sin leer</div>';
        if (lastMsg) {
          var preview = (lastMsg.text || lastMsg.mensaje || '').substring(0, 40);
          html += '<div style="font-size:10px;color:#dc2626;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">"' + _escAdmin(preview) + '"</div>';
        }
        html += '</div>';
      }

      // Header row
      html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px">';
      html += '<div style="width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,#0f3320 0%,#22c55e 100%);font-size:22px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:Georgia,serif">' + letter + '</div>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escAdmin(c.name) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">';
      html += '<span style="font-size:11px;color:#6b7280">' + treeCount + ' árbol' + (treeCount !== 1 ? 'es' : '') + '</span>';
      html += '<span style="font-size:10px;color:#d1d5db">·</span>';
      html += '<span style="font-size:11px;color:#6b7280">' + fmtDate(lastTs) + '</span>';
      if (riskCounts.extremo > 0) html += '<span style="padding:2px 8px;background:#fee2e2;color:#b91c1c;border-radius:10px;font-size:10px;font-weight:800">🔴 ' + riskCounts.extremo + ' extremo</span>';
      else if (riskCounts.alto > 0) html += '<span style="padding:2px 8px;background:#ffedd5;color:#c2410c;border-radius:10px;font-size:10px;font-weight:700">🟠 ' + riskCounts.alto + ' alto</span>';
      html += '</div>';
      html += '</div>';
      html += '<span style="padding:3px 10px;background:' + wColor + '22;color:' + wColor + ';border-radius:20px;font-size:10px;font-weight:800;flex-shrink:0;text-transform:uppercase;letter-spacing:.03em">' + getRiskLabel(worst) + '</span>';
      html += '</div>';

      // Risk bar
      if (barHtml) html += '<div style="height:5px;display:flex;width:100%">' + barHtml + '</div>';

      // Action buttons
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:9px 12px;background:#fafaf8;border-top:1px solid #f0ede8">';
      html += '<button onclick="dbOpenAdminClient(\'' + enc + '\',\'resumen\')" style="padding:8px 4px;background:#0f3320;color:#fff;border:none;border-radius:9px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:center;line-height:1.3">📊<br>Resumen</button>';
      html += '<button onclick="dbOpenAdminClient(\'' + enc + '\',\'mapa\')" style="padding:8px 4px;background:#f0f9ff;color:#0284c7;border:1.5px solid #bae6fd;border-radius:9px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:center;line-height:1.3">🗺️<br>Mapa</button>';
      html += '<button onclick="dbOpenAdminClient(\'' + enc + '\',\'portal\')" style="padding:8px 4px;background:#f0fdf4;color:#15803d;border:1.5px solid #86efac;border-radius:9px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:center;line-height:1.3">👁️<br>Portal</button>';
      // Chat button: red if unread
      html += '<button onclick="dbOpenAdminClient(\'' + enc + '\',\'chat\')" style="padding:8px 4px;background:' + (chatUnread > 0 ? '#fee2e2' : '#faf5ff') + ';color:' + (chatUnread > 0 ? '#b91c1c' : '#7c3aed') + ';border:1.5px solid ' + (chatUnread > 0 ? '#fecaca' : '#ddd6fe') + ';border-radius:9px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:center;line-height:1.3;position:relative">💬' + (chatUnread > 0 ? ' <span style="background:#b91c1c;color:#fff;font-size:9px;padding:0 4px;border-radius:8px">' + chatUnread + '</span>' : '') + '<br>Chat</button>';
      html += '</div>';
      html += '</div>';
    });

    container.innerHTML = html;
  };

  /* ── Open admin client detail ── */
  window.dbOpenAdminClient = function (enc, defaultTab) {
    _adminCurrentClient  = decodeURIComponent(enc);
    _adminCurrentTab     = defaultTab || 'resumen';
    _adminPortalCfgCache = null;

    var listWrap   = document.getElementById('db-admin-list-wrap');
    var detailWrap = document.getElementById('db-admin-detail-wrap');
    if (listWrap)   listWrap.style.display   = 'none';
    if (detailWrap) detailWrap.style.display = 'flex';

    var titleEl = document.getElementById('db-admin-detail-title');
    if (titleEl) titleEl.textContent = _adminCurrentClient;

    window.dbAdminTab(_adminCurrentTab);
    setTimeout(_updateDetailChatTabBadge, 100);
  };

  /* ── Back from detail to list ── */
  window.dbAdminBack = function () {
    if (_adminMapInstance) { try { _adminMapInstance.remove(); } catch (e) {} _adminMapInstance = null; }
    if (_adminChatUnsub)   { try { _adminChatUnsub(); }          catch (e) {} _adminChatUnsub = null;   }
    var listWrap   = document.getElementById('db-admin-list-wrap');
    var detailWrap = document.getElementById('db-admin-detail-wrap');
    if (listWrap)   listWrap.style.display   = 'flex';
    if (detailWrap) detailWrap.style.display = 'none';
    // Refresh client list to update badges
    if (_adminSubView === 'clientes') window.dbRenderAdminClients();
    else _renderAdminMessages(document.getElementById('db-admin-list'));
  };

  /* ── Switch sub-tab in detail view ── */
  window.dbAdminTab = function (tab) {
    _adminCurrentTab = tab;
    ['resumen','mapa','portal','chat','cuenta'].forEach(function (t) {
      var btn = document.getElementById('db-admtab-' + t);
      if (!btn) return;
      var active = t === tab;
      btn.style.background = active ? '#0f3320' : '#f3f4f6';
      btn.style.color      = active ? '#fff'     : '#6b7280';
      btn.style.border     = active ? 'none'     : '1px solid #e5e7eb';
      btn.style.fontWeight = active ? '700'      : '600';
      // Reset innerHTML for chat button
      if (t === 'chat' && !active) {
        var clientKey2 = _fsKeyAdmin(_adminCurrentClient || '');
        var chatDt     = _adminAllChatsData[clientKey2] || {};
        var cu         = chatDt.unreadCount || 0;
        if (cu > 0) {
          btn.innerHTML = '💬 Chat <span style="background:#b91c1c;color:#fff;font-size:9px;padding:1px 5px;border-radius:10px;margin-left:2px">' + cu + '</span>';
          btn.style.background = '#fee2e2'; btn.style.color = '#b91c1c'; btn.style.border = '1.5px solid #fecaca';
        } else {
          btn.innerHTML = '💬 Chat';
        }
      }
      if (t === 'chat' && active) btn.innerHTML = '💬 Chat';
    });

    var content = document.getElementById('db-admin-detail-content');
    if (!content) return;
    if (tab !== 'mapa' && _adminMapInstance) { try { _adminMapInstance.remove(); } catch (e) {} _adminMapInstance = null; }
    if (tab !== 'chat' && _adminChatUnsub)   { try { _adminChatUnsub(); }          catch (e) {} _adminChatUnsub = null;   }
    content.style.display       = 'flex';
    content.style.flexDirection = 'column';
    content.style.overflowY     = 'auto';
    content.style.flex          = '1';
    content.style.minHeight     = '0';

    if      (tab === 'resumen') _renderAdminResumen(content);
    else if (tab === 'mapa')    _renderAdminMap(content);
    else if (tab === 'portal')  _renderAdminPortal(content);
    else if (tab === 'chat')    _renderAdminChat(content);
    else if (tab === 'cuenta')  _renderAdminCuenta(content);
  };

  /* ═══ TAB: RESUMEN ═══ */
  function _renderAdminResumen(content) {
    content.style.display = 'block';
    content.innerHTML = '<div style="padding:14px;text-align:center;color:#9ca3af;font-size:13px">⏳ Cargando...</div>';
    var clientName = _adminCurrentClient;
    var treeBest   = _buildClientTreeMap(clientName);
    var trees      = Object.values(treeBest);
    var totalTrees = trees.length;
    var clientKey  = _fsKeyAdmin(clientName);
    var chatDt     = _adminAllChatsData[clientKey] || {};
    var chatUnread = chatDt.unreadCount || 0;

    var riskCounts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
    var gpsCount   = 0;
    var lastTs     = 0;
    trees.forEach(function (ev) {
      var r = getEffRisk(ev);
      riskCounts[r] = (riskCounts[r] || 0) + 1;
      if (_extractGPSAdmin(ev)) gpsCount++;
      var t = ev.timestamp || ev.ts || 0;
      if (t > lastTs) lastTs = t;
    });
    var worst  = worstRisk(trees.map(function (ev) { return getEffRisk(ev); })) || 'bajo';
    var wColor = getRiskColor(worst);

    function _buildResumenHtml(portalCfg) {
      var treesConfig   = (portalCfg && portalCfg.trees) || {};
      var portalVisible = 0;
      trees.forEach(function(ev) {
        var ak = _fsKeyAdmin(ev._arbolId || '');
        if (treesConfig[ak] && treesConfig[ak].visible) portalVisible++;
      });

      var html = '<div style="padding:14px 14px 80px">';

      // Alert banner for urgent risk or unread messages
      if (riskCounts.extremo > 0 || chatUnread > 0) {
        html += '<div style="background:linear-gradient(135deg,#fee2e2,#fff5f5);border:2px solid #fecaca;border-radius:14px;padding:12px 16px;margin-bottom:14px;display:flex;gap:12px;align-items:center">';
        html += '<div style="font-size:28px">' + (riskCounts.extremo > 0 ? '🚨' : '💬') + '</div>';
        html += '<div style="flex:1">';
        if (riskCounts.extremo > 0) html += '<div style="font-size:13px;font-weight:800;color:#b91c1c">' + riskCounts.extremo + ' árbol' + (riskCounts.extremo !== 1 ? 'es' : '') + ' en riesgo EXTREMO</div>';
        if (chatUnread > 0) html += '<div style="font-size:12px;font-weight:700;color:#dc2626;margin-top:2px">' + chatUnread + ' mensaje' + (chatUnread !== 1 ? 's' : '') + ' sin leer en el chat</div>';
        html += '</div>';
        if (chatUnread > 0) html += '<button onclick="dbAdminTab(\'chat\')" style="padding:7px 14px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;flex-shrink:0">Ver chat</button>';
        html += '</div>';
      }

      // Stats cards
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">';
      html += _admStatCard(String(totalTrees), 'Árboles', '#0f3320', '🌳');
      html += _admStatCard(gpsCount + '/' + totalTrees, 'Con GPS', '#0ea5e9', '📍');
      html += _admStatCard(portalVisible + '/' + totalTrees, 'En portal', '#7c3aed', '👁️');
      html += _admStatCard(chatUnread > 0 ? chatUnread + ' sin leer' : 'Sin pendientes', 'Chat', chatUnread > 0 ? '#b91c1c' : '#6b7280', '💬');
      html += '</div>';

      // Risk breakdown
      html += '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:14px">';
      html += '<div style="font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">📊 Distribución de riesgo</div>';
      if (totalTrees === 0) {
        html += '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:8px">Sin evaluaciones</div>';
      } else {
        ['extremo','alto','moderado','bajo'].forEach(function(r) {
          var count = riskCounts[r] || 0;
          if (count === 0) return;
          var pct   = Math.round(count / totalTrees * 100);
          var color = getRiskColor(r);
          html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
          html += '<div style="width:72px;font-size:12px;font-weight:700;color:' + color + '">' + getRiskLabel(r) + '</div>';
          html += '<div style="flex:1;height:10px;background:#f3f4f6;border-radius:5px;overflow:hidden"><div style="height:100%;background:' + color + ';width:' + pct + '%;border-radius:5px"></div></div>';
          html += '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:13px;font-weight:800;color:' + color + ';width:26px;text-align:right">' + count + '</div>';
          html += '</div>';
        });
      }
      html += '</div>';

      // Tree inventory table
      html += '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:14px">';
      html += '<div style="padding:12px 14px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between">';
      html += '<div style="font-size:12px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.05em">🌳 Inventario (' + totalTrees + ')</div>';
      html += '<button onclick="dbOpenClient(\'' + encodeURIComponent(clientName) + '\')" style="padding:5px 12px;background:#f0fdf4;color:#15803d;border:1px solid #86efac;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">Ver en Registros →</button>';
      html += '</div>';
      if (trees.length === 0) {
        html += '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">Sin evaluaciones</div>';
      } else {
        var sortedTrees = trees.slice().sort(function(a,b) { return (RISK_ORDER[getEffRisk(b)]||0) - (RISK_ORDER[getEffRisk(a)]||0); });
        sortedTrees.forEach(function(ev) {
          var aid    = ev._arbolId || ev.arbolId || (ev.answers && ev.answers.arbolId) || '?';
          var esp    = ev.especie  || (ev.answers && ev.answers.especie) || '—';
          var risk   = getEffRisk(ev);
          var rColor = getRiskColor(risk);
          var ts     = ev.timestamp || ev.ts || 0;
          var hasGps = !!_extractGPSAdmin(ev);
          var ak     = _fsKeyAdmin(aid);
          var inPortal = treesConfig[ak] && treesConfig[ak].visible;
          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f9f9f9">';
          html += '<div style="width:10px;height:10px;border-radius:50%;background:' + rColor + ';flex-shrink:0"></div>';
          html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escAdmin(aid) + '</div><div style="font-size:11px;color:#9ca3af;font-style:italic">' + _escAdmin(esp) + '</div></div>';
          html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">';
          html += '<span style="padding:2px 8px;background:' + rColor + '1a;color:' + rColor + ';border-radius:10px;font-size:10px;font-weight:800">' + getRiskLabel(risk) + '</span>';
          html += '<div style="display:flex;gap:5px;font-size:10px"><span style="color:' + (hasGps?'#0ea5e9':'#d1d5db') + '">' + (hasGps?'📍':'—') + '</span><span style="color:' + (inPortal?'#22c55e':'#d1d5db') + '">' + (inPortal?'👁️':'—') + '</span><span style="color:#9ca3af">' + fmtDate(ts) + '</span></div>';
          html += '</div>';
          html += '</div>';
        });
      }
      html += '</div>';

      // Quick action buttons (improved hierarchy)
      html += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Acciones rápidas</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
      html += '<button onclick="dbAdminTab(\'portal\')" style="padding:14px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:left">👁️ Configurar<br><span style="font-size:11px;font-weight:400;opacity:.8">Portal del cliente</span></button>';
      html += '<button onclick="dbAdminTab(\'mapa\')" style="padding:14px;background:#f0f9ff;color:#0284c7;border:1.5px solid #bae6fd;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:left">🗺️ Ver mapa<br><span style="font-size:11px;font-weight:400;opacity:.7">GPS de árboles</span></button>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
      html += '<button onclick="dbAdminTab(\'chat\')" style="padding:14px;background:' + (chatUnread > 0 ? '#fee2e2' : '#faf5ff') + ';color:' + (chatUnread > 0 ? '#b91c1c' : '#7c3aed') + ';border:1.5px solid ' + (chatUnread > 0 ? '#fecaca' : '#ddd6fe') + ';border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:left">💬 Chat' + (chatUnread > 0 ? ' <span style="background:#b91c1c;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px">' + chatUnread + '</span>' : '') + '<br><span style="font-size:11px;font-weight:400;opacity:.7">Mensajes directos</span></button>';
      html += '<button onclick="dbAdminTab(\'cuenta\')" style="padding:14px;background:#f8fafc;color:#475569;border:1.5px solid #e2e8f0;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;text-align:left">👤 Cuenta<br><span style="font-size:11px;font-weight:400;opacity:.7">Acceso al portal</span></button>';
      html += '</div>';

      html += '</div>';
      content.innerHTML = html;
    }

    if (_adminPortalCfgCache !== null) {
      _buildResumenHtml(_adminPortalCfgCache);
    } else if (typeof window._fbGetPortalConfig === 'function') {
      window._fbGetPortalConfig(clientKey, function(snap) {
        _adminPortalCfgCache = (snap && snap.val ? snap.val() : null) || {};
        _buildResumenHtml(_adminPortalCfgCache);
      });
    } else {
      _buildResumenHtml({});
    }
  }

  function _admStatCard(value, label, color, icon) {
    return '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:13px;padding:14px 10px;text-align:center">' +
      '<div style="font-size:22px;margin-bottom:6px">' + icon + '</div>' +
      '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:900;color:' + color + ';line-height:1.2">' + value + '</div>' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;margin-top:4px">' + label + '</div>' +
    '</div>';
  }

  /* ═══ TAB: MAPA ═══ */
  function _renderAdminMap(content) {
    var mapType = window._adminMapType || 'satellite';
    content.style.display = 'flex'; content.style.flexDirection = 'column';
    content.innerHTML =
      '<div style="background:#fff;padding:10px 14px;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-shrink:0">' +
        '<button id="admin-map-sat" onclick="window._adminSwitchMap(\'satellite\')" style="padding:7px 14px;background:' + (mapType==='satellite'?'#0f3320':'#f3f4f6') + ';color:' + (mapType==='satellite'?'#fff':'#6b7280') + ';border:' + (mapType==='satellite'?'none':'1px solid #e5e7eb') + ';border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">🛰️ Satélite</button>' +
        '<button id="admin-map-nor" onclick="window._adminSwitchMap(\'normal\')" style="padding:7px 14px;background:' + (mapType==='normal'?'#0f3320':'#f3f4f6') + ';color:' + (mapType==='normal'?'#fff':'#6b7280') + ';border:' + (mapType==='normal'?'none':'1px solid #e5e7eb') + ';border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">🗺️ Normal</button>' +
        '<span id="admin-map-count" style="font-size:11px;color:#6b7280;margin-left:auto"></span>' +
      '</div>' +
      '<div id="admin-map-el" style="flex:1;min-height:0;position:relative;background:#e8e4dc"></div>';
    setTimeout(function() { _buildAdminMap(); }, 200);
  }

  function _buildAdminMap() {
    var mapEl = document.getElementById('admin-map-el');
    if (!mapEl || !window.L) return;
    if (_adminMapInstance) { try { _adminMapInstance.remove(); } catch(e) {} _adminMapInstance = null; }
    var mapType = window._adminMapType || 'satellite';
    var map = L.map(mapEl, { zoomControl: true, attributionControl: false });
    _adminMapInstance = map;
    var satTile  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 });
    var normTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    if (mapType === 'satellite') satTile.addTo(map);
    else normTile.addTo(map);
    map._adminSatTile = satTile; map._adminNormTile = normTile;
    var RCOLS = { bajo:'#22c55e', moderado:'#f59e0b', alto:'#f97316', extremo:'#b91c1c' };
    var markers = [];
    var treeBest2 = _buildClientTreeMap(_adminCurrentClient);
    var portalTrees = (_adminPortalCfgCache && _adminPortalCfgCache.trees) || {};
    Object.keys(treeBest2).forEach(function(aid) {
      var ev  = treeBest2[aid];
      var gps = _extractGPSAdmin(ev);
      if (!gps) return;
      var parts = gps.split(',');
      var lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng)) return;
      var risk    = getEffRisk(ev);
      var color   = RCOLS[risk] || '#22c55e';
      var especie = ev.especie || (ev.answers && ev.answers.especie) || '?';
      var ak      = _fsKeyAdmin(aid);
      var inPortal = portalTrees[ak] && portalTrees[ak].visible;
      var adminNote = (portalTrees[ak] && portalTrees[ak].adminNote) || '';
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:32px;height:32px;border-radius:50%;background:' + color + ';border:' + (inPortal?'3px solid #fff':'2px dashed rgba(255,255,255,.5)') + ';box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;opacity:' + (inPortal?'1':'0.65') + '">' + (inPortal?'🌳':'🌲') + '</div>',
        iconSize: [32,32], iconAnchor: [16,16]
      });
      var marker = L.marker([lat,lng],{icon:icon});
      marker.bindPopup('<div style="font-family:\'IBM Plex Sans\',sans-serif;min-width:160px"><div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:3px">' + _escAdmin(aid) + '</div><div style="font-size:12px;color:#6b7280;font-style:italic;margin-bottom:6px">' + _escAdmin(especie) + '</div><span style="padding:2px 10px;background:' + color + ';color:#fff;border-radius:20px;font-size:11px;font-weight:700">' + getRiskLabel(risk) + '</span>' + (inPortal?'<div style="margin-top:6px;font-size:11px;color:#0f3320;font-weight:600">✅ En portal</div>':'<div style="margin-top:6px;font-size:11px;color:#9ca3af">🚫 Oculto en portal</div>') + (adminNote?'<div style="margin-top:4px;font-size:11px;color:#6b7280;font-style:italic">' + _escAdmin(adminNote) + '</div>':'') + '</div>');
      marker.addTo(map);
      markers.push(marker);
    });
    var countEl = document.getElementById('admin-map-count');
    if (countEl) countEl.textContent = markers.length + ' árbol' + (markers.length!==1?'es':'') + ' con GPS';
    if (markers.length > 0) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
    else map.setView([-34.0,-70.6],10);
  }

  window._adminSwitchMap = function(type) {
    window._adminMapType = type;
    var sat = document.getElementById('admin-map-sat'), nor = document.getElementById('admin-map-nor');
    if (sat) { sat.style.background = type==='satellite'?'#0f3320':'#f3f4f6'; sat.style.color = type==='satellite'?'#fff':'#6b7280'; sat.style.border = type==='satellite'?'none':'1px solid #e5e7eb'; }
    if (nor) { nor.style.background = type==='normal'?'#0f3320':'#f3f4f6'; nor.style.color = type==='normal'?'#fff':'#6b7280'; nor.style.border = type==='normal'?'none':'1px solid #e5e7eb'; }
    if (!_adminMapInstance) return;
    if (type==='satellite') { if (_adminMapInstance._adminNormTile) _adminMapInstance._adminNormTile.remove(); if (_adminMapInstance._adminSatTile) _adminMapInstance._adminSatTile.addTo(_adminMapInstance); }
    else { if (_adminMapInstance._adminSatTile) _adminMapInstance._adminSatTile.remove(); if (_adminMapInstance._adminNormTile) _adminMapInstance._adminNormTile.addTo(_adminMapInstance); }
  };

  /* ═══ TAB: PORTAL ═══ */
  function _renderAdminPortal(content) {
    content.style.display = 'flex'; content.style.flexDirection = 'column';
    var clientName = _adminCurrentClient;

    content.innerHTML =
      '<div style="background:#fff;padding:8px 14px;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;flex-shrink:0">' +
        '<button id="ptab-preview" onclick="window._adminPortalSubTab(\'preview\')" style="flex:1;padding:9px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">👁️ Vista previa</button>' +
        '<button id="ptab-edit" onclick="window._adminPortalSubTab(\'edit\')" style="flex:1;padding:9px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">✏️ Editar portal</button>' +
      '</div>' +
      '<div id="portal-subtab-content" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0;background:#f5f3ef"></div>';

    window._adminPortalSubTab = function(tab) {
      var pBtn = document.getElementById('ptab-preview');
      var eBtn = document.getElementById('ptab-edit');
      var pane = document.getElementById('portal-subtab-content');
      if (!pane) return;

      if (pBtn) { pBtn.style.background = tab==='preview'?'#0f3320':'#f3f4f6'; pBtn.style.color = tab==='preview'?'#fff':'#6b7280'; pBtn.style.border = tab==='preview'?'none':'1px solid #e5e7eb'; pBtn.style.fontWeight = tab==='preview'?'700':'600'; }
      if (eBtn) { eBtn.style.background = tab==='edit'?'#0f3320':'#f3f4f6'; eBtn.style.color = tab==='edit'?'#fff':'#6b7280'; eBtn.style.border = tab==='edit'?'none':'1px solid #e5e7eb'; eBtn.style.fontWeight = tab==='edit'?'700':'600'; }

      if (tab === 'edit') {
        pane.style.background = '#fff';
        pane.innerHTML = '<div style="padding:16px 14px 90px">' +
          '<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;font-weight:600">✏️ Los cambios se guardan árbol por árbol. El cliente ve los cambios al instante.</div>';
        if (typeof window._pcmLoadForClient === 'function') {
          window._pcmLoadForClient(clientName, 'portal-subtab-content');
        } else {
          pane.innerHTML += '<div style="text-align:center;padding:20px"><button onclick="window.openPortalConfigEditor(\'' + _escAdmin(clientName) + '\')" style="padding:12px 24px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">⚙️ Abrir editor</button></div>';
          pane.innerHTML += '</div>';
        }
        return;
      }

      // PREVIEW mode — load portal config and render
      pane.style.background = '#f5f3ef';
      pane.innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:12px">⏳ Cargando vista previa…</div>';

      var loadPreview = function(portalCfg) {
        var db = window._dbAll || window._fbRawAll || {};
        var treesConfig = (portalCfg && portalCfg.trees) || {};
        var welcomeMsg = (portalCfg && portalCfg.welcomeMessage) || '';

        // Gather trees for this client
        var clientTrees = {};
        Object.keys(db).forEach(function(key) {
          var ev = db[key];
          var evClient = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
          if (evClient.toLowerCase() === clientName.toLowerCase()) {
            var aid = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
            if (!clientTrees[aid] || (ev.timestamp||0) > (clientTrees[aid].timestamp||0)) {
              clientTrees[aid] = Object.assign({}, ev, {_arbolId: aid});
            }
          }
        });

        var visibleTrees = Object.keys(clientTrees).filter(function(aid) {
          var ak = _fsKeyAdmin(aid);
          return treesConfig[ak] && treesConfig[ak].visible;
        });

        var statusColor = function(s) {
          if (s==='En buen estado') return '#15803d';
          if (s==='En monitoreo') return '#0284c7';
          if (s==='Requiere atención') return '#d97706';
          if (s==='Intervención programada') return '#b91c1c';
          if (s==='Intervenido') return '#7c3aed';
          return '#6b7280';
        };

        var html = '<div style="max-width:400px;margin:12px auto;padding-bottom:80px">';

        // Phone frame header (like the actual client portal)
        html += '<div style="background:#0f3320;border-radius:16px 16px 0 0;padding:14px 16px;color:#fff">';
        html += '<div style="font-size:9px;font-weight:700;color:#86efac;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Bosques Urbanos · Mi Portal</div>';
        html += '<div style="font-size:16px;font-weight:800;font-family:\'Fraunces\',Georgia,serif">' + _escAdmin(clientName) + '</div>';
        if (welcomeMsg) {
          html += '<div style="margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.1);border-radius:8px;font-size:11px;color:#d1fae5;line-height:1.4">' + _escAdmin(welcomeMsg) + '</div>';
        }
        html += '</div>';

        // Tab bar preview
        html += '<div style="background:#fff;display:flex;border-bottom:1px solid #e5e7eb">';
        html += '<div style="flex:1;padding:10px;text-align:center;font-size:11px;font-weight:700;color:#0f3320;border-bottom:2.5px solid #0f3320">🌳 Mis Árboles</div>';
        html += '<div style="flex:1;padding:10px;text-align:center;font-size:11px;color:#9ca3af">📄 Documentos</div>';
        html += '<div style="flex:1;padding:10px;text-align:center;font-size:11px;color:#9ca3af">💬 Consultas</div>';
        html += '</div>';

        // Tree cards
        html += '<div style="background:#f8f9fa;padding:12px;border-radius:0 0 16px 16px;border:1.5px solid #e5e7eb;border-top:none">';

        if (visibleTrees.length === 0) {
          html += '<div style="text-align:center;padding:30px 20px;color:#9ca3af">';
          html += '<div style="font-size:40px;margin-bottom:10px">🌳</div>';
          html += '<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:6px">Ningún árbol configurado</div>';
          html += '<div style="font-size:11px">Ve a "✏️ Editar portal" para activar qué árboles verá el cliente.</div>';
          html += '</div>';
        } else {
          visibleTrees.forEach(function(aid) {
            var ev = clientTrees[aid];
            var ak = _fsKeyAdmin(aid);
            var cfg = treesConfig[ak] || {};
            var label = cfg.clientLabel || aid;
            var status = cfg.clientStatus || '';
            var note = cfg.adminNote || '';
            var photos = cfg.visiblePhotos || [];
            var especie = ev.especie || (ev.answers && ev.answers.especie) || '';
            var sc = statusColor(status);

            html += '<div style="background:#fff;border-radius:12px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08)">';

            // Photo strip
            if (photos.length > 0) {
              html += '<div style="height:120px;overflow:hidden;background:#e5e7eb">';
              html += '<img src="' + _escAdmin(photos[0]) + '" style="width:100%;height:120px;object-fit:cover" onerror="this.parentElement.style.background=\'#e5e7eb\'">';
              html += '</div>';
            }

            html += '<div style="padding:12px 14px">';
            html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">';
            html += '<div>';
            html += '<div style="font-size:14px;font-weight:700;color:#111827">' + _escAdmin(label) + '</div>';
            if (especie) html += '<div style="font-size:10px;color:#9ca3af;font-style:italic">' + _escAdmin(especie) + '</div>';
            html += '</div>';
            if (status) html += '<span style="flex-shrink:0;padding:3px 9px;background:' + sc + '18;color:' + sc + ';border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap">' + _escAdmin(status) + '</span>';
            html += '</div>';
            if (note) html += '<div style="font-size:12px;color:#374151;background:#f8f9fa;border-radius:8px;padding:8px 10px;border-left:3px solid #0f3320;line-height:1.5">' + _escAdmin(note) + '</div>';
            html += '</div>';
            html += '</div>';
          });
        }
        html += '</div>';

        // Edit button
        html += '<button onclick="window._adminPortalSubTab(\'edit\')" style="width:100%;margin-top:12px;padding:13px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">✏️ Editar portal de ' + _escAdmin(clientName) + '</button>';

        html += '</div>';
        pane.innerHTML = html;
      };

      // Load config from Firebase
      if (typeof window._fbGetPortalConfig === 'function') {
        var fsk = typeof window._fsKey === 'function' ? window._fsKey(clientName) : _fsKeyAdmin(clientName);
        window._fbGetPortalConfig(fsk, function(snap) {
          loadPreview((snap && snap.val) ? snap.val() : {});
        });
      } else {
        loadPreview({});
      }
    };

    // Load preview by default
    window._adminPortalSubTab('preview');
  }

  /* ═══ TAB: CHAT ═══ */
  function _renderAdminChat(content) {
    var clientKey = _fsKeyAdmin(_adminCurrentClient);
    content.style.display = 'flex'; content.style.flexDirection = 'column';
    content.innerHTML =
      '<div style="background:#fff;padding:10px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0">' +
        '<div style="font-size:13px;font-weight:800;color:#374151">💬 Chat con ' + _escAdmin(_adminCurrentClient) + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:2px">Los mensajes son recibidos en tiempo real por el cliente</div>' +
      '</div>' +
      '<div id="admin-chat-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch;min-height:0;background:#faf9f5">' +
        '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:20px">Cargando mensajes...</div>' +
      '</div>' +
      '<div style="padding:10px 14px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:8px;flex-shrink:0">' +
        '<input type="text" id="admin-chat-input" placeholder="Escribe un mensaje al cliente…" ' +
          'style="flex:1;padding:11px 13px;border:1.5px solid #d1d5db;border-radius:12px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;outline:none;background:#faf9f5" ' +
          'onkeypress="if(event.key===\'Enter\')window.dbAdminSendChat()">' +
        '<button onclick="window.dbAdminSendChat()" style="padding:11px 18px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">Enviar</button>' +
      '</div>';

    if (typeof window._fbOnChat === 'function') {
      _adminChatUnsub = window._fbOnChat(clientKey, function(snap) {
        var msgs = snap && snap.val ? snap.val() : null;
        _renderAdminChatMsgs(msgs);
        // Mark client messages as read in Firebase
        if (msgs && typeof window._fbSetPath === 'function') {
          Object.keys(msgs).forEach(function(mk) {
            if (msgs[mk].from === 'cliente' && !msgs[mk].read) {
              window._fbSetPath('chat/' + clientKey + '/messages/' + mk + '/read', true);
            }
          });
        }
      });
    } else {
      var msgEl = document.getElementById('admin-chat-msgs');
      if (msgEl) msgEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:30px">Chat no disponible.</div>';
    }
  }

  function _renderAdminChatMsgs(msgs) {
    var container = document.getElementById('admin-chat-msgs');
    if (!container) return;
    if (!msgs || Object.keys(msgs).length === 0) {
      container.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;gap:10px">' +
          '<div style="font-size:40px">💬</div>' +
          '<div style="font-size:14px;font-weight:700;color:#374151">Sin mensajes</div>' +
          '<div style="font-size:12px;color:#9ca3af;text-align:center">El cliente recibirá tus mensajes en su portal</div>' +
        '</div>';
      return;
    }
    var list = Object.entries(msgs).sort(function(a,b) { return (a[1].ts||0)-(b[1].ts||0); });
    var html = '';
    list.forEach(function(entry) {
      var m       = entry[1];
      var isAdmin = m.from === 'admin' || m.role === 'admin' || m.role === 'programador';
      var bg      = isAdmin ? '#0f3320' : '#fff';
      var col     = isAdmin ? '#fff' : '#111827';
      var border  = isAdmin ? '' : 'border:1.5px solid #e5e7eb;';
      var align   = isAdmin ? 'flex-end' : 'flex-start';
      html +=
        '<div style="display:flex;justify-content:' + align + '">' +
          '<div style="max-width:82%;padding:10px 13px;background:' + bg + ';color:' + col + ';border-radius:12px;font-size:13px;line-height:1.5;' + border + 'box-shadow:0 1px 4px rgba(0,0,0,.07)">' +
            '<div>' + _escAdmin(m.text || m.mensaje || '') + '</div>' +
            '<div style="font-size:10px;opacity:.5;margin-top:5px;text-align:right">' + _escAdmin(m.nombre || (isAdmin?'Admin':'Cliente')) + ' · ' + fmtDate(m.ts) + '</div>' +
          '</div>' +
        '</div>';
    });
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  window.dbAdminSendChat = function() {
    var input = document.getElementById('admin-chat-input');
    var text  = input ? input.value.trim() : '';
    if (!text || !_adminCurrentClient) return;
    var clientKey = _fsKeyAdmin(_adminCurrentClient);
    var role   = (window.APP && (window.APP.userRole || window.APP.activeRole)) || 'admin';
    var nombre = (window.APP && (window.APP.activeEngineer || window.APP.userName)) || 'Admin';
    var msg    = { text: text, from: 'admin', role: role, nombre: nombre, ts: Date.now() };
    if (typeof window._fbSendMessage === 'function') window._fbSendMessage(clientKey, msg);
    if (input) input.value = '';
  };

  /* ═══ TAB: CUENTA ═══ */
  function _renderAdminCuenta(content) {
    content.style.display = 'block';
    content.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">⏳ Buscando cuenta...</div>';
    if (typeof window._fbGetAllUsers === 'function') {
      window._fbGetAllUsers().then(function(users) { _renderAdminCuentaContent(content, users); }).catch(function() { _renderAdminCuentaContent(content, null); });
    } else { _renderAdminCuentaContent(content, null); }
  }

  function _renderAdminCuentaContent(content, users) {
    var clientName = _adminCurrentClient;
    var linkedUser = null;
    if (users) {
      Object.keys(users).forEach(function(uid) {
        var u = users[uid];
        if (u.role === 'cliente' && (u.clienteAsignado||'').toLowerCase().trim() === clientName.toLowerCase().trim()) {
          if (!linkedUser) linkedUser = Object.assign({ _uid: uid }, u);
        }
      });
    }
    var html = '<div style="padding:16px 16px 80px">';
    if (linkedUser) {
      var isActive = linkedUser.activo !== false;
      html +=
        '<div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:16px;padding:16px;margin-bottom:16px">' +
          '<div style="font-size:11px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">✅ Cuenta activa</div>' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
            '<div style="width:50px;height:50px;border-radius:14px;background:linear-gradient(135deg,#0f3320,#22c55e);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🏢</div>' +
            '<div style="min-width:0"><div style="font-weight:700;font-size:16px;color:#111827;overflow:hidden;text-overflow:ellipsis">' + _escAdmin(linkedUser.nombre||'Sin nombre') + '</div><div style="font-size:12px;color:#6b7280;overflow:hidden;text-overflow:ellipsis">' + _escAdmin(linkedUser.email||'') + '</div><div style="font-size:11px;color:#9ca3af;margin-top:2px">Asignado a: ' + _escAdmin(linkedUser.clienteAsignado||clientName) + '</div></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
            '<span style="padding:3px 12px;background:' + (isActive?'#dcfce7':'#fee2e2') + ';color:' + (isActive?'#15803d':'#b91c1c') + ';border-radius:20px;font-size:11px;font-weight:700">' + (isActive?'● Activo':'○ Inactivo') + '</span>' +
            '<span style="padding:3px 12px;background:#eff6ff;color:#1d4ed8;border-radius:20px;font-size:11px;font-weight:700">🏢 Cliente</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button onclick="window.toggleUserActive && window.toggleUserActive(\'' + linkedUser._uid + '\',' + (!isActive) + ');setTimeout(function(){window.dbAdminTab(\'cuenta\')},800)" style="flex:1;padding:11px;background:' + (isActive?'#fff1f2':'#f0fdf4') + ';color:' + (isActive?'#b91c1c':'#15803d') + ';border:1.5px solid ' + (isActive?'#fecdd3':'#86efac') + ';border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">' + (isActive?'🔒 Desactivar':'✅ Activar') + '</button>' +
            '<button onclick="window.changeUserPassword && window.changeUserPassword(\'' + linkedUser._uid + '\',\'' + _escAdmin(linkedUser.email||'') + '\')" style="padding:11px 16px;background:#f8f4ee;border:1.5px solid #d4cfc5;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#6b6560">🔑 Clave</button>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f8f7f4;border-radius:12px;padding:14px"><div style="font-size:12px;font-weight:700;color:#0f3320;margin-bottom:6px">ℹ️ Portal del cliente</div><div style="font-size:12px;color:#6b7280;line-height:1.7">Accede con correo y contraseña. Solo ve lo configurado en <strong>👁️ Portal</strong>.</div></div>';
    } else {
      html +=
        '<div style="background:#fefce8;border:2px solid #fde047;border-radius:16px;padding:20px;margin-bottom:16px;text-align:center">' +
          '<div style="font-size:40px;margin-bottom:12px">🏢</div>' +
          '<div style="font-size:16px;font-weight:700;color:#854d0e;margin-bottom:8px">Sin cuenta de portal</div>' +
          '<div style="font-size:13px;color:#78350f;margin-bottom:18px;line-height:1.5">' + _escAdmin(clientName) + ' no tiene cuenta. Crea una para que pueda acceder al portal.</div>' +
        '</div>' +
        '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:14px">' +
          '<div style="font-size:13px;font-weight:800;color:#0f3320;margin-bottom:14px">➕ Crear cuenta de cliente</div>' +
          '<input type="text" id="acc-nombre" placeholder="Nombre completo *" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d4cfc5;border-radius:10px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;outline:none;background:#faf9f5;margin-bottom:8px">' +
          '<input type="email" id="acc-email" placeholder="correo@empresa.com *" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d4cfc5;border-radius:10px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;outline:none;background:#faf9f5;margin-bottom:8px">' +
          '<input type="password" id="acc-pass" placeholder="Contraseña (mín. 6) *" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d4cfc5;border-radius:10px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;outline:none;background:#faf9f5;margin-bottom:8px">' +
          '<div style="background:#f0fdf4;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:#15803d"><strong>Cliente asignado:</strong> ' + _escAdmin(clientName) + '</div>' +
          '<div id="acc-error" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;margin-bottom:8px"></div>' +
          '<button id="acc-create-btn" onclick="window.dbAdminCreateAccount(\'' + encodeURIComponent(clientName) + '\')" style="width:100%;padding:12px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">✅ Crear cuenta</button>' +
        '</div>';
    }
    html += '</div>';
    content.innerHTML = html;
  }

  window.dbAdminCreateAccount = async function(encName) {
    var clientName = decodeURIComponent(encName);
    var nombre = (document.getElementById('acc-nombre')||{}).value || '';
    var email  = ((document.getElementById('acc-email')||{}).value || '').trim().toLowerCase();
    var pass   = (document.getElementById('acc-pass')||{}).value || '';
    var errEl  = document.getElementById('acc-error');
    var btn    = document.getElementById('acc-create-btn');
    nombre = nombre.trim();
    if (errEl) errEl.style.display = 'none';
    if (!nombre || !email || !pass) { if (errEl) { errEl.textContent='Completa todos los campos.'; errEl.style.display='block'; } return; }
    if (pass.length < 6) { if (errEl) { errEl.textContent='Contraseña mínimo 6 caracteres.'; errEl.style.display='block'; } return; }
    if (!email.includes('@')) { if (errEl) { errEl.textContent='Correo no válido.'; errEl.style.display='block'; } return; }
    if (btn) { btn.disabled=true; btn.textContent='Creando...'; }
    try {
      var salt = window._generateSalt();
      var hash = await window._hashPassword(pass, salt);
      var uid  = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
      await window._fbSaveUser(uid, { nombre:nombre, email:email, role:'cliente', salt:salt, passwordHash:hash, activo:true, clientesPermitidos:[], clienteAsignado:clientName, creadoPor:(window._AUTH&&window._AUTH.currentUser?window._AUTH.currentUser.uid:null), creadoEn:Date.now() });
      showNotif('✅ Cuenta creada para ' + clientName);
      window.dbAdminTab('cuenta');
    } catch(e) {
      if (btn) { btn.disabled=false; btn.textContent='✅ Crear cuenta'; }
      if (errEl) { errEl.textContent=e.message||'Error al crear la cuenta.'; errEl.style.display='block'; }
    }
  };

  /* ══════════════════════════════════════════════════════════
     SISTEMA DE REPORTES Y SUGERENCIAS (shake only)
  ══════════════════════════════════════════════════════════ */
  window._reportScreenshotBlob    = null;
  window._reportScreenshotDataUrl  = null;

  window.openReportModal = function () {
    var modal = document.getElementById('reportModal');
    if (!modal) return;

    // ── Detectar pantalla actual ANTES de mostrar el modal ──
    var screenNames = { viewHome:'🏠 Inicio', viewDB:'🗂️ Registros', viewForm:'📋 Formulario', viewMap:'🗺️ Mapa' };
    var currentScreen = 'Desconocida';
    ['viewHome','viewDB','viewForm','viewMap'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.classList.contains('active')) currentScreen = screenNames[id]||id;
    });
    var admDetail = document.getElementById('db-admin-detail-wrap');
    if (admDetail && admDetail.style.display !== 'none') currentScreen = '🏢 Admin — ' + (_adminCurrentClient||'');
    window._reportCurrentScreen = currentScreen;

    // ── Reset formulario ──
    var label = document.getElementById('report-screen-label');
    if (label) label.textContent = 'Pantalla detectada: ' + currentScreen;
    var desc = document.getElementById('report-desc');
    if (desc) desc.value = '';
    var sec = document.getElementById('report-section');
    if (sec) sec.value = '';
    window.reportSetType && window.reportSetType('error');
    window._reportScreenshotBlob   = null;
    window._reportScreenshotDataUrl = null;

    // ── Captura de pantalla ──
    var wrap    = document.getElementById('report-screenshot-wrap');
    var state   = document.getElementById('report-screenshot-state');
    var preview = document.getElementById('report-screenshot-preview');
    var img     = document.getElementById('report-screenshot-img');
    if (wrap)    { wrap.style.display = 'block'; }
    if (state)   { state.style.display = 'flex'; }
    if (preview) { preview.style.display = 'none'; }

    // Mostrar modal
    modal.style.display = 'flex';
    setTimeout(function(){ desc && desc.focus(); }, 250);

    // Capturar la app (excluye el modal que acabamos de abrir)
    var appEl = document.getElementById('app');
    if (typeof html2canvas === 'function' && appEl) {
      html2canvas(appEl, {
        scale      : 0.35,
        useCORS    : true,
        allowTaint : true,
        logging    : false,
        ignoreElements: function(el) { return el.id === 'reportModal'; }
      }).then(function(canvas) {
        canvas.toBlob(function(blob) {
          window._reportScreenshotBlob = blob;
          var dataUrl = canvas.toDataURL('image/jpeg', 0.55);
          window._reportScreenshotDataUrl = dataUrl;
          if (img)     { img.src = dataUrl; }
          if (state)   { state.style.display = 'none'; }
          if (preview) { preview.style.display = 'block'; }
        }, 'image/jpeg', 0.55);
      }).catch(function() {
        // Si falla silenciosamente, ocultar la sección
        if (wrap) wrap.style.display = 'none';
      });
    } else {
      if (wrap) wrap.style.display = 'none';
    }
  };

  window.reportRemoveScreenshot = function () {
    window._reportScreenshotBlob   = null;
    window._reportScreenshotDataUrl = null;
    var wrap = document.getElementById('report-screenshot-wrap');
    if (wrap) wrap.style.display = 'none';
  };

  window.closeReportModal = function () {
    var modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
  };

  window.reportSetType = function (tipo) {
    var hidden = document.getElementById('report-type-val');
    if (hidden) hidden.value = tipo;
    var btns = {
      'error':     document.getElementById('report-type-error'),
      'sugerencia':document.getElementById('report-type-sug'),
      'otro':      document.getElementById('report-type-otro')
    };
    var actBg   = { error:'#fff1f2', sugerencia:'#fefce8', otro:'#eff6ff' };
    var actColor= { error:'#b91c1c', sugerencia:'#92400e', otro:'#1d4ed8' };
    var actBord = { error:'#fca5a5', sugerencia:'#fcd34d', otro:'#93c5fd' };
    Object.keys(btns).forEach(function(k) {
      var b = btns[k];
      if (!b) return;
      if (k === tipo) {
        b.style.background   = actBg[k];
        b.style.color        = actColor[k];
        b.style.borderColor  = actBord[k];
        b.style.fontWeight   = '700';
      } else {
        b.style.background   = '#faf9f5';
        b.style.color        = '#6b7280';
        b.style.borderColor  = '#d4cfc5';
        b.style.fontWeight   = '600';
      }
    });
  };

  window.submitReport = function () {
    var desc  = document.getElementById('report-desc');
    var sec   = document.getElementById('report-section');
    var tipo  = document.getElementById('report-type-val');
    var text  = desc ? desc.value.trim() : '';
    if (!text) { showNotif('⚠️ Describe el reporte antes de enviar','warning'); return; }

    var report = {
      description : text,
      tipo        : tipo ? (tipo.value || 'error') : 'error',
      section     : sec  ? (sec.value  || 'sin especificar') : 'sin especificar',
      screen      : window._reportCurrentScreen || 'desconocida',
      evaluador   : (window.APP && window.APP.activeEngineer) || 'desconocido',
      role        : (window.APP && (window.APP.userRole || window.APP.activeRole)) || 'desconocido',
      ts          : Date.now(),
      resolved    : false
    };

    // Botón en estado cargando
    var sendBtn = document.querySelector('#reportModal button[onclick="submitReport()"]');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳ Enviando…'; }

    function _pushReport(r) {
      if (typeof window._fbPushReport === 'function') {
        return window._fbPushReport(r)
          .then(function() { window.closeReportModal(); showNotif('✅ Reporte enviado'); })
          .catch(function(e) { showNotif('❌ Error al enviar: ' + (e.message || '')); })
          .finally(function() { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '📤 Enviar'; } });
      } else {
        var stored = JSON.parse(localStorage.getItem('bu_reports') || '[]');
        stored.push(r);
        localStorage.setItem('bu_reports', JSON.stringify(stored));
        window.closeReportModal();
        showNotif('✅ Reporte guardado');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '📤 Enviar'; }
        return Promise.resolve();
      }
    }

    var blob = window._reportScreenshotBlob;
    var dataUrl = window._reportScreenshotDataUrl;

    if (blob) {
      // Intentar subir a Cloudinary si está configurado
      var cloudName = window.CLOUDINARY_CLOUD_NAME;
      var preset    = window.CLOUDINARY_UPLOAD_PRESET;
      if (cloudName && preset) {
        var file = new File([blob], 'reporte_' + Date.now() + '.jpg', { type: 'image/jpeg' });
        var fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', preset);
        fd.append('folder', 'reportes');
        fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload', { method: 'POST', body: fd })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.secure_url) report.screenshotUrl = data.secure_url;
            else if (dataUrl) report.screenshotBase64 = dataUrl;
            return _pushReport(report);
          })
          .catch(function() {
            // Cloudinary falló → guardar base64 comprimido
            if (dataUrl) report.screenshotBase64 = dataUrl;
            return _pushReport(report);
          });
      } else {
        // Sin Cloudinary → base64 directo en Firebase
        if (dataUrl) report.screenshotBase64 = dataUrl;
        _pushReport(report);
      }
    } else {
      _pushReport(report);
    }
  };

  // Shake para abrir reporte — umbral 25 m/s², 4 sacudidas en 1.5s, cooldown 5s
  (function(){
    var _lastShake=0, _shakeCount=0, _shakeTimer=null;
    window.addEventListener('devicemotion', function(e){
      var acc = e.acceleration || e.accelerationIncludingGravity;
      if (!acc) return;
      var mag = Math.sqrt((acc.x||0)*(acc.x||0)+(acc.y||0)*(acc.y||0)+(acc.z||0)*(acc.z||0));
      if (!e.acceleration) mag = Math.abs(mag - 9.8);
      if (mag > 25) {
        _shakeCount++;
        clearTimeout(_shakeTimer);
        _shakeTimer = setTimeout(function(){ _shakeCount = 0; }, 1500);
        if (_shakeCount >= 4 && Date.now() - _lastShake > 5000) {
          _lastShake = Date.now(); _shakeCount = 0;
          window.openReportModal && window.openReportModal();
        }
      }
    });
  }());

}());
