/* ═══════════════════════════════════════════
   dashboard.js — Home right panel stats
   Bosques Urbanos — forestry engineering app
   Plain <script> tag, all exports on window.
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────
   RENDER DASHBOARD
───────────────────────────────────────── */

window.renderDashboard = function () {
  var panel = document.getElementById('dashPanel');
  if (!panel) return;

  var db = window._dbAll || {};
  var activeClient = window.APP && window.APP.activeClient;

  // ── Collect relevant entries ──
  var entries = Object.keys(db).map(function (key) {
    return { key: key, data: db[key] };
  }).filter(function (item) {
    if (!activeClient) return true;
    return window.getClientName(item.data) === activeClient;
  });

  // ── Unique trees (by arbolId) ──
  var treeIds = {};
  entries.forEach(function (item) {
    var aid = item.data.arbolId || item.key;
    treeIds[aid] = true;
  });
  var totalTrees = Object.keys(treeIds).length;
  var totalEvals = entries.length;

  // ── Risk distribution ──
  var riskCounts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
  // Latest eval per tree for risk distribution
  var latestPerTree = {};
  entries.forEach(function (item) {
    var d = item.data;
    var aid = d.arbolId || item.key;
    var ts = d.ts || d.timestamp || 0;
    if (!latestPerTree[aid] || ts > (latestPerTree[aid].ts || 0)) {
      latestPerTree[aid] = { data: d, ts: ts };
    }
  });
  Object.keys(latestPerTree).forEach(function (aid) {
    var risk = window.getEffectiveRisk(latestPerTree[aid].data);
    if (riskCounts[risk] !== undefined) riskCounts[risk]++;
  });

  // ── Trees with GPS ──
  var gpsCount = 0;
  Object.keys(latestPerTree).forEach(function (aid) {
    var d = latestPerTree[aid].data;
    if (d.gps || (d.answers && d.answers.gps)) gpsCount++;
  });

  // ── Last evaluation date ──
  var lastTs = 0;
  entries.forEach(function (item) {
    var ts = item.data.ts || item.data.timestamp || 0;
    if (ts > lastTs) lastTs = ts;
  });
  var lastDateStr = lastTs ? new Date(lastTs).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // ── Most active engineer ──
  var engCount = {};
  entries.forEach(function (item) {
    var eng = item.data.evaluador || '(Sin nombre)';
    engCount[eng] = (engCount[eng] || 0) + 1;
  });
  var topEng = '—';
  var topEngN = 0;
  Object.keys(engCount).forEach(function (name) {
    if (engCount[name] > topEngN) { topEng = name; topEngN = engCount[name]; }
  });

  // ── Worst risk for active client badge ──
  var riskOrder = ['extremo', 'alto', 'moderado', 'bajo'];
  var worstRisk = 'bajo';
  for (var ri = 0; ri < riskOrder.length; ri++) {
    if (riskCounts[riskOrder[ri]] > 0) { worstRisk = riskOrder[ri]; break; }
  }
  var worstColor = (window.RISK_COLORS && window.RISK_COLORS[worstRisk]) || '#6b7280';

  // ── Last 5 evaluations (most recent first) ──
  var sorted = entries.slice().sort(function (a, b) {
    var tsA = a.data.ts || a.data.timestamp || 0;
    var tsB = b.data.ts || b.data.timestamp || 0;
    return tsB - tsA;
  });
  var lastEvals = sorted.slice(0, 5);

  // ── Risk bar widths (percentage of total trees) ──
  function barPct(n) {
    return totalTrees > 0 ? Math.round((n / totalTrees) * 100) : 0;
  }

  // ── Build HTML ──
  var clientName = activeClient || 'Todos los clientes';

  panel.innerHTML =
    // ── Header ──
    '<div style="padding:16px 16px 10px;border-bottom:1px solid var(--border);">' +
      '<div style="font-family:\'Fraunces\',serif;font-size:16px;font-weight:900;color:var(--g900);">Panel Resumen</div>' +
      '<div style="font-size:10px;color:var(--muted);font-weight:600;margin-top:2px;">' + clientName + '</div>' +
    '</div>' +

    // ── Stats Grid ──
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;">' +
      _dashCard('🌳', 'Árboles', totalTrees, '#0f3320') +
      _dashCard('📋', 'Evaluaciones', totalEvals, '#1d4ed8') +
      _dashCard('📍', 'Con GPS', gpsCount, '#0891b2') +
      _dashCard('👷', 'Evaluador', topEng.split(' ')[0], '#7c3aed', true) +
    '</div>' +

    // ── Risk distribution ──
    '<div style="padding:0 14px 12px;">' +
      '<div style="font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Distribución de Riesgo</div>' +
      _riskBar('Bajo',     riskCounts.bajo,     totalTrees, '#15803d') +
      _riskBar('Moderado', riskCounts.moderado,  totalTrees, '#f59e0b') +
      _riskBar('Alto',     riskCounts.alto,      totalTrees, '#f97316') +
      _riskBar('Extremo',  riskCounts.extremo,   totalTrees, '#b91c1c') +
    '</div>' +

    // ── Active client card ──
    '<div style="margin:0 14px 12px;border-radius:12px;background:linear-gradient(135deg,#0f3320,#1a4a2e);padding:14px;border:1px solid rgba(34,197,94,.2);">' +
      '<div style="font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#86efac;margin-bottom:6px;">Cliente Activo</div>' +
      '<div style="font-family:\'Fraunces\',serif;font-size:15px;font-weight:900;color:#fff;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + clientName + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + worstColor + ';flex-shrink:0;"></div>' +
        '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);">Riesgo mayor: ' + worstRisk.toUpperCase() + '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:6px;">Última eval: ' + lastDateStr + '</div>' +
    '</div>' +

    // ── Quick action buttons ──
    '<div style="padding:0 14px 12px;display:grid;grid-template-columns:1fr 1fr;gap:7px;">' +
      '<button onclick="window.startNewTree && window.startNewTree() || window.switchTab(\'form\')" style="padding:10px 8px;background:linear-gradient(135deg,var(--g800),var(--g700));color:#fff;border:none;border-radius:10px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;">➕ Nuevo árbol</button>' +
      '<button onclick="window.switchTab(\'db\')" style="padding:10px 8px;background:rgba(255,255,255,0.9);color:var(--g900);border:1.5px solid var(--border);border-radius:10px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;">↺ Re-evaluar</button>' +
      '<button onclick="window.switchTab(\'db\')" style="padding:10px 8px;background:rgba(255,255,255,0.9);color:var(--ink);border:1.5px solid var(--border);border-radius:10px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;">🗂️ Registros</button>' +
      '<button onclick="typeof window.exportToPDF === \'function\' && window.exportToPDF()" style="padding:10px 8px;background:var(--b100);color:var(--b700);border:1.5px solid rgba(29,78,216,0.2);border-radius:10px;font-weight:700;font-size:11px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;">📄 Exportar PDF</button>' +
    '</div>' +

    // ── Latest evaluations ──
    '<div style="padding:0 14px 20px;">' +
      '<div style="font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Últimas Evaluaciones</div>' +
      (lastEvals.length === 0
        ? '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">Sin evaluaciones</div>'
        : lastEvals.map(function (item) {
            var d = item.data;
            var risk = window.getEffectiveRisk(d);
            var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
            var date = d.ts ? new Date(d.ts).toLocaleDateString('es-CO') : '—';
            return '<div onclick="typeof window.showTreeDetail === \'function\' && window.showTreeDetail(\'' + item.key + '\')" style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid rgba(240,235,224,.8);cursor:pointer;">' +
              '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (d.arbolId || item.key) + ' · ' + (d.especie || '—') + '</div>' +
                '<div style="font-size:10px;color:var(--muted);">' + (d.evaluador || '—') + ' · ' + date + '</div>' +
              '</div>' +
              '<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;background:' + color + ';color:#fff;">' + risk.toUpperCase() + '</span>' +
            '</div>';
          }).join('')
      ) +
    '</div>';
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function _dashCard(icon, label, value, color, small) {
  return '<div style="background:rgba(255,255,255,0.85);border:1px solid rgba(212,207,197,.6);border-radius:11px;padding:12px;backdrop-filter:blur(8px);">' +
    '<div style="font-size:16px;margin-bottom:4px;">' + icon + '</div>' +
    '<div style="font-family:\'Fraunces\',serif;font-size:' + (small ? '14px' : '20px') + ';font-weight:900;color:' + color + ';line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + value + '</div>' +
    '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-top:2px;">' + label + '</div>' +
  '</div>';
}

function _riskBar(label, count, total, color) {
  var pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
    '<div style="width:60px;font-size:10px;font-weight:700;color:var(--muted);">' + label + '</div>' +
    '<div style="flex:1;height:6px;background:rgba(0,0,0,0.06);border-radius:4px;overflow:hidden;">' +
      '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px;transition:width .5s ease;"></div>' +
    '</div>' +
    '<div style="width:26px;font-size:10px;font-weight:800;color:var(--ink);text-align:right;">' + count + '</div>' +
  '</div>';
}

/* ─────────────────────────────────────────
   UPDATE DASH STATS (alias, called after data loads)
───────────────────────────────────────── */

window.updateDashStats = function () {
  window.renderDashboard();
};
