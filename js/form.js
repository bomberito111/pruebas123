/* ═══════════════════════════════════════════
   form.js — ISA TRAQ Form Engine
   Depends on: config.js, state.js
═══════════════════════════════════════════ */

// ── FORM SCROLL HELPER ──
// Centers the target element in #formScroll without jumping to the top.
function _scrollToFormEl(el) {
  if (!el) return;
  var container = document.getElementById('formScroll');
  if (!container) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  // Use offsetTop relative to the container for reliability
  var elTop = 0;
  var node = el;
  while (node && node !== container) { elTop += node.offsetTop; node = node.offsetParent; }
  var targetScroll = elTop - Math.max(0, (container.clientHeight / 2) - (el.offsetHeight / 2));
  container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
}

// ── FORM STATE ──
var _answers = {};
var _gpsCoords = null;
var _multiSel = {};
var _tempRiskTarget = {};
var _editRTGState = {};
var _editingVal = {};
var _activeGpsIdx = -1;
var _assessmentDone = false;
var _pickerMapInstance = null;

// ── ISA TRAQ RISK ALGORITHMS ──

function calcRiskPart(pFallo, pImpacto, consec) {
  if (!pFallo || !pImpacto || !consec) return { level: 'bajo', probComb: 'improbable', score: 1 };
  const f = pFallo.toLowerCase().trim();
  const i = pImpacto.toLowerCase().replace(' ','_');
  const c = consec.toLowerCase().replace('severa', 'severo').trim();
  const m1 = {
    inminente:  {muy_bajo:'improbable', bajo:'algo_probable', medio:'probable',      alto:'muy_probable'},
    probable:   {muy_bajo:'improbable', bajo:'improbable',    medio:'algo_probable', alto:'probable'},
    posible:    {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'algo_probable'},
    improbable: {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'improbable'}
  };
  const probComb = m1[f]?.[i] || 'improbable';
  const m2 = {
    muy_probable:  {insignificante:'bajo', menor:'moderado', significativa:'alto',     severo:'extremo'},
    probable:      {insignificante:'bajo', menor:'moderado', significativa:'alto',     severo:'alto'},
    algo_probable: {insignificante:'bajo', menor:'bajo',     significativa:'moderado', severo:'moderado'},
    improbable:    {insignificante:'bajo', menor:'bajo',     significativa:'bajo',     severo:'bajo'}
  };
  const level = m2[probComb]?.[c] || 'bajo';
  const scores = { 'bajo':1, 'moderado':2, 'alto':3, 'extremo':4 };
  return { level, probComb, score: scores[level] };
}

function calcBio() {
  const H  = parseFloat(_answers['H']);
  const C  = parseFloat(_answers['C']);
  const Hi = 130;
  const Di = parseFloat(_answers['Di']);
  const Hd = parseFloat(_answers['Hd']);
  const Dd = parseFloat(_answers['Dd']);
  const tAct = parseFloat(_answers['tActual']);
  const topo = _answers['topologia'] || '';
  if ([H,C,Di,Hd,Dd].some(isNaN) || H<=0 || Di<=0 || Dd<=0) return { valid:false, isUnsafe:false };
  if (Hd >= Hi || Hi >= H) return { valid:false, isUnsafe:false };
  const Hf = (H + C) / 2;
  if (Hf <= Hi || Hf <= Hd) return { valid:false, isUnsafe:false };
  const ratio = (Hf - Hd) / (Hf - Hi);
  let inner = Math.pow(Dd, 4) - Math.pow(Di, 3) * Dd * ratio;
  if (inner < 0) inner = 0;
  let t_req = 0.5 * (Dd - Math.pow(inner, 0.25));
  if (topo.includes('exterior') || topo.includes('Exterior')) t_req = t_req / 0.70;
  else if (topo.includes('Apertura') || topo.includes('apertura')) t_req = t_req / 0.50;
  t_req = Math.max(0, t_req);
  const margin = (!isNaN(tAct) && tAct > 0 && t_req > 0) ? (tAct / t_req) * 100 : null;
  const isUnsafe = margin !== null && margin < 100;
  return { valid:true, isUnsafe, margin, t_req, Hf, ratio, tAct: isNaN(tAct) ? 0 : tAct };
}

function calcSectionMax(dianas) {
  let ms = 0; let ml = 'bajo';
  (dianas||[]).forEach(function(d) {
    const r = calcRiskPart(d.fallo, d.impacto, d.consec);
    if (r.score > ms) { ms = r.score; ml = r.level; }
  });
  return { level: ml };
}

function calcISA(isUnsafe, margin) {
  let maxScore = 1; let level = 'bajo'; let probComb = 'improbable';
  const sections = ['copa_dianas', 'tronco_dianas', 'raices_dianas'];
  sections.forEach(function(sec) {
    const dianas = _answers[sec] || [];
    dianas.forEach(function(d) {
      const r = calcRiskPart(d.fallo, d.impacto, d.consec);
      if (r.score > maxScore) { maxScore = r.score; level = r.level; probComb = r.probComb; }
    });
  });
  const rCopa = calcSectionMax(_answers['copa_dianas']);
  const rTronco = calcSectionMax(_answers['tronco_dianas']);
  const rRaices = calcSectionMax(_answers['raices_dianas']);
  let override = false;
  if (isUnsafe) {
    override = true;
    if (margin !== null && margin < 50) { level = 'extremo'; probComb = 'inminente'; }
    else { level = 'alto'; probComb = 'probable'; }
  }
  return { level, probComb, override, rCopa, rTronco, rRaices };
}

function buildRecs(isa, bio) {
  const recs = [];
  if (isa.level==='extremo') recs.push({c:'#f87171',t:'⛔ EXTREMO: Restricción inmediata de acceso y evaluación de emergencia urgente.'});
  else if (isa.level==='alto') recs.push({c:'#fb923c',t:'⚠️ ALTO: Intervención programada en < 3 meses. Señalización preventiva.'});
  else if (isa.level==='moderado') recs.push({c:'#fbbf24',t:'🟡 MODERADO: Monitoreo regular. Plan de manejo a 6–12 meses.'});
  else recs.push({c:'#4ade80',t:'✅ BAJO: Inspección rutinaria en el intervalo habitual.'});
  if (bio.isUnsafe) recs.push({c:'#f87171',t:'⚡ Rinntech crítico: t_req='+( bio.t_req?.toFixed(2))+' cm > t_actual. Inspección urgente.'});
  const dr = _answers['defRaices'];
  if (dr && (Array.isArray(dr)?dr:[dr]).some(function(v){return v.includes('Levantamiento');}))
    recs.push({c:'#fb923c',t:'🌱 Levantamiento del plato radicular: evaluar riesgo de volcado.'});
  return recs;
}

// ── MATRIX RENDER HELPERS ──

function renderM1HTML(fKey, iKey) {
  const isMatch = function(row, col) { return row === fKey && col === iKey; };
  const cell = function(row, col, text, colorCls) {
    return '<td class="m1-cell ' + (isMatch(row,col) ? 'active '+colorCls : '') + '">' + text + '</td>';
  };
  return '<div class="m1-wrap"><table class="m1-table">' +
    '<tr><th></th><th>Muy bajo</th><th>Bajo</th><th>Medio</th><th>Alto</th></tr>' +
    '<tr><th>Inminente</th>' + cell('inminente','muy_bajo','Improbable','c-green') + cell('inminente','bajo','Algo probable','c-yellow') + cell('inminente','medio','Probable','c-orange') + cell('inminente','alto','Muy Probable','c-red') + '</tr>' +
    '<tr><th>Probable</th>' + cell('probable','muy_bajo','Improbable','c-green') + cell('probable','bajo','Improbable','c-green') + cell('probable','medio','Algo probable','c-yellow') + cell('probable','alto','Probable','c-orange') + '</tr>' +
    '<tr><th>Posible</th>' + cell('posible','muy_bajo','Improbable','c-green') + cell('posible','bajo','Improbable','c-green') + cell('posible','medio','Improbable','c-green') + cell('posible','alto','Algo probable','c-yellow') + '</tr>' +
    '<tr><th>Improbable</th>' + cell('improbable','muy_bajo','Improbable','c-green') + cell('improbable','bajo','Improbable','c-green') + cell('improbable','medio','Improbable','c-green') + cell('improbable','alto','Improbable','c-green') + '</tr>' +
    '</table></div>';
}

function renderM2HTML(m1Key, cKey) {
  const isMatch = function(row, col) { return row === m1Key && col === cKey; };
  const cell = function(row, col, text, colorCls) {
    return '<td class="m1-cell ' + (isMatch(row,col) ? 'active '+colorCls : '') + '">' + text + '</td>';
  };
  return '<div class="m1-wrap"><table class="m1-table">' +
    '<tr><th></th><th>Insignificante</th><th>Menor</th><th>Significativa</th><th>Severa</th></tr>' +
    '<tr><th>Muy probable</th>' + cell('muy_probable','insignificante','Bajo','c-green') + cell('muy_probable','menor','Moderado','c-yellow') + cell('muy_probable','significativa','Alto','c-orange') + cell('muy_probable','severo','Extremo','c-red') + '</tr>' +
    '<tr><th>Probable</th>' + cell('probable','insignificante','Bajo','c-green') + cell('probable','menor','Moderado','c-yellow') + cell('probable','significativa','Alto','c-orange') + cell('probable','severo','Alto','c-orange') + '</tr>' +
    '<tr><th>Algo probable</th>' + cell('algo_probable','insignificante','Bajo','c-green') + cell('algo_probable','menor','Bajo','c-green') + cell('algo_probable','significativa','Moderado','c-yellow') + cell('algo_probable','severo','Moderado','c-yellow') + '</tr>' +
    '<tr><th>Improbable</th>' + cell('improbable','insignificante','Bajo','c-green') + cell('improbable','menor','Bajo','c-green') + cell('improbable','significativa','Bajo','c-green') + cell('improbable','severo','Bajo','c-green') + '</tr>' +
    '</table></div>';
}

// ── FORM BUILD ──

