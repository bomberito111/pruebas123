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

    // ═══ 5. ALL FORM ANSWERS (every QS question) ═══
    var qs = window.QS || [];
    var formContent = '';
    qs.forEach(function(q) {
      if (q.type === 'risk_target_group') return; // shown separately
      if (['arbolId','especie','cliente','evaluador'].indexOf(q.id) !== -1) return; // already in ID section
      var val = gv(q.id);
      if (val === null || val === undefined) return;
      if (q.type === 'group' && q.fields) {
        var grp = (typeof val === 'object' && !Array.isArray(val)) ? val : {};
        q.fields.forEach(function(f) {
          var fv = grp[f.id];
          if (fv !== undefined && fv !== null && fv !== '') {
            formContent += row(f.label, fv);
          }
        });
        return;
      }
      formContent += row(q.label, val);
    });
    if (formContent) html += section('Respuestas del Formulario ISA TRAQ', formContent, '📋');

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

}());