function buildWidget(q, idx) {
  var id = q.id;
  if (q.type === 'choice') {
    return '<div class="choices-wrap">' + q.opts.map(function(o) {
      return '<button class="choice-opt" onclick="window.submitChoice(' + idx + ',\'' + o.replace(/'/g,"\\'") + '\')">' + o + '</button>';
    }).join('') + '</div>';
  }
  if (q.type === 'multi') {
    if (!_multiSel[id]) _multiSel[id] = [];
    return '<div class="choices-wrap" id="mg_' + idx + '">' +
      q.opts.map(function(o) {
        var sel = _multiSel[id].includes(o);
        return '<button class="choice-opt' + (sel ? ' multi-sel' : '') + '" onclick="window.toggleMulti(' + idx + ',\'' + o.replace(/'/g,"\\'") + '\')">' + o + '</button>';
      }).join('') +
      '</div>' +
      '<button class="confirm-btn" onclick="window.submitMulti(' + idx + ')" style="margin-top:10px">Confirmar</button>';
  }
  if (q.type === 'text+gps') {
    return '<div class="gps-widget">' +
      '<input type="text" id="inp_' + idx + '" class="field-inp" placeholder="' + (q.ph_txt||'') + '" value="' + (_answers[id]||'') + '" />' +
      '<div style="margin-top:8px;display:flex;gap:8px;">' +
      '<button class="gps-main-btn" onclick="window.captureGPS(' + idx + ')">📍 GPS Auto</button>' +
      '<button class="skip-btn" onclick="window.openMapPicker(' + idx + ')">🗺️ Mapa</button>' +
      '</div>' +
      '<div id="gpsStatus_' + idx + '" style="font-size:12px;color:#6b7280;margin-top:4px;">' +
        (_gpsCoords ? '📍 '+_gpsCoords.lat.toFixed(5)+', '+_gpsCoords.lng.toFixed(5) : 'Sin coordenadas') +
      '</div>' +
      '<button class="confirm-btn" onclick="window.submitText(' + idx + ')" style="margin-top:8px">Confirmar</button>' +
      '</div>';
  }
  if (q.type === 'text') {
    // Evaluador is locked to the logged-in account — show as read-only pill
    if (id === 'evaluador') {
      var evalName = _answers['evaluador'] || '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;">' +
        '<span style="font-size:18px">👤</span>' +
        '<span style="font-weight:700;color:#166534;font-size:14px;flex:1">' + (evalName || 'Sin sesión activa') + '</span>' +
        '<span style="font-size:10px;color:#6b9e7a;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Cuenta activa</span>' +
        '</div>' +
        '<button class="confirm-btn" onclick="window.submitAutoEvaluador(' + idx + ')" style="margin-top:8px;width:100%">Confirmar →</button>';
    }
    return '<input type="text" id="inp_' + idx + '" class="field-inp" placeholder="' + (q.ph_txt||'') + '" value="' + (_answers[id]||'') + '" />' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
      '<button class="confirm-btn" onclick="window.submitText(' + idx + ')">Confirmar</button>' +
      (q.opt ? '<button class="skip-btn" onclick="window.submitTextSkip(' + idx + ')">Omitir</button>' : '') +
      '</div>';
  }
  if (q.type === 'number') {
    return '<div style="display:flex;align-items:center;gap:8px;">' +
      '<input type="number" id="inp_' + idx + '" class="field-inp" style="max-width:140px;" ' +
        'placeholder="' + (q.ph_txt||'0') + '" ' +
        'min="' + (q.min||0) + '" ' +
        'step="' + (q.step||'any') + '" ' +
        'value="' + (_answers[id]||q.def||'') + '" />' +
      (q.unit ? '<span style="color:#6b7280;font-size:14px;">'+q.unit+'</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
      '<button class="confirm-btn" onclick="window.submitNumber(' + idx + ',false)">Confirmar</button>' +
      (q.opt ? '<button class="skip-btn" onclick="window.submitNumber(' + idx + ',true)">Omitir</button>' : '') +
      '</div>';
  }
  if (q.type === 'group') {
    var fields = q.fields.map(function(f, fi) {
      var inp = '';
      if (f.type === 'select') {
        inp = '<select id="grp_' + idx + '_' + fi + '" class="field-inp">' +
          f.opts.map(function(o) { return '<option value="'+o+'">'+o+'</option>'; }).join('') +
          '</select>';
      } else if (f.type === 'number') {
        inp = '<input type="number" id="grp_' + idx + '_' + fi + '" class="field-inp" style="max-width:120px;" />';
      } else {
        inp = '<input type="text" id="grp_' + idx + '_' + fi + '" class="field-inp" />';
      }
      return '<div class="group-field"><label class="group-label">' + f.label + '</label>' + inp + '</div>';
    }).join('');
    return '<div class="group-fields">' + fields + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
      '<button class="confirm-btn" onclick="window.submitGroup(' + idx + ')">Confirmar</button>' +
      '<button class="skip-btn" onclick="window.submitGroupSkip(' + idx + ')">Omitir</button>' +
      '</div>';
  }
  if (q.type === 'risk_target_group') {
    // ── v7 FULL INLINE RTG WIDGET ──
    var list = window._tempRiskTarget[q.id] || [];
    var editState = window._editRTGState[q.id];
    var isEditingAny = editState && editState.isEditing;

    var listHtml = list.map(function(item, ii) {
      var isThisEditing = isEditingAny && editState.index === ii;
      var r = calcRiskPart(item.fallo, item.impacto, item.consec);
      var rLvl = {bajo:'BAJO', moderado:'MODERADO', alto:'ALTO', extremo:'EXTREMO'};
      var rCls = {bajo:'var(--g700)', moderado:'var(--a900)', alto:'var(--o700)', extremo:'var(--r700)'};
      return '<div style="background:#f0fdf4;border:1px solid #15803d;border-radius:8px;padding:12px;margin-bottom:12px;position:relative;transition:all 0.3s;' + (isThisEditing ? 'opacity:0.4;pointer-events:none;border-color:#ccc;transform:scale(0.98);' : '') + '">' +
        '<div style="font-size:12px;font-weight:900;color:#15803d;margin-bottom:5px;padding-right:40px;">Diana ' + (ii+1) + ': ' + (item.desc||'Sin descripción') + '</div>' +
        '<div style="position:absolute;top:8px;right:8px;display:flex;gap:12px;">' +
          '<button onclick="window.editRiskTarget_v7(\'' + q.id + '\',' + ii + ',' + idx + ')" style="background:none;border:none;font-size:16px;cursor:pointer;" title="Editar">✏️</button>' +
          '<button onclick="window.removeRiskTarget_v7(\'' + q.id + '\',' + ii + ',' + idx + ')" style="background:none;border:none;font-size:16px;cursor:pointer;" title="Eliminar">❌</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;margin-top:8px;">' +
          '<div><span style="color:var(--muted)">Ocupación:</span> <b>' + (item.ocup||'-') + '</b></div>' +
          '<div><span style="color:var(--muted)">Ubicación:</span> <b>' + (item.ubic||'-') + '</b></div>' +
          '<div><span style="color:var(--muted)">Fallo:</span> <b>' + (item.fallo||'-') + '</b></div>' +
          '<div><span style="color:var(--muted)">Impacto:</span> <b>' + (item.impacto||'-') + '</b></div>' +
          '<div style="grid-column:1/-1"><span style="color:var(--muted)">Consecuencias:</span> <b>' + (item.consec||'-') + '</b></div>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;font-weight:800;color:' + (rCls[r.level]||'var(--g700)') + ';border-top:1px solid rgba(0,0,0,0.05);padding-top:6px;">Riesgo final de esta diana: ' + (rLvl[r.level]||'BAJO') + '</div>' +
      '</div>';
    }).join('');

    var editingItem = (isEditingAny && list[editState.index]) ? list[editState.index] : {};
    var safeEv = function(k) { var v = editingItem[k]||''; return typeof v==='string'?v.replace(/"/g,'&quot;'):v; };
    var selEv = function(k, o) { return (editingItem[k]===o)?'selected':''; };

    var optsOcup = '<option value="">Seleccione...</option>' + ['1 · Rara','2 · Ocasional','3 · Frecuente','4 · Constante'].map(function(o){return '<option value="'+o+'" '+selEv('ocup',o)+'>'+o+'</option>';}).join('');
    var optsUbic = '<option value="">Seleccione...</option>' + ['Dentro de copa','1 x Altura','1.5 x Altura','Fuera de la zona'].map(function(o){return '<option value="'+o+'" '+selEv('ubic',o)+'>'+o+'</option>';}).join('');
    var optsSINO = '<option value="">Seleccione...</option>' + ['Sí','No'].map(function(o){return '<option value="'+o+'">'+o+'</option>';}).join('');
    var optsFallo = '<option value="">Seleccione...</option>' + ['Improbable','Posible','Probable','Inminente'].map(function(o){return '<option value="'+o+'" '+selEv('fallo',o)+'>'+o+'</option>';}).join('');
    var optsImpacto = '<option value="">Seleccione...</option>' + ['Muy bajo','Bajo','Medio','Alto'].map(function(o){return '<option value="'+o+'" '+selEv('impacto',o)+'>'+o+'</option>';}).join('');
    var optsConsec = '<option value="">Seleccione...</option>' + ['Insignificante','Menor','Significativa','Severa'].map(function(o){return '<option value="'+o+'" '+selEv('consec',o)+'>'+o+'</option>';}).join('');

    var boxTitle = isEditingAny ? ('✏️ Editando Diana ' + (editState.index+1)) : ('📝 Nueva Diana ' + (list.length>0 ? '(Diana '+(list.length+1)+')' : ''));

    var actionBtns = isEditingAny
      ? '<div style="display:flex;gap:8px;margin-top:15px;"><button onclick="window.updateRiskTarget_v7(\'' + q.id + '\',' + editState.index + ',' + idx + ')" style="flex:1;padding:10px;background:var(--b700,#1d4ed8);color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">💾 Guardar Cambios</button><button onclick="window.cancelEditRiskTarget_v7(\'' + q.id + '\',' + idx + ')" style="padding:10px 14px;background:#fff;color:var(--muted,#7a746e);border:1px solid var(--border,#ddd);border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">Cancelar</button></div>'
      : '<button onclick="window.addRiskTarget_v7(\'' + q.id + '\',' + idx + ')" style="margin-top:15px;padding:10px 12px;background:var(--g100,#dcfce7);color:var(--g900,#0f3320);border:1px solid var(--g700,#15803d);border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;width:100%;">➕ Guardar y añadir a la lista</button>';

    var fKey0 = (editingItem.fallo||'').toLowerCase().trim().replace(' ','_');
    var iKey0 = (editingItem.impacto||'').toLowerCase().trim().replace(' ','_');
    var initM1 = renderM1HTML(fKey0, iKey0);
    var rM10 = calcRiskPart(editingItem.fallo||'', editingItem.impacto||'', 'insignificante');
    var cKey0 = (editingItem.consec||'').toLowerCase().trim().replace('severa','severo');
    var initM2 = renderM2HTML(rM10.probComb, cKey0);

    var rtgQid = q.id;
    return listHtml +
      '<div id="rtg-edit-' + rtgQid + '" style="background:#fafaf8;border:1px solid var(--border,#ddd);border-radius:10px;padding:16px;margin-bottom:10px;">' +
        '<div style="font-size:13px;font-weight:900;color:var(--g900,#0f3320);margin-bottom:12px;border-bottom:2px solid var(--g100,#dcfce7);padding-bottom:6px;">' + boxTitle + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">' +
          '<div style="grid-column:1/-1"><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Descripción Diana (Obligatorio)</div><input type="text" id="rtg-desc-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;" value="' + safeEv('desc') + '" placeholder="Ej: Peatones en vereda"></div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Tasa Ocupación</div><select id="rtg-ocup-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;">' + optsOcup + '</select></div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Ubicación</div><select id="rtg-ubic-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;">' + optsUbic + '</select></div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">¿Práctico mover?</div><select id="rtg-mov-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;">' + optsSINO + '</select></div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">¿Práctico restringir?</div><select id="rtg-rest-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;">' + optsSINO + '</select></div>' +
        '</div>' +
        '<div style="background:#fff;border:1.5px solid var(--border,#ddd);border-radius:10px;padding:14px;">' +
          '<div style="font-size:12px;font-weight:800;color:var(--ink,#1a1a1a);margin-bottom:12px;text-transform:uppercase;">① Matriz Fallo e Impacto</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
            '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Probabilidad Fallo</div><select id="rtg-fallo-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;" onchange="window.updateLiveMatrices_v7(' + idx + ')">' + optsFallo + '</select></div>' +
            '<div><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Probabilidad Impacto</div><select id="rtg-impacto-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;" onchange="window.updateLiveMatrices_v7(' + idx + ')">' + optsImpacto + '</select></div>' +
          '</div>' +
          '<div id="live-m1-' + idx + '">' + initM1 + '</div>' +
          '<div style="font-size:12px;font-weight:800;color:var(--ink,#1a1a1a);margin:24px 0 12px;text-transform:uppercase;">② Matriz de Riesgo Final</div>' +
          '<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:700;color:var(--muted,#7a746e);">Consecuencias del Fallo</div><select id="rtg-consec-' + idx + '" style="width:100%;margin-top:4px;padding:10px;font-size:14px;border:1.5px solid var(--border,#ddd);border-radius:8px;" onchange="window.updateLiveMatrices_v7(' + idx + ')">' + optsConsec + '</select></div>' +
          '<div id="live-m2-' + idx + '">' + initM2 + '</div>' +
        '</div>' +
        actionBtns +
      '</div>' +
      '<div style="display:flex;justify-content:center;margin-top:20px;padding-top:15px;border-top:1px solid #ddd;">' +
        '<button onclick="window.submitRiskTargetGroup_v7(\'' + q.id + '\',' + idx + ')" style="width:100%;padding:14px;border-radius:13px;border:none;background:linear-gradient(135deg,#166534,#15803d);color:#fff;font-weight:700;font-size:15px;cursor:pointer;">✅ Terminar y continuar →</button>' +
      '</div>';
  }
  return '<button class="btn-primary" onclick="window.afterSubmit(' + idx + ')">Siguiente</button>';
}

function buildRTGWidget(q, idx) {
  const items = _answers[q.id] || [];
  const editing = _editRTGState[idx];
  let html = '<div class="rtg-list" id="rtgList_' + idx + '">';
  if (items.length === 0) {
    html += '<p style="color:#9ca3af;font-size:13px;margin:4px 0;">Sin dianas añadidas aún.</p>';
  } else {
    items.forEach(function(item, ii) {
      const r = calcRiskPart(item.fallo, item.impacto, item.consec);
      const col = (window.RISK_COLORS || {})[r.level] || '#15803d';
      html += '<div class="rtg-item" style="border-left:4px solid ' + col + ';padding:8px 10px;margin:4px 0;background:#1f2937;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:13px;">' + (item.diana||'Diana') + ' — <b style="color:' + col + '">' + r.level.toUpperCase() + '</b></span>' +
        '<div style="display:flex;gap:6px;">' +
        '<button class="btn-xs" onclick="window.editRiskTarget(' + idx + ',' + ii + ')">✏️</button>' +
        '<button class="btn-xs btn-danger" onclick="window.removeRiskTarget(' + idx + ',' + ii + ')">🗑️</button>' +
        '</div>' +
        '</div>';
    });
  }
  html += '</div>';

  if (editing) {
    const tv = _tempRiskTarget[idx] || {};
    html += '<div class="rtg-editor" id="rtgEditor_' + idx + '" style="background:#111827;border:1px solid #374151;border-radius:8px;padding:12px;margin-top:10px;">' +
      '<p style="font-size:13px;font-weight:600;margin:0 0 8px;">Diana / Blanco de impacto</p>' +
      '<input type="text" id="rtgDiana_'+idx+'" class="form-input" placeholder="Ej: Vía peatonal" value="'+(tv.diana||'')+'" style="margin-bottom:8px;" />' +

      '<p style="font-size:12px;color:#9ca3af;margin:4px 0;">Prob. de Fallo</p>' +
      '<select id="rtgFallo_'+idx+'" class="form-input" onchange="window.updateLiveMatrices('+idx+')" style="margin-bottom:6px;">' +
        '<option value="">— Selecciona —</option>' +
        ['Inminente','Probable','Posible','Improbable'].map(function(o) {
          return '<option value="'+o+'"'+(tv.fallo===o?' selected':'')+'>'+o+'</option>';
        }).join('') +
      '</select>' +

      '<p style="font-size:12px;color:#9ca3af;margin:4px 0;">Prob. Impacto a Diana</p>' +
      '<select id="rtgImpacto_'+idx+'" class="form-input" onchange="window.updateLiveMatrices('+idx+')" style="margin-bottom:6px;">' +
        '<option value="">— Selecciona —</option>' +
        ['Muy bajo','Bajo','Medio','Alto'].map(function(o) {
          return '<option value="'+o+'"'+(tv.impacto===o?' selected':'')+'>'+o+'</option>';
        }).join('') +
      '</select>' +

      '<div id="liveM1_'+idx+'"></div>' +

      '<p style="font-size:12px;color:#9ca3af;margin:4px 0;">Consecuencias</p>' +
      '<select id="rtgConsec_'+idx+'" class="form-input" onchange="window.updateLiveMatrices('+idx+')" style="margin-bottom:6px;">' +
        '<option value="">— Selecciona —</option>' +
        ['Insignificante','Menor','Significativa','Severa'].map(function(o) {
          return '<option value="'+o+'"'+(tv.consec===o?' selected':'')+'>'+o+'</option>';
        }).join('') +
      '</select>' +

      '<div id="liveM2_'+idx+'"></div>' +
      '<div id="liveResult_'+idx+'" style="font-weight:700;font-size:14px;margin:6px 0;"></div>' +

      '<input type="text" id="rtgNotas_'+idx+'" class="form-input" placeholder="Notas opcionales" value="'+(tv.notas||'')+'" style="margin-bottom:8px;margin-top:4px;" />' +

      '<div style="display:flex;gap:8px;">' +
        (editing.isNew
          ? '<button class="btn-primary" onclick="window.addRiskTarget('+idx+')">➕ Añadir Diana</button>'
          : '<button class="btn-primary" onclick="window.updateRiskTarget('+idx+','+editing.itemIdx+')">💾 Guardar</button>') +
        '<button class="btn-secondary" onclick="window.cancelEditRiskTarget('+idx+')">Cancelar</button>' +
      '</div>' +
    '</div>';
  } else {
    html += '<div style="display:flex;gap:8px;margin-top:8px;">' +
      '<button class="btn-secondary" onclick="window.startEditRiskTarget('+idx+')">➕ Añadir Diana</button>' +
      '<button class="btn-primary" onclick="window.submitRiskTargetGroup('+idx+')">Confirmar</button>' +
      '</div>';
  }
  return html;
}

function buildQHTML(q, idx) {
  var answered = _answers.hasOwnProperty(q.id);
  var phaseLabel = (window.PHASES || [])[q.ph] ? window.PHASES[q.ph].label : 'Fase ' + q.ph;

  var answerSummary = '';
  if (answered) {
    var val = _answers[q.id];
    if (q.type === 'risk_target_group') {
      answerSummary = (val||[]).length + ' diana(s) registrada(s)';
    } else if (Array.isArray(val)) {
      answerSummary = val.join(', ');
    } else if (typeof val === 'object' && val !== null) {
      answerSummary = Object.entries(val).map(function(e) { return e[0]+': '+e[1]; }).join(' | ');
    } else {
      answerSummary = String(val);
    }
  }

  return '<div class="q-block locked" id="qblock-' + idx + '">' +
    '<span class="q-num">' + phaseLabel + ' · P' + (idx+1) + '</span>' +
    '<span class="q-label">' + q.label + (q.opt ? ' <span style="font-size:10px;background:#f3f4f6;color:#9ca3af;border-radius:4px;padding:2px 5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Opcional</span>' : '') + '</span>' +
    (q.note ? '<span class="q-note">' + q.note + '</span>' : '') +
    (answered
      ? '<div class="answer-display" id="qwidget-' + idx + '">' +
          '<span class="answer-value">' + answerSummary + '</span>' +
          '<button class="edit-btn" onclick="window.editQuestion(' + idx + ')">✏️ Editar</button>' +
        '</div>'
      : '<div id="qwidget-' + idx + '">' + buildWidget(q, idx) + '</div>'
    ) +
  '</div>';
}

function buildResultsHTML() {
  const bio = calcBio();
  const isa = calcISA(bio.isUnsafe, bio.margin);
  const answered = Object.keys(_answers).length;
  if (answered < 3) return '';
  const col = (window.RISK_COLORS || {})[isa.level] || '#15803d';
  return '<div class="results-card" style="margin-top:20px;background:#0f172a;border:2px solid ' + col + ';border-radius:12px;padding:18px;">' +
    '<h3 style="color:' + col + ';margin:0 0 8px;">Riesgo ISA: ' + (isa.level||'').toUpperCase() + '</h3>' +
    '<p style="color:#9ca3af;font-size:13px;margin:0 0 12px;">Probabilidad combinada global: ' + (isa.probComb||'').replace('_',' ') + '</p>' +
    (bio.valid
      ? '<p style="font-size:13px;color:#d1d5db;margin:4px 0;">🔬 Rinntech: t_req=' + (bio.t_req?.toFixed(2)||'—') + ' cm' +
          (bio.margin !== null ? ' | Margen: ' + bio.margin.toFixed(1) + '%' : '') +
          (bio.isUnsafe ? ' ⚠️ CRÍTICO' : ' ✅ OK') + '</p>'
      : '') +
    '<button class="btn-primary" onclick="window.showCompleteScreen()" style="margin-top:12px;width:100%;">Ver Resultados Completos</button>' +
  '</div>';
}

function unlockUpTo(targetIdx) {
  var qs = window.QS || [];
  for (var i = 0; i < qs.length; i++) {
    var block = document.getElementById('qblock-' + i);
    if (!block) continue;
    if (i < targetIdx) {
      block.className = 'q-block answered';
    } else if (i === targetIdx) {
      block.className = 'q-block current';
    } else {
      block.className = 'q-block locked';
    }
  }
}

function buildForm() {
  var container = document.getElementById('formScroll');
  if (!container) return;
  var html = '';
  var lastPh = -1;
  (window.QS || []).forEach(function(q, idx) {
    if (q.ph !== lastPh) {
      var ph = (window.PHASES || [])[q.ph] || {};
      html += '<div class="phase-hdr">' +
        '<span style="font-size:16px">' + (ph.icon||'') + '</span>' +
        '<span class="fw-700 text-base">' + (ph.label||('Fase ' + q.ph)) + '</span>' +
        '</div>';
      lastPh = q.ph;
    }
    html += buildQHTML(q, idx);
  });
  html += '<div id="formResultsArea" style="padding:16px">' + buildResultsHTML() + '</div>';
  container.innerHTML = html;

  // Find first unanswered question and unlock to it
  var firstUnanswered = 0;
  for (var i = 0; i < (window.QS||[]).length; i++) {
    if (!_answers.hasOwnProperty(window.QS[i].id)) { firstUnanswered = i; break; }
    firstUnanswered = i + 1;
  }
  unlockUpTo(Math.min(firstUnanswered, (window.QS||[]).length - 1));

  updateProgress();
  populateDataLists();
}

// ── SUBMIT HANDLERS ──

function submitChoice(idx, encVal) {
  const q = window.QS[idx];
  if (!q) return;
  _answers[q.id] = encVal;
  afterSubmit(idx);
}

function toggleMulti(idx, val) {
  const q = window.QS[idx];
  if (!q) return;
  if (!_multiSel[q.id]) _multiSel[q.id] = [];
  const arr = _multiSel[q.id];
  const noneVal = q.none;
  if (val === noneVal) {
    _multiSel[q.id] = [noneVal];
  } else {
    const ni = arr.indexOf(noneVal);
    if (ni > -1) arr.splice(ni, 1);
    const i = arr.indexOf(val);
    if (i > -1) arr.splice(i, 1);
    else arr.push(val);
  }
  // Re-render widget
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildWidget(q, idx);
}

function submitMulti(idx) {
  const q = window.QS[idx];
  if (!q) return;
  const sel = _multiSel[q.id] || [];
  if (sel.length === 0 && !q.opt) { window.showNotif('Selecciona al menos una opción'); return; }
  _answers[q.id] = sel.length > 0 ? sel.slice() : ['Ninguno'];
  afterSubmit(idx);
}

function submitGroup(idx) {
  const q = window.QS[idx];
  if (!q || !q.fields) return;
  const obj = {};
  q.fields.forEach(function(f, fi) {
    const el = document.getElementById('grp_' + idx + '_' + fi);
    if (el) obj[f.id] = el.value;
  });
  _answers[q.id] = obj;
  // Also store individual fields in _answers for Rinntech access
  q.fields.forEach(function(f) {
    if (obj[f.id] !== undefined && obj[f.id] !== '') _answers[f.id] = obj[f.id];
  });
  afterSubmit(idx);
}

function submitGroupSkip(idx) {
  const q = window.QS[idx];
  if (!q) return;
  _answers[q.id] = {};
  afterSubmit(idx);
}

function submitText(idx) {
  const q = window.QS[idx];
  if (!q) return;
  const el = document.getElementById('inp_' + idx);
  const val = el ? el.value.trim() : '';
  if (!val && !q.opt) { window.showNotif('Este campo es obligatorio'); return; }
  _answers[q.id] = val;
  afterSubmit(idx);
}

function submitTextSkip(idx) {
  const q = window.QS[idx];
  if (!q) return;
  _answers[q.id] = '';
  afterSubmit(idx);
}

function submitNumber(idx, skip) {
  const q = window.QS[idx];
  if (!q) return;
  if (skip) { _answers[q.id] = null; afterSubmit(idx); return; }
  const el = document.getElementById('inp_' + idx);
  const raw = el ? el.value : '';
  const val = parseFloat(raw);
  if (isNaN(val) && !q.opt) { window.showNotif('Ingresa un número válido'); return; }
  _answers[q.id] = isNaN(val) ? null : val;
  afterSubmit(idx);
}

function afterSubmit(idx) {
  var q = window.QS[idx];
  if (!q) return;

  // Re-render this block as answered
  var block = document.getElementById('qblock-' + idx);
  if (block) block.outerHTML = buildQHTML(q, idx);

  // Find next unanswered
  var nextIdx = -1;
  for (var i = idx + 1; i < (window.QS||[]).length; i++) {
    if (!_answers.hasOwnProperty(window.QS[i].id)) { nextIdx = i; break; }
  }

  // Apply state machine
  if (nextIdx >= 0) {
    unlockUpTo(nextIdx);
  } else {
    // All answered — mark all as answered
    for (var j = 0; j < (window.QS||[]).length; j++) {
      var b = document.getElementById('qblock-' + j);
      if (b) b.className = 'q-block answered';
    }
  }

  // Update results
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();

  updateProgress();

  // Scroll to next unanswered or results — center in the scroll container
  setTimeout(function() {
    var targetEl = nextIdx >= 0
      ? document.getElementById('qblock-' + nextIdx)
      : document.getElementById('formResultsArea');
    _scrollToFormEl(targetEl);
  }, 120);
}

function editQuestion(idx) {
  var q = window.QS[idx];
  if (!q) return;
  // Remove answer to allow re-entry
  delete _answers[q.id];
  // Clear multi state
  if (_multiSel[q.id]) _multiSel[q.id] = [];
  // Clear RTG edit state
  delete _editRTGState[idx];
  delete _tempRiskTarget[idx];

  var block = document.getElementById('qblock-' + idx);
  if (block) block.outerHTML = buildQHTML(q, idx);

  // Apply state machine — make this block current
  unlockUpTo(idx);

  // Scroll to it — center in the scroll container
  setTimeout(function() {
    _scrollToFormEl(document.getElementById('qblock-' + idx));
  }, 120);

  // Update results
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();
  updateProgress();
}

// ── RISK TARGET GROUP (Dianas) ──

function startEditRiskTarget(idx) {
  _editRTGState[idx] = { isNew: true, itemIdx: -1 };
  _tempRiskTarget[idx] = {};
  var q = window.QS[idx];
  if (!q) return;
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
}
window.startEditRiskTarget = startEditRiskTarget;

function getRtgData(idx) {
  const diana  = (document.getElementById('rtgDiana_'+idx)||{}).value || '';
  const fallo  = (document.getElementById('rtgFallo_'+idx)||{}).value || '';
  const impacto= (document.getElementById('rtgImpacto_'+idx)||{}).value || '';
  const consec = (document.getElementById('rtgConsec_'+idx)||{}).value || '';
  const notas  = (document.getElementById('rtgNotas_'+idx)||{}).value || '';
  return { diana, fallo, impacto, consec, notas };
}

function addRiskTarget(idx) {
  var q = window.QS[idx];
  if (!q) return;
  var data = getRtgData(idx);
  if (!data.diana || !data.fallo || !data.impacto || !data.consec) {
    window.showNotif('Completa todos los campos de la diana'); return;
  }
  if (!_answers[q.id]) _answers[q.id] = [];
  _answers[q.id].push(data);
  delete _editRTGState[idx];
  delete _tempRiskTarget[idx];
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();
}

function editRiskTarget(idx, itemIdx) {
  var q = window.QS[idx];
  if (!q) return;
  _editRTGState[idx] = { isNew: false, itemIdx: itemIdx };
  var item = (_answers[q.id] || [])[itemIdx] || {};
  _tempRiskTarget[idx] = Object.assign({}, item);
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
  setTimeout(function() { window.updateLiveMatrices(idx); }, 50);
}

function updateRiskTarget(idx, itemIdx) {
  var q = window.QS[idx];
  if (!q) return;
  var data = getRtgData(idx);
  if (!data.diana || !data.fallo || !data.impacto || !data.consec) {
    window.showNotif('Completa todos los campos de la diana'); return;
  }
  if (!_answers[q.id]) _answers[q.id] = [];
  _answers[q.id][itemIdx] = data;
  delete _editRTGState[idx];
  delete _tempRiskTarget[idx];
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();
}

function cancelEditRiskTarget(idx) {
  var q = window.QS[idx];
  if (!q) return;
  delete _editRTGState[idx];
  delete _tempRiskTarget[idx];
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
}

function removeRiskTarget(idx, itemIdx) {
  var q = window.QS[idx];
  if (!q) return;
  if (!_answers[q.id]) return;
  _answers[q.id].splice(itemIdx, 1);
  var widget = document.getElementById('qwidget-' + idx);
  if (widget) widget.innerHTML = buildRTGWidget(q, idx);
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();
}

function submitRiskTargetGroup(idx) {
  const q = window.QS[idx];
  if (!q) return;
  if (!_answers[q.id]) _answers[q.id] = [];
  afterSubmit(idx);
}

function updateLiveMatrices(idx) {
  const fRaw   = (document.getElementById('rtgFallo_'+idx)||{}).value || '';
  const iRaw   = (document.getElementById('rtgImpacto_'+idx)||{}).value || '';
  const cRaw   = (document.getElementById('rtgConsec_'+idx)||{}).value || '';
  const fKey   = fRaw.toLowerCase().trim();
  const iKey   = iRaw.toLowerCase().replace(/ /g,'_');
  const cKey   = cRaw.toLowerCase().replace('severa','severo').trim();

  const m1El = document.getElementById('liveM1_'+idx);
  const m2El = document.getElementById('liveM2_'+idx);
  const resEl = document.getElementById('liveResult_'+idx);

  if (m1El && fKey && iKey) m1El.innerHTML = renderM1HTML(fKey, iKey);
  else if (m1El) m1El.innerHTML = '';

  // Compute intermediate prob for M2
  const m1map = {
    inminente:  {muy_bajo:'improbable', bajo:'algo_probable', medio:'probable',      alto:'muy_probable'},
    probable:   {muy_bajo:'improbable', bajo:'improbable',    medio:'algo_probable', alto:'probable'},
    posible:    {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'algo_probable'},
    improbable: {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'improbable'}
  };
  const probComb = (m1map[fKey] || {})[iKey] || '';

  if (m2El && probComb && cKey) m2El.innerHTML = renderM2HTML(probComb, cKey);
  else if (m2El) m2El.innerHTML = '';

  if (resEl && fKey && iKey && cKey) {
    const r = calcRiskPart(fRaw, iRaw, cRaw);
    const col = (window.RISK_COLORS || {})[r.level] || '#15803d';
    resEl.innerHTML = 'Riesgo calculado: <span style="color:' + col + ';">' + r.level.toUpperCase() + '</span>';
  } else if (resEl) {
    resEl.innerHTML = '';
  }

  // Cache temp values
  if (!_tempRiskTarget[idx]) _tempRiskTarget[idx] = {};
  _tempRiskTarget[idx].fallo   = fRaw;
  _tempRiskTarget[idx].impacto = iRaw;
  _tempRiskTarget[idx].consec  = cRaw;
}

// ── V7 RTG HANDLERS (keyed by q.id string) ──

function getRtgData_v7(idx) {
  return {
    desc:    (document.getElementById('rtg-desc-'+idx)||{}).value    || '',
    ocup:    (document.getElementById('rtg-ocup-'+idx)||{}).value    || '',
    ubic:    (document.getElementById('rtg-ubic-'+idx)||{}).value    || '',
    mov:     (document.getElementById('rtg-mov-'+idx)||{}).value     || '',
    rest:    (document.getElementById('rtg-rest-'+idx)||{}).value    || '',
    fallo:   (document.getElementById('rtg-fallo-'+idx)||{}).value   || '',
    impacto: (document.getElementById('rtg-impacto-'+idx)||{}).value || '',
    consec:  (document.getElementById('rtg-consec-'+idx)||{}).value  || ''
  };
}

window.updateLiveMatrices_v7 = function(idx) {
  var fRaw = (document.getElementById('rtg-fallo-'+idx)||{}).value   || '';
  var iRaw = (document.getElementById('rtg-impacto-'+idx)||{}).value || '';
  var cRaw = (document.getElementById('rtg-consec-'+idx)||{}).value  || '';
  var fKey = fRaw.toLowerCase().trim();
  var iKey = iRaw.toLowerCase().replace(/ /g,'_');
  var cKey = cRaw.toLowerCase().replace('severa','severo').trim();
  var m1El = document.getElementById('live-m1-'+idx);
  var m2El = document.getElementById('live-m2-'+idx);
  if (m1El) m1El.innerHTML = (fKey && iKey) ? renderM1HTML(fKey, iKey) : '';
  var m1map = {
    inminente:  {muy_bajo:'improbable', bajo:'algo_probable', medio:'probable',      alto:'muy_probable'},
    probable:   {muy_bajo:'improbable', bajo:'improbable',    medio:'algo_probable', alto:'probable'},
    posible:    {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'algo_probable'},
    improbable: {muy_bajo:'improbable', bajo:'improbable',    medio:'improbable',    alto:'improbable'}
  };
  var probComb = ((m1map[fKey]||{})[iKey]) || '';
  if (m2El) m2El.innerHTML = (probComb && cKey) ? renderM2HTML(probComb, cKey) : '';
};

window.addRiskTarget_v7 = function(qid, idx) {
  var data = getRtgData_v7(idx);
  if (!data.desc || !data.fallo || !data.impacto || !data.consec) {
    window.showNotif('Completa descripción, fallo, impacto y consecuencias'); return;
  }
  if (!window._tempRiskTarget[qid]) window._tempRiskTarget[qid] = [];
  window._tempRiskTarget[qid].push(data);
  delete window._editRTGState[qid];
  var q = window.QS[idx];
  if (!q) return;
  var block = document.getElementById('qblock-'+idx);
  if (block) block.outerHTML = buildQHTML(q, idx);
  unlockUpTo(idx);
};

window.editRiskTarget_v7 = function(qid, itemIdx, idx) {
  var list = window._tempRiskTarget[qid] || [];
  var item = list[itemIdx];
  if (!item) return;
  window._editRTGState[qid] = { isEditing: true, index: itemIdx };
  var q = window.QS[idx];
  if (!q) return;
  var block = document.getElementById('qblock-'+idx);
  if (block) block.outerHTML = buildQHTML(q, idx);
  unlockUpTo(idx);
  setTimeout(function() {
    var fields = ['desc','ocup','ubic','mov','rest','fallo','impacto','consec'];
    fields.forEach(function(f) {
      var el = document.getElementById('rtg-'+f+'-'+idx);
      if (el && item[f] !== undefined) el.value = item[f];
    });
    window.updateLiveMatrices_v7(idx);
  }, 30);
};

window.updateRiskTarget_v7 = function(qid, itemIdx, idx) {
  var data = getRtgData_v7(idx);
  if (!data.desc || !data.fallo || !data.impacto || !data.consec) {
    window.showNotif('Completa descripción, fallo, impacto y consecuencias'); return;
  }
  if (!window._tempRiskTarget[qid]) window._tempRiskTarget[qid] = [];
  window._tempRiskTarget[qid][itemIdx] = data;
  delete window._editRTGState[qid];
  var q = window.QS[idx];
  if (!q) return;
  var block = document.getElementById('qblock-'+idx);
  if (block) block.outerHTML = buildQHTML(q, idx);
  unlockUpTo(idx);
};

window.cancelEditRiskTarget_v7 = function(qid, idx) {
  delete window._editRTGState[qid];
  var q = window.QS[idx];
  if (!q) return;
  var block = document.getElementById('qblock-'+idx);
  if (block) block.outerHTML = buildQHTML(q, idx);
  unlockUpTo(idx);
};

window.removeRiskTarget_v7 = function(qid, itemIdx, idx) {
  var list = window._tempRiskTarget[qid] || [];
  list.splice(itemIdx, 1);
  window._tempRiskTarget[qid] = list;
  var q = window.QS[idx];
  if (!q) return;
  var block = document.getElementById('qblock-'+idx);
  if (block) block.outerHTML = buildQHTML(q, idx);
  unlockUpTo(idx);
  var resultsArea = document.getElementById('formResultsArea');
  if (resultsArea) resultsArea.innerHTML = buildResultsHTML();
};

window.submitRiskTargetGroup_v7 = function(qid, idx) {
  _answers[qid] = (window._tempRiskTarget[qid] || []).slice();
  afterSubmit(idx);
};

// ── GPS ──

function captureGPS(idx) {
  _activeGpsIdx = idx;
  if (!navigator.geolocation) { window.showNotif('Geolocalización no disponible'); return; }
  const statusEl = document.getElementById('gpsStatus_' + idx);
  if (statusEl) statusEl.textContent = '⏳ Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      _gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      if (statusEl) statusEl.textContent = '📍 ' + _gpsCoords.lat.toFixed(5) + ', ' + _gpsCoords.lng.toFixed(5) + ' (±' + Math.round(_gpsCoords.acc) + 'm)';
      window.showNotif('📍 GPS capturado');
    },
    function(err) {
      if (statusEl) statusEl.textContent = '❌ Error GPS: ' + err.message;
      window.showNotif('Error GPS: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function openMapPicker(idx) {
  _activeGpsIdx = idx;
  var modal = document.getElementById('mapPickerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mapPickerModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#000;';
    modal.innerHTML =
      '<div style="background:#111827;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="color:#f9fafb;font-weight:600;">Selecciona ubicación en el mapa</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="window.confirmMapPicker()" style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">✅ Confirmar</button>' +
          '<button onclick="window.closeMapPicker()" style="background:#374151;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">✖ Cerrar</button>' +
        '</div>' +
      '</div>' +
      '<div id="mapPickerContainer" style="flex:1;"></div>' +
      '<div id="mapPickerCoords" style="background:#111827;color:#9ca3af;padding:8px 16px;font-size:12px;text-align:center;">Haz clic en el mapa para marcar la posición</div>';
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';

  setTimeout(function() {
    if (_pickerMapInstance) {
      _pickerMapInstance.remove();
      _pickerMapInstance = null;
    }
    if (typeof L === 'undefined') { window.showNotif('Leaflet no disponible'); return; }
    const startLat = (_gpsCoords && _gpsCoords.lat) || 4.6097;
    const startLng = (_gpsCoords && _gpsCoords.lng) || -74.0817;
    const map = L.map('mapPickerContainer').setView([startLat, startLng], 15);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri',
      maxZoom: 20
    }).addTo(map);
    _pickerMapInstance = map;
    var marker = null;
    if (_gpsCoords) {
      marker = L.marker([_gpsCoords.lat, _gpsCoords.lng]).addTo(map);
    }
    map.on('click', function(e) {
      if (marker) map.removeLayer(marker);
      marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
      _pickerMapInstance._pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      const coordsEl = document.getElementById('mapPickerCoords');
      if (coordsEl) coordsEl.textContent = '📍 ' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    });
    if (_gpsCoords) {
      _pickerMapInstance._pendingLatLng = { lat: _gpsCoords.lat, lng: _gpsCoords.lng };
    }
  }, 100);
}

function closeMapPicker() {
  const modal = document.getElementById('mapPickerModal');
  if (modal) modal.style.display = 'none';
  if (_pickerMapInstance) { _pickerMapInstance.remove(); _pickerMapInstance = null; }
}

function confirmMapPicker() {
  if (!_pickerMapInstance || !_pickerMapInstance._pendingLatLng) {
    window.showNotif('Haz clic en el mapa primero'); return;
  }
  const ll = _pickerMapInstance._pendingLatLng;
  _gpsCoords = { lat: ll.lat, lng: ll.lng, acc: 0 };
  const statusEl = document.getElementById('gpsStatus_' + _activeGpsIdx);
  if (statusEl) statusEl.textContent = '📍 ' + _gpsCoords.lat.toFixed(5) + ', ' + _gpsCoords.lng.toFixed(5) + ' (mapa)';
  // Invoke wizard callback if picker was opened from wizard
  if (typeof window._mapPickerCallback === 'function') {
    window._mapPickerCallback(ll.lat, ll.lng);
    window._mapPickerCallback = null;
  }
  window.showNotif('📍 Ubicación del mapa guardada');
  closeMapPicker();
}

// ── PROGRESS ──

function updateProgress() {
  const total = (window.QS || []).length;
  const answered = (window.QS || []).filter(function(q) { return _answers.hasOwnProperty(q.id); }).length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  const bar = document.getElementById('progFill');
  const counter = document.getElementById('progCount');
  const phaseLabel = document.getElementById('progLabel');

  if (bar) bar.style.width = pct + '%';
  if (counter) counter.textContent = answered + ' / ' + total + ' (' + pct + '%)';

  // Determine current phase
  var currentPhase = 0;
  for (var i = 0; i < (window.QS||[]).length; i++) {
    if (!_answers.hasOwnProperty(window.QS[i].id)) {
      currentPhase = window.QS[i].ph;
      break;
    }
    currentPhase = window.QS[i].ph;
  }
  if (phaseLabel && window.PHASES && window.PHASES[currentPhase]) {
    phaseLabel.textContent = window.PHASES[currentPhase].icon + ' ' + window.PHASES[currentPhase].label;
  }
}

// ── COMPLETE SCREEN ──

function showCompleteScreen() {
  var bio   = calcBio();
  var isa   = calcISA(bio.isUnsafe, bio.margin);
  var recs  = buildRecs(isa, bio);

  // Risk color map (light-theme palette)
  var riskBg  = { bajo:'#f0fdf4', moderado:'#fefce8', alto:'#fff7ed', extremo:'#fef2f2' };
  var riskBdr = { bajo:'#86efac', moderado:'#fde047', alto:'#fdba74', extremo:'#fca5a5' };
  var riskClr = { bajo:'#166534', moderado:'#854d0e', alto:'#9a3412', extremo:'#991b1b' };
  var riskLbl = { bajo:'BAJO',    moderado:'MODERADO', alto:'ALTO',   extremo:'EXTREMO' };

  var lvl    = isa.level || 'bajo';
  var bg     = riskBg[lvl]  || '#f0fdf4';
  var bdr    = riskBdr[lvl] || '#86efac';
  var clr    = riskClr[lvl] || '#166534';
  var lbl    = riskLbl[lvl] || lvl.toUpperCase();

  // Section badges
  function secBadge(level) {
    var c = riskClr[level] || '#166534';
    var b = riskBg[level]  || '#f0fdf4';
    return '<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:' + b + ';color:' + c + ';font-size:11px;font-weight:800;letter-spacing:.04em">' + (riskLbl[level]||'—') + '</span>';
  }

  // Rinntech section
  var bioHtml = '';
  if (bio.valid) {
    var mOk  = !bio.isUnsafe;
    var mClr = mOk ? '#166534' : '#991b1b';
    var mBg  = mOk ? '#f0fdf4' : '#fef2f2';
    var mLbl = mOk ? 'OK ✅' : 'CRÍTICO ⚠️';
    bioHtml =
      '<div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px;margin-bottom:14px;">' +
        '<div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#7a746e;margin-bottom:10px;">🔬 Rinntech APO</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12px;color:#3d3830;">' +
          '<div style="color:#7a746e">Altura de fuerza (Hf)</div><div style="font-weight:700">' + (bio.Hf ? bio.Hf.toFixed(1) : '—') + ' cm</div>' +
          '<div style="color:#7a746e">t_req mínima</div><div style="font-weight:700">' + (bio.t_req ? bio.t_req.toFixed(2) : '—') + ' cm</div>' +
          '<div style="color:#7a746e">t_actual medida</div><div style="font-weight:700">' + (bio.tAct > 0 ? bio.tAct.toFixed(2) + ' cm' : 'No medida') + '</div>' +
          (bio.margin !== null
            ? '<div style="color:#7a746e">Margen seguridad</div><div style="font-weight:800;color:' + mClr + ';background:' + mBg + ';border-radius:6px;padding:1px 7px;display:inline-block">' + bio.margin.toFixed(1) + '% — ' + mLbl + '</div>'
            : '') +
        '</div>' +
      '</div>';
  }

  // Recommendations
  var recsHtml = recs.map(function(r) {
    return '<div style="border-left:4px solid ' + r.c + ';padding:9px 12px;background:#faf9f5;border-radius:6px;margin:6px 0;font-size:13px;color:#1a1a1a;line-height:1.45">' + r.t + '</div>';
  }).join('');

  var arbol   = _answers['arbolId']   || window._wizArbolId   || 'Sin ID';
  var especie = _answers['especie']   || window._wizEspecie   || 'Desconocida';
  var cliente = _answers['cliente']   || window._wizCliente   || (window.APP && window.APP.activeClient) || '—';
  var evalr   = _answers['evaluador'] || window._wizEvaluador || (window.APP && window.APP.activeEngineer) || '—';
  var gpsStr  = _gpsCoords ? _gpsCoords.lat.toFixed(5) + ', ' + _gpsCoords.lng.toFixed(5) : 'Sin GPS';
  var now     = new Date().toLocaleString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  var html =
    '<div id="completeScreen" style="position:fixed;inset:0;z-index:8000;overflow-y:auto;background:#faf9f5;font-family:\'IBM Plex Sans\',sans-serif;">' +

      // ── Header ──
      '<div style="position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #e5e0d5;padding:14px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 6px rgba(0,0,0,.06)">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:#0f3320;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📋</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:15px;font-weight:800;color:#0f3320;line-height:1.2">Resultados ISA TRAQ</div>' +
          '<div style="font-size:11px;color:#7a746e">' + arbol + ' · ' + especie + '</div>' +
        '</div>' +
        '<button onclick="window.closeComplete()" style="width:34px;height:34px;border-radius:50%;background:#f4f1eb;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#3d3830;flex-shrink:0">✕</button>' +
      '</div>' +

      '<div style="max-width:540px;margin:0 auto;padding:16px 16px 100px;">' +

        // ── Risk badge ──
        '<div style="background:' + bg + ';border:2px solid ' + bdr + ';border-radius:18px;padding:22px 16px;text-align:center;margin-bottom:14px;">' +
          '<div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + clr + ';opacity:.7;margin-bottom:6px">RIESGO ISA TRAQ GLOBAL</div>' +
          '<div style="font-size:48px;font-weight:900;color:' + clr + ';letter-spacing:-.5px;line-height:1">' + lbl + '</div>' +
          '<div style="font-size:12px;color:' + clr + ';opacity:.75;margin-top:6px">Probabilidad combinada: ' + (isa.probComb || '').replace(/_/g,' ') + '</div>' +
        '</div>' +

        // ── Section breakdown ──
        '<div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px;margin-bottom:14px;">' +
          '<div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#7a746e;margin-bottom:12px">Desglose por sección</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">' +
            '<div style="background:#faf9f5;border-radius:10px;padding:10px 4px;">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#aaa;margin-bottom:6px">COPA</div>' +
              secBadge(isa.rCopa.level) +
            '</div>' +
            '<div style="background:#faf9f5;border-radius:10px;padding:10px 4px;">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#aaa;margin-bottom:6px">TRONCO</div>' +
              secBadge(isa.rTronco.level) +
            '</div>' +
            '<div style="background:#faf9f5;border-radius:10px;padding:10px 4px;">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#aaa;margin-bottom:6px">RAÍCES</div>' +
              secBadge(isa.rRaices.level) +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── ID info ──
        '<div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px;margin-bottom:14px;">' +
          '<div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#7a746e;margin-bottom:10px">Identificación</div>' +
          '<div style="display:grid;grid-template-columns:auto 1fr;gap:5px 16px;font-size:13px;">' +
            '<span style="color:#7a746e;font-weight:600">ID Árbol</span><span style="font-weight:700;color:#0f3320">' + arbol + '</span>' +
            '<span style="color:#7a746e;font-weight:600">Especie</span><span style="font-weight:700">' + especie + '</span>' +
            '<span style="color:#7a746e;font-weight:600">Cliente</span><span>' + cliente + '</span>' +
            '<span style="color:#7a746e;font-weight:600">Evaluador</span><span>' + evalr + '</span>' +
            '<span style="color:#7a746e;font-weight:600">GPS</span><span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px">' + gpsStr + '</span>' +
            '<span style="color:#7a746e;font-weight:600">Fecha</span><span style="font-size:12px">' + now + '</span>' +
          '</div>' +
        '</div>' +

        bioHtml +

        // ── Recommendations ──
        '<div style="margin-bottom:16px;">' +
          '<div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#7a746e;margin-bottom:8px">Recomendaciones</div>' +
          recsHtml +
        '</div>' +

        // ── Error area ──
        '<div id="cs-error" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px;color:#991b1b;font-weight:600"></div>' +

        // ── Save button ──
        '<button id="csSaveBtn" onclick="window.saveAssessment()" ' +
          'style="width:100%;padding:16px;background:linear-gradient(135deg,#166534,#15803d);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(22,101,52,.35);letter-spacing:.02em;font-family:\'IBM Plex Sans\',sans-serif;">' +
          '💾 Guardar Evaluación' +
        '</button>' +

      '</div>' +
    '</div>';

  var el = document.getElementById('completeScreen');
  if (el) el.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeComplete() {
  var el = document.getElementById('completeScreen');
  if (el) el.remove();
}

async function saveAssessment() {
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }
  const bio = calcBio();
  const isa = calcISA(bio.isUnsafe, bio.margin);
  // Build doc, replacing any undefined with null so Firebase accepts it
  function _clean(v) { return (v === undefined) ? null : v; }
  const doc = {
    timestamp:   Date.now(),
    arbolId:     _answers['arbolId'] || window._wizArbolId || 'Sin ID',
    especie:     _answers['especie'] || window._wizEspecie || 'Desconocida',
    evaluador:   _answers['evaluador'] || window._wizEvaluador || (window.APP && window.APP.activeEngineer) || '',
    cliente:     _answers['cliente'] || window._wizCliente || (window.APP && window.APP.activeClient) || '',
    gps:         _gpsCoords || null,
    isaLevel:    _clean(isa.level),
    isaImpacto:  _clean(isa.probComb),
    bioMargin:   _clean(bio.margin),
    bioCritical: _clean(bio.isUnsafe),
    tReq:        bio.valid ? _clean(bio.t_req) : null,
    tActual:     _clean(bio.tAct) || null,
    answers:     JSON.parse(JSON.stringify(_answers, function(k,v){ return v === undefined ? null : v; }))
  };
  try {
    const btn = document.getElementById('csSaveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }
    await window.FB.pushEval(doc);
    window.showNotif('💾 Evaluación guardada ✅');
    window.closeComplete();
    window.resetFormFn(true);
    window.switchTab('home');
    setTimeout(function() {
      if (window.refreshHomeMap) window.refreshHomeMap();
      if (window.homeRenderPanel) window.homeRenderPanel();
    }, 300);
  } catch(e) {
    var errDiv = document.getElementById('cs-error');
    if (errDiv) {
      errDiv.textContent = '❌ Error al guardar: ' + (e.message || 'Intenta de nuevo');
      errDiv.style.display = 'block';
      errDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.showNotif('❌ Error al guardar: ' + (e.message || 'Intenta de nuevo'));
    const btn = document.getElementById('csSaveBtn');
    if (btn) { btn.textContent = '💾 Guardar Evaluación'; btn.disabled = false; }
  }
}

// ── RESET ──

function resetForm(keepClient) {
  const savedCliente  = keepClient ? (_answers['cliente']   || '') : '';
  const savedEval     = keepClient ? (_answers['evaluador'] || '') : '';
  _answers       = {};
  _gpsCoords     = null;
  _multiSel      = {};
  _tempRiskTarget= {};
  _editRTGState  = {};
  _editingVal    = {};
  _activeGpsIdx  = -1;
  _assessmentDone= false;
  if (keepClient) {
    if (savedCliente)  _answers['cliente']   = savedCliente;
    if (savedEval)     _answers['evaluador'] = savedEval;
  }
  // Pre-populate from APP state if available
  if (window.APP) {
    if (!_answers['cliente'] && window.APP.activeClient) _answers['cliente'] = window.APP.activeClient;
  }
  // Evaluador is ALWAYS the logged-in account name — never from localStorage or manual input
  var authName = (window._AUTH && window._AUTH.userData && window._AUTH.userData.nombre)
    || (window._AUTH && window._AUTH.userData && window._AUTH.userData.email)
    || (window.APP && window.APP.activeEngineer)
    || '';
  if (authName) _answers['evaluador'] = authName;
}

// ── POPULATE DATALISTS ──

function populateDataLists() {
  const dbAll = window._dbAll || (window.APP && window.APP._dbAll) || [];
  if (!dbAll.length) return;

  const clients   = [...new Set(dbAll.map(function(r) { return r.cliente; }).filter(Boolean))];
  const species   = [...new Set(dbAll.map(function(r) { return r.especie; }).filter(Boolean))];
  const evals     = [...new Set(dbAll.map(function(r) { return r.evaluador; }).filter(Boolean))];

  const fill = function(listId, items) {
    const dl = document.getElementById(listId);
    if (!dl) return;
    dl.innerHTML = items.map(function(v) { return '<option value="' + v + '">'; }).join('');
  };
  fill('clienteList',   clients);
  fill('especieList',   species);
  fill('evaluadorList', evals);
}

// ── TREE WIZARD ──

var _wizStep = 1;
var _wizPhotos = [];  // { file, previewUrl }
var _wizDocs   = [];  // { file }
var _wizGPS    = null;

function openTreeWizard() {
  _wizStep   = 1;
  _wizPhotos = [];
  _wizDocs   = [];
  _wizGPS    = null;

  // Pre-fill from APP state
  var clientVal = (window.APP && window.APP.activeClient) || '';
  var authName  = (window._AUTH && window._AUTH.userData && window._AUTH.userData.nombre)
    || (window._AUTH && window._AUTH.userData && window._AUTH.userData.email)
    || (window.APP && window.APP.activeEngineer) || '';
  var el;
  el = document.getElementById('wiz-arbolId');   if (el) el.value = '';
  el = document.getElementById('wiz-especie');   if (el) el.value = '';
  el = document.getElementById('wiz-cliente');   if (el) el.value = clientVal;
  el = document.getElementById('wiz-evaluador'); if (el) el.value = authName;
  // Update read-only display
  el = document.getElementById('wiz-evaluador-display');
  if (el) el.textContent = authName || 'Sin sesión activa';

  var gpsDisplay = document.getElementById('wiz-gps-display');
  if (gpsDisplay) gpsDisplay.style.display = 'none';
  var photosPreview = document.getElementById('wiz-photos-preview');
  if (photosPreview) photosPreview.innerHTML = '';
  var docsPreview = document.getElementById('wiz-docs-preview');
  if (docsPreview) docsPreview.innerHTML = '';

  _wizRenderStep(1);

  var modal = document.getElementById('treeWizardModal');
  if (modal) modal.classList.add('open');
}

function closeTreeWizard() {
  var modal = document.getElementById('treeWizardModal');
  if (modal) modal.classList.remove('open');
}

function _wizRenderStep(step) {
  _wizStep = step;
  var labels = ['Paso 1 · Identificación', 'Paso 2 · Ubicación GPS', 'Paso 3 · Fotos y Documentos'];
  var lbl = document.getElementById('wiz-step-label');
  if (lbl) lbl.textContent = labels[step - 1] || '';

  // Step pills
  [1, 2, 3].forEach(function (s) {
    var pill = document.querySelector('[data-step="' + s + '"]');
    if (pill) pill.style.background = s <= step ? '#22c55e' : 'rgba(255,255,255,.25)';
  });

  // Panels
  [1, 2, 3].forEach(function (s) {
    var panel = document.getElementById('wiz-panel-' + s);
    if (panel) panel.style.display = s === step ? '' : 'none';
  });

  // Buttons
  var back = document.getElementById('wiz-btn-back');
  var next = document.getElementById('wiz-btn-next');
  var saveBasicRow = document.getElementById('wiz-save-basic-row');
  if (back) back.style.display = step > 1 ? '' : 'none';
  if (saveBasicRow) saveBasicRow.style.display = step === 3 ? '' : 'none';
  if (next) {
    if (step === 3) {
      next.textContent = '🌳 Iniciar Formulario ISA →';
      next.style.background = '#166534';
    } else {
      next.textContent = 'Siguiente →';
      next.style.background = '#0f3320';
    }
  }

  // Focus first field on step 1
  if (step === 1) {
    setTimeout(function () {
      var inp = document.getElementById('wiz-arbolId');
      if (inp) inp.focus();
    }, 50);
  }

  // Auto-trigger GPS + map on step 2 (only if no GPS set yet)
  if (step === 2 && !_wizGPS) {
    setTimeout(function () {
      window.wizAutoGPSAndMap && window.wizAutoGPSAndMap();
    }, 200);
  }

  // If step 2 already has GPS, show the confirmed state
  if (step === 2 && _wizGPS) {
    var actions = document.getElementById('wiz-gps-actions');
    var display = document.getElementById('wiz-gps-display');
    if (actions) actions.style.display = 'none';
    if (display) display.style.display = '';
  }
}

window.wizNext = function () {
  if (_wizStep === 1) {
    var arbolId = (document.getElementById('wiz-arbolId') || {}).value || '';
    if (!arbolId.trim()) {
      window.showNotif('⚠️ El ID del árbol es obligatorio');
      document.getElementById('wiz-arbolId') && document.getElementById('wiz-arbolId').focus();
      return;
    }
    _wizRenderStep(2);
  } else if (_wizStep === 2) {
    _wizRenderStep(3);
  } else if (_wizStep === 3) {
    _wizLaunchForm();
  }
};

window.wizPrev = function () {
  if (_wizStep > 1) _wizRenderStep(_wizStep - 1);
};

// ── WEATHER HELPERS ──

var _WX_CODES = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'🌨️',75:'🌨️',80:'🌦️',81:'🌧️',82:'⛈️',
  95:'⛈️',96:'⛈️',99:'⛈️'
};
function _degToCompass(deg) {
  var dirs = ['N','NE','E','SE','S','SO','O','NO'];
  return dirs[Math.round(deg / 45) % 8];
}

function _wizShowGPS(lat, lng, acc, source) {
  _wizGPS = { lat: lat, lng: lng, acc: acc || 0 };
  var loading = document.getElementById('wiz-loc-loading');
  var actions = document.getElementById('wiz-gps-actions');
  var display = document.getElementById('wiz-gps-display');
  var text    = document.getElementById('wiz-gps-text');
  if (loading)  loading.style.display  = 'none';
  if (actions)  actions.style.display  = 'none';
  if (display)  display.style.display  = '';
  if (text) text.textContent = lat.toFixed(6) + ', ' + lng.toFixed(6) +
    (acc ? ' (±' + acc + 'm)' : ' (' + source + ')');
  // Pre-fill gps answer
  _answers['gps'] = lat.toFixed(7) + ',' + lng.toFixed(7);
  // Fetch weather
  _wizFetchWeather(lat, lng);
}

function _wizFetchWeather(lat, lng) {
  var wLoading = document.getElementById('wiz-weather-loading');
  var wCard    = document.getElementById('wiz-weather-card');
  if (wLoading) wLoading.style.display = '';
  if (wCard)    wCard.style.display    = 'none';

  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) +
    '&longitude=' + lng.toFixed(4) +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code' +
    '&wind_speed_unit=ms&timezone=auto';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var cur = data.current || {};
      var temp    = cur.temperature_2m   != null ? Math.round(cur.temperature_2m) + '°C' : '—';
      var hum     = cur.relative_humidity_2m != null ? cur.relative_humidity_2m + '%' : '—';
      var wind    = cur.wind_speed_10m   != null ? cur.wind_speed_10m.toFixed(1) + ' m/s' : '—';
      var dirDeg  = cur.wind_direction_10m;
      var dirComp = dirDeg != null ? _degToCompass(dirDeg) : '—';
      var code    = cur.weather_code != null ? cur.weather_code : 0;
      var icon    = _WX_CODES[code] || '🌡️';
      var now     = new Date().toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});

      // Store in answers
      _answers['weatherData'] = { temp: cur.temperature_2m, hum: cur.relative_humidity_2m,
        windSpeed: cur.wind_speed_10m, windDir: dirDeg, windDirComp: dirComp };
      // Pre-fill ISA TRAQ wind field
      if (dirComp !== '—') _answers['viento_dom'] = dirComp + ' (' + (dirDeg||0) + '°)';

      // Update UI
      var el;
      el = document.getElementById('wiz-wx-icon'); if (el) el.textContent = icon;
      el = document.getElementById('wiz-wx-time'); if (el) el.textContent = now;
      el = document.getElementById('wiz-wx-temp'); if (el) el.textContent = temp;
      el = document.getElementById('wiz-wx-hum');  if (el) el.textContent = hum;
      el = document.getElementById('wiz-wx-wind'); if (el) el.textContent = wind;
      el = document.getElementById('wiz-wx-dir');  if (el) el.textContent = dirComp;

      if (wLoading) wLoading.style.display = 'none';
      if (wCard)    wCard.style.display    = '';
    })
    .catch(function() {
      if (wLoading) wLoading.style.display = 'none';
    });
}

// Primary action: auto-GPS then open map picker centered there
window.wizAutoGPSAndMap = function () {
  if (!navigator.geolocation) {
    window.showNotif('GPS no disponible en este dispositivo');
    return;
  }
  var loading    = document.getElementById('wiz-loc-loading');
  var loadingTxt = document.getElementById('wiz-loc-loading-txt');
  var actions    = document.getElementById('wiz-gps-actions');
  if (loading)    loading.style.display  = '';
  if (loadingTxt) loadingTxt.textContent = 'Obteniendo tu ubicación...';
  if (actions)    actions.style.display  = 'none';

  navigator.geolocation.getCurrentPosition(function (pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    var acc = Math.round(pos.coords.accuracy);

    if (loadingTxt) loadingTxt.textContent = 'Abriendo mapa...';

    // Set callback so map picker confirm updates Step 2
    window._mapPickerCallback = function (pickedLat, pickedLng) {
      _wizShowGPS(pickedLat, pickedLng, 0, 'mapa');
    };

    // Open map picker, centered on user's GPS
    if (typeof window.openMapPicker === 'function') {
      window.openMapPicker(-1, { lat: lat, lng: lng });
    }

    // Hide loading — map is opening
    if (loading) loading.style.display = 'none';
    if (actions) actions.style.display = '';

  }, function (err) {
    // GPS failed — fall back to opening map at default location
    if (loading) loading.style.display = 'none';
    if (actions) actions.style.display = '';
    window.showNotif('GPS no disponible, selecciona en el mapa');
    window._mapPickerCallback = function (pickedLat, pickedLng) {
      _wizShowGPS(pickedLat, pickedLng, 0, 'mapa');
    };
    if (typeof window.openMapPicker === 'function') {
      window.openMapPicker(-1, null);
    }
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
};

// "Ajustar en el mapa" — re-open picker with current coords
window.wizOpenMapPicker = function () {
  window._mapPickerCallback = function (lat, lng) {
    _wizShowGPS(lat, lng, 0, 'mapa');
  };
  var center = _wizGPS ? { lat: _wizGPS.lat, lng: _wizGPS.lng } : null;
  if (typeof window.openMapPicker === 'function') {
    window.openMapPicker(-1, center);
  }
};

window.wizAddPhoto = function (source) {
  var inputId = (source === 'gallery') ? 'photo-input-gallery' : 'photo-input';
  var inp = document.getElementById(inputId);
  if (!inp) return;
  inp.dataset.arbolId = '';
  inp.dataset.wizMode = '1';
  inp.value = '';
  inp.click();
};

window.wizAddDoc = function () {
  var inp = document.getElementById('file-upload-input');
  if (!inp) return;
  inp.dataset.wizMode = '1';
  inp.value = '';
  inp.click();
};

// Called from app.js handlePhotoCapture when dataset.wizMode === '1'
window.wizReceivePhoto = function (file) {
  _wizPhotos.push({ file: file, previewUrl: URL.createObjectURL(file) });
  _wizRenderPhotosPreview();
};

window.wizReceiveDoc = function (file) {
  _wizDocs.push({ file: file });
  _wizRenderDocsPreview();
};

function _wizRenderPhotosPreview() {
  var container = document.getElementById('wiz-photos-preview');
  if (!container) return;
  container.innerHTML = _wizPhotos.map(function (p, i) {
    return '<div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;flex-shrink:0">' +
      '<img src="' + p.previewUrl + '" style="width:100%;height:100%;object-fit:cover">' +
      '<button onclick="wizRemovePhoto(' + i + ')" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">✕</button>' +
    '</div>';
  }).join('');
}

function _wizRenderDocsPreview() {
  var container = document.getElementById('wiz-docs-preview');
  if (!container) return;
  container.innerHTML = _wizDocs.map(function (d, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fafaf0;border-radius:8px;border:1px solid #d97706">' +
      '<span style="font-size:14px">📄</span>' +
      '<span style="flex:1;font-size:12px;font-weight:600;color:#3d3830;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.file.name + '</span>' +
      '<button onclick="wizRemoveDoc(' + i + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px">✕</button>' +
    '</div>';
  }).join('');
}

window.wizRemovePhoto = function (i) { _wizPhotos.splice(i, 1); _wizRenderPhotosPreview(); };
window.wizRemoveDoc   = function (i) { _wizDocs.splice(i, 1); _wizRenderDocsPreview(); };

function _wizLaunchForm() {
  // Collect wizard data
  var arbolId   = ((document.getElementById('wiz-arbolId') || {}).value || '').trim().toUpperCase();
  var especie   = ((document.getElementById('wiz-especie') || {}).value || '').trim();
  var cliente   = ((document.getElementById('wiz-cliente') || {}).value || '').trim();
  var evaluador = ((document.getElementById('wiz-evaluador') || {}).value || '').trim();

  // Save weather data before resetForm clears _answers
  var savedWeather = _answers['weatherData'] || null;
  var savedViento  = _answers['viento_dom']  || '';

  // Update APP state with client/engineer
  if (window.APP) {
    if (cliente)   window.APP.activeClient   = cliente;
    if (evaluador) window.APP.activeEngineer = evaluador;
  }

  // Reset form and pre-fill answers
  resetForm(false);
  if (arbolId)   _answers['arbolId']   = arbolId;
  if (especie)   _answers['especie']   = especie;
  if (cliente)   _answers['cliente']   = cliente;
  if (evaluador) _answers['evaluador'] = evaluador;

  // Pre-fill GPS
  if (_wizGPS) {
    _gpsCoords = _wizGPS;
    _answers['gps'] = _wizGPS.lat.toFixed(7) + ',' + _wizGPS.lng.toFixed(7);
  }

  // Restore weather data saved before resetForm
  if (savedWeather) {
    _answers['weatherData'] = savedWeather;
    if (savedViento) _answers['viento_dom'] = savedViento;
  }

  // Store wizard identification data globally for saveAssessment
  window._wizArbolId   = arbolId;
  window._wizEspecie   = especie;
  window._wizCliente   = cliente;
  window._wizEvaluador = evaluador;

  // Store pending uploads for after save
  window._wizPendingPhotos = _wizPhotos.slice();
  window._wizPendingDocs   = _wizDocs.slice();

  // Close wizard, build form, switch to form view
  closeTreeWizard();
  buildForm();
  if (window.switchTab) window.switchTab('form');

  // Upload pending files in background if arbolId is set
  if (arbolId && (window._wizPendingPhotos.length || window._wizPendingDocs.length)) {
    window.showNotif('Subiendo archivos...');
    var clienteId = cliente || 'sin_cliente';
    var uploads = [];
    window._wizPendingPhotos.forEach(function (p) {
      if (window.FB && window.FB.uploadPhoto) {
        uploads.push(
          window.FB.uploadPhoto(clienteId, arbolId, p.file).then(function (res) {
            if (!_answers['photoUrls']) _answers['photoUrls'] = [];
            _answers['photoUrls'].push(res.url);
          })
        );
      }
    });
    window._wizPendingDocs.forEach(function (d) {
      if (window.FB && window.FB.uploadDoc) {
        uploads.push(
          window.FB.uploadDoc(clienteId, d.file).then(function (docInfo) {
            if (!_answers['docUrls']) _answers['docUrls'] = [];
            _answers['docUrls'].push(docInfo.url || docInfo);
          })
        );
      }
    });
    if (uploads.length) {
      Promise.all(uploads).then(function () {
        window.showNotif('📎 ' + uploads.length + ' archivo(s) adjuntados');
      }).catch(function (e) {
        console.warn('Wizard upload error:', e);
      });
    }
    window._wizPendingPhotos = [];
    window._wizPendingDocs   = [];
  }
}

// ── MANUAL RISK SELECTOR ──

window.wizShowManualRisk = function () {
  var row = document.getElementById('wiz-save-basic-row');
  if (!row) return;
  var levels = [
    { id: 'bajo',     label: '🟢 Bajo',     bg: '#065f46', border: '#34d399' },
    { id: 'moderado', label: '🟡 Moderado', bg: '#78350f', border: '#fbbf24' },
    { id: 'alto',     label: '🟠 Alto',     bg: '#9a3412', border: '#fb923c' },
    { id: 'extremo',  label: '🔴 Extremo',  bg: '#7f1d1d', border: '#f87171' }
  ];
  row.innerHTML =
    '<div style="font-size:12px;font-weight:800;color:#0f3320;margin-bottom:8px;text-align:center;letter-spacing:.5px;">¿Con qué nivel de riesgo deseas guardar este árbol?</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">' +
    levels.map(function (l) {
      return '<button onclick="wizSaveBasic(\'' + l.id + '\')" style="padding:11px 6px;background:' + l.bg + ';color:#fff;border:2px solid ' + l.border + ';border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">' + l.label + '</button>';
    }).join('') +
    '</div>' +
    '<button onclick="wizCancelManualRisk()" style="margin-top:7px;width:100%;padding:8px;background:transparent;color:#7a746e;border:1px solid #ddd;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">← Cancelar</button>';
};

window.wizCancelManualRisk = function () {
  var row = document.getElementById('wiz-save-basic-row');
  if (!row) return;
  row.innerHTML = '<button onclick="wizShowManualRisk()" style="width:100%;padding:12px;background:#065f46;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">🎯 Seleccionar riesgo de forma manual</button>';
};

// ── SAVE WITHOUT ISA FORM ──

window.wizSaveBasic = async function (manualLevel) {
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }

  var arbolId   = ((document.getElementById('wiz-arbolId') || {}).value || '').trim().toUpperCase();
  var especie   = ((document.getElementById('wiz-especie') || {}).value || '').trim();
  var cliente   = ((document.getElementById('wiz-cliente') || {}).value || '').trim();
  var evaluador = ((document.getElementById('wiz-evaluador') || {}).value || '').trim();
  var notas     = ((document.getElementById('wiz-notas') || {}).value || '').trim();

  if (!arbolId) {
    window.showNotif('⚠️ El ID del árbol es obligatorio');
    document.getElementById('wiz-arbolId') && document.getElementById('wiz-arbolId').focus();
    return;
  }

  var riskLevel = manualLevel || 'sin_evaluar';
  var doc = {
    timestamp:        Date.now(),
    arbolId:          arbolId,
    especie:          especie || 'Desconocida',
    evaluador:        evaluador || (window.APP && window.APP.activeEngineer) || '',
    cliente:          cliente || (window.APP && window.APP.activeClient) || '',
    gps:              _wizGPS ? (_wizGPS.lat.toFixed(7) + ',' + _wizGPS.lng.toFixed(7)) : null,
    isaLevel:         riskLevel,
    riskOverride:     riskLevel,
    riskSource:       'manual',
    evaluationMethod: 'manual',
    basicOnly:        true,
    notas:            notas || ''
  };

  var btn = document.querySelector('#wiz-save-basic-row button');
  if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

  try {
    var pushRef = await window.FB.pushEval(doc);
    var savedKey = pushRef && pushRef.key ? pushRef.key : null;

    // Upload pending photos and docs
    var photos = _wizPhotos.slice();
    var docs   = _wizDocs.slice();
    var clienteId = doc.cliente || 'sin_cliente';

    if ((photos.length || docs.length) && savedKey) {
      window.showNotif('Subiendo archivos...');
      var photoUrls = [];
      var docUrls   = [];
      for (var i = 0; i < photos.length; i++) {
        try {
          var res = await window.FB.uploadPhoto(clienteId, arbolId, photos[i].file);
          photoUrls.push(res.url);
        } catch(e) { console.warn('photo upload error', e); }
      }
      for (var j = 0; j < docs.length; j++) {
        try {
          var dres = await window.FB.uploadDoc(clienteId, docs[j].file);
          docUrls.push(dres.url || dres);
        } catch(e) { console.warn('doc upload error', e); }
      }
      if (photoUrls.length || docUrls.length) {
        var updates = {};
        if (photoUrls.length) updates.photoUrls = photoUrls;
        if (docUrls.length)   updates.docUrls   = docUrls;
        await window.FB.updateEval(savedKey, updates);
      }
    }

    window.showNotif('✅ Árbol guardado');
    closeTreeWizard();
    setTimeout(function () {
      if (window.refreshHomeMap) window.refreshHomeMap();
      if (window.homeRenderPanel) window.homeRenderPanel();
    }, 300);
  } catch (e) {
    window.showNotif('❌ Error: ' + e.message);
    if (btn) { btn.textContent = '🎯 Seleccionar riesgo de forma manual'; btn.disabled = false; }
  }
};

// ── START NEW TREE ──

function startNewTree() {
  openTreeWizard();
}

// ── EXPOSE ON WINDOW ──

window.getFormAnswers   = function() { return _answers; };
window.getFormGPS       = function() { return _gpsCoords; };
window.resetFormFn      = resetForm;
window.buildForm        = buildForm;
window.showCompleteScreen = showCompleteScreen;
window.closeComplete    = closeComplete;
window.saveAssessment   = saveAssessment;
window.startNewTree     = startNewTree;
window.populateDataLists= populateDataLists;
window.updateProgress   = updateProgress;
window.openTreeWizard   = openTreeWizard;
window.closeTreeWizard  = closeTreeWizard;
window._setWizGPS = function (lat, lng) {
  _wizGPS = { lat: lat, lng: lng, acc: 0 };
};

// Submit handlers
window.submitChoice     = submitChoice;
window.toggleMulti      = toggleMulti;
window.submitMulti      = submitMulti;
window.submitGroup      = submitGroup;
window.submitGroupSkip  = submitGroupSkip;
window.submitText       = submitText;
window.submitTextSkip   = submitTextSkip;
window.submitAutoEvaluador = function(idx) {
  const q = window.QS[idx];
  if (!q) return;
  // Re-read from auth to ensure freshness
  var authName = (window._AUTH && window._AUTH.userData && window._AUTH.userData.nombre)
    || (window._AUTH && window._AUTH.userData && window._AUTH.userData.email)
    || (window.APP && window.APP.activeEngineer) || '';
  _answers['evaluador'] = authName;
  afterSubmit(idx);
};
window.submitNumber     = submitNumber;
window.afterSubmit      = afterSubmit;
window.editQuestion     = editQuestion;

// Risk target group
window.addRiskTarget          = addRiskTarget;
window.editRiskTarget         = editRiskTarget;
window.updateRiskTarget       = updateRiskTarget;
window.cancelEditRiskTarget   = cancelEditRiskTarget;
window.removeRiskTarget       = removeRiskTarget;
window.submitRiskTargetGroup  = submitRiskTargetGroup;
window.updateLiveMatrices     = updateLiveMatrices;
window.getRtgData             = getRtgData;

// GPS / Map
window.captureGPS     = captureGPS;
window.openMapPicker  = openMapPicker;
window.closeMapPicker = closeMapPicker;
window.confirmMapPicker = confirmMapPicker;

// Algorithm exports (for external access if needed)
window.calcRiskPart = calcRiskPart;
window.calcBio      = calcBio;
window.calcISA      = calcISA;
window.calcSectionMax = calcSectionMax;
window.buildRecs    = buildRecs;
window.renderM1HTML = renderM1HTML;
window.renderM2HTML = renderM2HTML;
