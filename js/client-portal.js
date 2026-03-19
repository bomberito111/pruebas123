/* ═══════════════════════════════════════════
   client-portal.js — Portal del Cliente
   Bosques Urbanos · Rol "cliente"

   Muestra al cliente solo sus árboles y la
   información que el admin haya habilitado.
   Incluye chat en tiempo real con el equipo.
═══════════════════════════════════════════ */
(function () {
  'use strict';

  var _portalClienteName = '';   // nombre del cliente asignado
  var _portalClienteKey  = '';   // _fsKey del nombre
  var _portalConfig      = {};   // config global del portal
  var _portalTrees       = {};   // {arbolId: {visible, showRisk, showGPS, showPhotos, showDocs}}
  var _portalEvals       = {};   // evaluaciones filtradas para este cliente
  var _portalChatUnsub   = null; // listener chat
  var _portalTreesUnsub  = null; // listener config árboles
  var _activePortalTree  = null; // arbolId activo en detalle
  var _portalTab         = 'trees'; // 'trees' | 'chat'
  var _chatUnread        = 0;

  function fsKey(s) {
    return (s || 'sin_cliente').replace(/[.#$[\]/]/g, '_');
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 10) || '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  function riskColor(lvl) {
    return { bajo: '#15803d', moderado: '#d97706', alto: '#ea580c', extremo: '#b91c1c' }[lvl] || '#6b7280';
  }

  function riskLabel(lvl) {
    return { bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', extremo: 'Extremo' }[lvl] || '—';
  }

  function getEffRisk(ev) {
    if (ev && ev.riskOverride && ev.riskOverride.active && ev.riskOverride.level) return ev.riskOverride.level;
    return (ev && ev.isaLevel) ? ev.isaLevel : 'bajo';
  }

  // ─── PUBLIC: Initialize portal for logged-in cliente ─────────
  window.initClientPortal = function () {
    var userData = window._AUTH && window._AUTH.userData;
    if (!userData) return;
    _portalClienteName = userData.clienteAsignado || '';
    _portalClienteKey  = fsKey(_portalClienteName);

    var screen = document.getElementById('clientePortalScreen');
    if (screen) screen.style.display = 'flex';

    // Hide the normal evaluator app
    var appEl = document.getElementById('app');
    if (appEl) appEl.style.display = 'none';

    // Update header label
    var nameEl = document.getElementById('cp-client-name');
    if (nameEl) nameEl.textContent = _portalClienteName || 'Mi Portal';

    var userEl = document.getElementById('cp-user-name');
    if (userEl) userEl.textContent = userData.nombre || userData.email || '';

    // Load evaluations for this client
    _refreshPortalEvals();

    // Listen to portal config
    if (typeof window._fbOnPortalTrees === 'function') {
      if (_portalTreesUnsub) try { _portalTreesUnsub(); } catch(e){}
      _portalTreesUnsub = window._fbOnPortalTrees(_portalClienteKey, function(snap) {
        _portalTrees  = (snap && snap.val ? snap.val() : null) || {};
        _refreshPortalEvals();
        _renderPortalContent();
      });
    }

    // Listen to portal global config
    if (typeof window._fbGetPortalConfig === 'function') {
      window._fbGetPortalConfig(_portalClienteKey, function(snap) {
        _portalConfig = (snap && snap.val ? snap.val() : null) || {};
        _renderPortalContent();
      });
    }

    // Start chat listener
    _initPortalChat();

    _renderPortalContent();
  };

  function _refreshPortalEvals() {
    var db = window._dbAll || window._fbRawAll || {};
    _portalEvals = {};
    Object.keys(db).forEach(function(key) {
      var ev = db[key];
      var evClient = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
      if (evClient.toLowerCase() === _portalClienteName.toLowerCase()) {
        var arbolId = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
        // Keep latest eval per tree
        if (!_portalEvals[arbolId] || (ev.timestamp || 0) > (_portalEvals[arbolId].timestamp || 0)) {
          _portalEvals[arbolId] = Object.assign({}, ev, { _fbKey: key });
        }
      }
    });
  }

  // ─── RENDER MAIN CONTENT ──────────────────────────────────────
  function _renderPortalContent() {
    var container = document.getElementById('cp-main');
    if (!container) return;
    if (_portalTab === 'trees') {
      _renderTreeList(container);
    } else if (_portalTab === 'chat') {
      _renderChatView(container);
    }
    _updatePortalStats();
  }

  function _updatePortalStats() {
    var trees = _getVisibleTrees();
    var counts = { bajo: 0, moderado: 0, alto: 0, extremo: 0 };
    trees.forEach(function(t) {
      var r = getEffRisk(t.ev);
      counts[r] = (counts[r] || 0) + 1;
    });
    var totalEl = document.getElementById('cp-stat-total');
    if (totalEl) totalEl.textContent = trees.length;
    var extremoEl = document.getElementById('cp-stat-extremo');
    if (extremoEl) extremoEl.textContent = counts.extremo || 0;
    var altoEl = document.getElementById('cp-stat-alto');
    if (altoEl) altoEl.textContent = counts.alto || 0;
  }

  function _getVisibleTrees() {
    return Object.keys(_portalEvals).filter(function(arbolId) {
      var cfg = _portalTrees[fsKey(arbolId)];
      return !cfg || cfg.visible !== false; // visible by default
    }).map(function(arbolId) {
      return { arbolId: arbolId, ev: _portalEvals[arbolId] };
    });
  }

  // ─── TREE LIST ────────────────────────────────────────────────
  function _renderTreeList(container) {
    var trees = _getVisibleTrees();
    if (trees.length === 0) {
      container.innerHTML =
        '<div style="padding:40px 24px;text-align:center;color:#9ca3af;">' +
          '<div style="font-size:48px;margin-bottom:12px;">🌳</div>' +
          '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">Sin árboles disponibles</div>' +
          '<div style="font-size:13px;">El equipo aún no ha publicado resultados para tu cuenta.</div>' +
        '</div>';
      return;
    }

    // Sort by risk (worst first)
    var RISK_ORDER = { extremo: 4, alto: 3, moderado: 2, bajo: 1 };
    trees.sort(function(a, b) {
      return (RISK_ORDER[getEffRisk(b.ev)] || 0) - (RISK_ORDER[getEffRisk(a.ev)] || 0);
    });

    var html = '<div style="padding:12px 14px 100px;display:flex;flex-direction:column;gap:10px;">';
    trees.forEach(function(item) {
      var ev = item.ev;
      var arbolId = item.arbolId;
      var cfg = _portalTrees[fsKey(arbolId)] || {};
      var risk = getEffRisk(ev);
      var clr  = riskColor(risk);
      var showRisk = cfg.showRisk !== false && (_portalConfig.showRiskSummary !== false);
      var showGPS  = cfg.showGPS  !== false && (_portalConfig.showGPS  !== false);

      // Photos: use cfg.showPhotos if set, otherwise use ev.photoUrls (first 1)
      var photos = [];
      if (cfg.showPhotos && cfg.showPhotos.length) {
        photos = cfg.showPhotos;
      } else if (ev.photoUrls && ev.photoUrls.length) {
        photos = [ev.photoUrls[0]]; // show first photo only by default
      }

      var firstPhoto = photos[0] || null;
      var especie    = ev.especie || (ev.answers && ev.answers.especie) || 'Especie desconocida';
      var evalDate   = fmtDate(ev.timestamp || ev.ts);

      html +=
        '<div class="cp-tree-card" onclick="window._cpOpenTree(\'' + fsKey(arbolId) + '\')" ' +
          'data-arbol="' + fsKey(arbolId) + '" ' +
          'style="background:#fff;border-radius:14px;box-shadow:0 1px 6px rgba(0,0,0,.08);overflow:hidden;cursor:pointer;border:1.5px solid #f1f1f1;">';

      // Photo banner
      if (firstPhoto) {
        html += '<div style="height:130px;overflow:hidden;position:relative;">';
        html += '<img src="' + firstPhoto + '" alt="Árbol" style="width:100%;height:100%;object-fit:cover;" onerror="this.closest(\'div\').style.display=\'none\'">';
        if (photos.length > 1) {
          html += '<div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;">+' + (photos.length - 1) + ' más</div>';
        }
        if (showRisk) {
          html += '<div style="position:absolute;top:8px;left:8px;background:' + clr + ';color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;text-transform:uppercase;">' + riskLabel(risk) + '</div>';
        }
        html += '</div>';
      }

      // Card body
      html += '<div style="padding:12px 14px;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">';
      html += '<div>';
      html += '<div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:\'Fraunces\',Georgia,serif;">' + arbolId + '</div>';
      html += '<div style="font-size:11px;color:#6b7280;margin-top:1px;font-style:italic;">' + especie + '</div>';
      html += '</div>';
      if (showRisk && !firstPhoto) {
        html += '<span style="font-size:10px;font-weight:800;background:' + clr + '1a;color:' + clr + ';border:1.5px solid ' + clr + '44;padding:3px 10px;border-radius:20px;text-transform:uppercase;flex-shrink:0;">' + riskLabel(risk) + '</span>';
      }
      html += '</div>';

      // Date + GPS row
      html += '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">';
      if (evalDate) html += '<span style="font-size:10px;color:#9ca3af;">📅 ' + evalDate + '</span>';
      if (showGPS && (ev.gps || (ev.lat && ev.lng))) {
        var gpsObj = ev.gps && typeof ev.gps === 'object' ? ev.gps : null;
        var lat = gpsObj ? gpsObj.lat : ev.lat;
        var lng = gpsObj ? gpsObj.lng : ev.lng;
        if (lat && lng) {
          html += '<span style="font-size:10px;color:#0ea5e9;">📍 GPS disponible</span>';
        }
      }
      if (cfg.showDocs && cfg.showDocs.length) {
        html += '<span style="font-size:10px;color:#8b5cf6;">📁 ' + cfg.showDocs.length + ' doc' + (cfg.showDocs.length !== 1 ? 's' : '') + '</span>';
      }
      html += '</div>';

      html += '</div></div>'; // body + card
    });
    html += '</div>';
    container.innerHTML = html;
  }

  // ─── TREE DETAIL ──────────────────────────────────────────────
  window._cpOpenTree = function(arbolIdKey) {
    // Find the tree by its fsKey
    var arbolId = Object.keys(_portalEvals).find(function(aid) { return fsKey(aid) === arbolIdKey; }) || arbolIdKey;
    var ev  = _portalEvals[arbolId];
    if (!ev) return;
    var cfg = _portalTrees[fsKey(arbolId)] || {};
    _activePortalTree = arbolId;

    var modal = document.getElementById('cpTreeModal');
    var body  = document.getElementById('cpTreeModalBody');
    if (!modal || !body) return;

    var risk     = getEffRisk(ev);
    var clr      = riskColor(risk);
    var especie  = ev.especie  || (ev.answers && ev.answers.especie)  || '—';
    var evalDate = fmtDate(ev.timestamp || ev.ts);
    var evaluador= ev.evaluador|| (ev.answers && ev.answers.evaluador)|| '—';
    var notes    = ev.notes    || (ev.answers && ev.answers.notes)    || '';
    var showRisk = cfg.showRisk !== false && (_portalConfig.showRiskSummary !== false);
    var showGPS  = cfg.showGPS  !== false && (_portalConfig.showGPS !== false);

    // Photos
    var photos = [];
    if (cfg.showPhotos && cfg.showPhotos.length) {
      photos = cfg.showPhotos;
    } else if (ev.photoUrls && ev.photoUrls.length) {
      photos = [ev.photoUrls[0]];
    }

    // Docs
    var docs = (cfg.showDocs && cfg.showDocs.length) ? cfg.showDocs : [];

    var html = '';

    // Risk banner
    if (showRisk) {
      html += '<div style="padding:16px 18px;background:' + clr + ';color:#fff;text-align:center;">';
      html += '<div style="font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;">' + riskLabel(risk) + '</div>';
      html += '<div style="font-size:11px;opacity:.85;margin-top:2px;">Nivel de Riesgo ISA TRAQ</div>';
      html += '</div>';
    }

    // Photos gallery
    if (photos.length) {
      html += '<div style="padding:14px 16px 0;">';
      html += '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Fotos</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;">';
      photos.forEach(function(url, i) {
        html += '<img src="' + url + '" alt="Foto ' + (i+1) + '" ' +
          'style="width:100%;height:90px;object-fit:cover;border-radius:8px;cursor:pointer;" ' +
          'onclick="window._cpFullPhoto(\'' + url.replace(/'/g,"\\'") + '\')" ' +
          'onerror="this.style.display=\'none\'">';
      });
      html += '</div></div>';
    }

    // Info grid
    html += '<div style="padding:14px 16px;">';
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Información del Árbol</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
    var infoFields = [
      { l: 'ID Árbol', v: arbolId },
      { l: 'Especie', v: especie },
      { l: 'Fecha eval.', v: evalDate },
      { l: 'Evaluador', v: evaluador }
    ];
    infoFields.forEach(function(f) {
      if (!f.v || f.v === '—') return;
      html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;">';
      html += '<div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:2px;">' + f.l + '</div>';
      html += '<div style="font-size:12px;font-weight:700;color:#1a1a1a;">' + f.v + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ISA results if showRisk
    if (showRisk && ev.isaImpacto) {
      html += '<div style="background:' + clr + '0f;border:1px solid ' + clr + '33;border-radius:10px;padding:10px 12px;margin-top:10px;">';
      html += '<div style="font-size:10px;font-weight:700;color:' + clr + ';margin-bottom:5px;">Análisis ISA TRAQ</div>';
      if (ev.isaImpacto) html += '<div style="font-size:11px;color:#374151;margin-bottom:2px;">Probabilidad combinada: <strong>' + ev.isaImpacto + '</strong></div>';
      if (ev.bioMargin !== null && ev.bioMargin !== undefined) {
        var marginOk = typeof ev.bioMargin === 'number' && ev.bioMargin >= 100;
        html += '<div style="font-size:11px;color:' + (marginOk ? '#15803d' : '#b91c1c') + ';">Margen estructural: <strong>' + (typeof ev.bioMargin === 'number' ? ev.bioMargin.toFixed(1) + '%' : ev.bioMargin) + '</strong> ' + (marginOk ? '✅' : '⚠️') + '</div>';
      }
      html += '</div>';
    }

    html += '</div>'; // info section

    // GPS
    if (showGPS) {
      var gpsObj = ev.gps && typeof ev.gps === 'object' ? ev.gps : null;
      var gStr   = typeof ev.gps === 'string' ? ev.gps : null;
      var gpLat  = gpsObj ? parseFloat(gpsObj.lat) : (gStr ? parseFloat(gStr.split(',')[0]) : parseFloat(ev.lat));
      var gpLng  = gpsObj ? parseFloat(gpsObj.lng) : (gStr ? parseFloat(gStr.split(',')[1]) : parseFloat(ev.lng));
      if (!isNaN(gpLat) && !isNaN(gpLng) && gpLat && gpLng) {
        html += '<div style="padding:0 16px 14px;">';
        html += '<a href="https://maps.apple.com/?ll=' + gpLat + ',' + gpLng + '&q=Árbol" target="_blank" ' +
          'style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;text-decoration:none;color:#15803d;font-weight:700;font-size:12px;">';
        html += '<span style="font-size:22px;">📍</span>';
        html += '<div><div>' + gpLat.toFixed(5) + ', ' + gpLng.toFixed(5) + '</div>';
        html += '<div style="font-size:10px;font-weight:400;color:#6b7280;margin-top:1px;">Toca para abrir en Mapas</div></div>';
        html += '</a></div>';
      }
    }

    // Docs
    if (docs.length) {
      html += '<div style="padding:0 16px 14px;">';
      html += '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Documentos adjuntos</div>';
      docs.forEach(function(doc) {
        var dName = doc.name || 'Documento';
        var dUrl  = doc.url  || doc;
        html += '<a href="' + dUrl + '" target="_blank" ' +
          'style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fafaf8;border:1px solid #e5e0d5;border-radius:10px;text-decoration:none;color:#1a1a1a;margin-bottom:6px;">';
        html += '<span style="font-size:20px;">📄</span>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + dName + '</div>';
        if (doc.ts) html += '<div style="font-size:10px;color:#9ca3af;">' + fmtDate(doc.ts) + '</div>';
        html += '</div>';
        html += '<span style="font-size:11px;color:#6b7280;flex-shrink:0;">↓ Ver</span>';
        html += '</a>';
      });
      html += '</div>';
    }

    // Notes from admin
    if (cfg.adminNote) {
      html += '<div style="padding:0 16px 14px;">';
      html += '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:12px 14px;">';
      html += '<div style="font-size:10px;font-weight:700;color:#854d0e;margin-bottom:4px;">📋 NOTA DEL EQUIPO</div>';
      html += '<div style="font-size:12px;color:#1a1a1a;line-height:1.5;">' + cfg.adminNote + '</div>';
      html += '</div></div>';
    }

    body.innerHTML = html;
    modal.style.display = 'flex';
  };

  window._cpCloseTree = function() {
    var modal = document.getElementById('cpTreeModal');
    if (modal) modal.style.display = 'none';
    _activePortalTree = null;
  };

  window._cpFullPhoto = function(url) {
    var overlay = document.getElementById('cpPhotoOverlay');
    var img     = document.getElementById('cpPhotoOverlayImg');
    if (!overlay || !img) return;
    img.src = url;
    overlay.style.display = 'flex';
  };

  window._cpClosePhoto = function() {
    var overlay = document.getElementById('cpPhotoOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  // ─── CHAT ────────────────────────────────────────────────────
  function _initPortalChat() {
    if (typeof window._fbOnChat !== 'function') return;
    if (_portalChatUnsub) try { _portalChatUnsub(); } catch(e){}
    _portalChatUnsub = window._fbOnChat(_portalClienteKey, function(snap) {
      var msgs = (snap && snap.val ? snap.val() : null) || {};
      // Count unread messages sent by admin (not by cliente)
      var userData = window._AUTH && window._AUTH.userData;
      var myRole = userData ? (userData.role || '') : '';
      if (myRole === 'cliente') {
        _chatUnread = Object.values(msgs).filter(function(m) {
          return m.senderRole !== 'cliente' && !m.read;
        }).length;
        var badge = document.getElementById('cp-chat-badge');
        if (badge) {
          badge.textContent = _chatUnread > 0 ? String(_chatUnread) : '';
          badge.style.display = _chatUnread > 0 ? 'flex' : 'none';
        }
      }
      if (_portalTab === 'chat') {
        _renderChatMessages(msgs);
      }
    });
  }

  function _renderChatView(container) {
    container.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">' +
        '<div id="cpChatMsgs" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-height:0;-webkit-overflow-scrolling:touch;"></div>' +
        '<div style="flex-shrink:0;border-top:1px solid #e5e7eb;padding:10px 14px;background:#fff;display:flex;gap:8px;align-items:flex-end;">' +
          '<textarea id="cpChatInput" placeholder="Escribe tu consulta al equipo técnico..." ' +
            'style="flex:1;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:12px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;resize:none;min-height:42px;max-height:100px;outline:none;line-height:1.4;" ' +
            'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();window._cpSendMsg();}"></textarea>' +
          '<button onclick="window._cpSendMsg()" ' +
            'style="padding:10px 16px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;height:42px;">Enviar →</button>' +
        '</div>' +
      '</div>';

    // Load messages from existing listener or re-read
    if (typeof window._fbOnChat === 'function') {
      window._fbOnChat(_portalClienteKey, function(snap) {
        var msgs = (snap && snap.val ? snap.val() : null) || {};
        _renderChatMessages(msgs);
        // Mark unread as read
        var userData = window._AUTH && window._AUTH.userData;
        if (userData && userData.role === 'cliente' && typeof window._fbMarkChatRead === 'function') {
          Object.keys(msgs).forEach(function(msgId) {
            if (msgs[msgId].senderRole !== 'cliente' && !msgs[msgId].read) {
              window._fbMarkChatRead(_portalClienteKey, msgId);
            }
          });
        }
      });
    }
  }

  function _renderChatMessages(msgs) {
    var el = document.getElementById('cpChatMsgs');
    if (!el) return;
    var userData = window._AUTH && window._AUTH.userData;
    var myName   = userData ? (userData.nombre || userData.email || 'Tú') : 'Tú';
    var myRole   = userData ? (userData.role || 'cliente') : 'cliente';

    var entries = Object.entries(msgs).sort(function(a, b) { return (a[1].ts||0) - (b[1].ts||0); });

    if (entries.length === 0) {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">💬 Aquí puedes enviar consultas al equipo técnico.</div>';
      return;
    }

    var html = '';
    var lastDate = '';
    entries.forEach(function(entry) {
      var msg = entry[1];
      var isMine = msg.senderRole === myRole && msg.sender === myName;
      var date = msg.ts ? new Date(msg.ts).toLocaleDateString('es-CL', { day:'2-digit', month:'short' }) : '';
      if (date && date !== lastDate) {
        html += '<div style="text-align:center;font-size:10px;color:#9ca3af;margin:6px 0;">' + date + '</div>';
        lastDate = date;
      }
      var time = msg.ts ? fmtTime(msg.ts) : '';
      var roleLabel = msg.senderRole === 'cliente' ? '' : '🌳 Equipo técnico';
      html +=
        '<div style="display:flex;flex-direction:column;align-items:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:4px;">' +
          (!isMine ? '<div style="font-size:9px;font-weight:700;color:#15803d;margin-bottom:2px;margin-left:4px;">' + roleLabel + '</div>' : '') +
          '<div style="max-width:78%;padding:10px 13px;border-radius:' + (isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px') + ';' +
            'background:' + (isMine ? '#0f3320' : '#f3f4f6') + ';' +
            'color:' + (isMine ? '#d1fae5' : '#1a1a1a') + ';' +
            'font-size:13px;line-height:1.5;">' + _escHtml(msg.text || '') + '</div>' +
          (time ? '<div style="font-size:9px;color:#9ca3af;margin-top:2px;' + (isMine ? 'margin-right:4px;' : 'margin-left:4px;') + '">' + time + '</div>' : '') +
        '</div>';
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  window._cpSendMsg = function() {
    var inp = document.getElementById('cpChatInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    var userData = window._AUTH && window._AUTH.userData;
    var msg = {
      text: text,
      sender: userData ? (userData.nombre || userData.email || 'Cliente') : 'Cliente',
      senderRole: 'cliente',
      ts: Date.now(),
      read: false
    };
    if (typeof window._fbSendMessage === 'function') {
      window._fbSendMessage(_portalClienteKey, msg);
      inp.value = '';
    }
  };

  function _escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── TAB SWITCHING ────────────────────────────────────────────
  window._cpSetTab = function(tab) {
    _portalTab = tab;
    var tabs = ['trees', 'chat'];
    tabs.forEach(function(t) {
      var btn = document.getElementById('cp-tab-' + t);
      if (btn) btn.classList.toggle('cp-tab-active', t === tab);
    });
    var container = document.getElementById('cp-main');
    if (container) {
      _renderPortalContent();
    }
    if (tab === 'chat') {
      _chatUnread = 0;
      var badge = document.getElementById('cp-chat-badge');
      if (badge) badge.style.display = 'none';
    }
  };

  // ─── LOGOUT ───────────────────────────────────────────────────
  window._cpLogout = function() {
    if (typeof window._fbClearPresence === 'function') window._fbClearPresence();
    if (_portalChatUnsub)  try { _portalChatUnsub();  } catch(e){}
    if (_portalTreesUnsub) try { _portalTreesUnsub(); } catch(e){}
    if (typeof window.handleLogout === 'function') window.handleLogout();
  };

  // ─────────────────────────────────────────────────────────────
  // ADMIN PORTAL CONFIG — open configuration for a specific client
  // ─────────────────────────────────────────────────────────────
  window.openPortalConfig = function(clientName) {
    var modal = document.getElementById('portalConfigModal');
    if (!modal) return;
    var titleEl = document.getElementById('pcm-title');
    if (titleEl) titleEl.textContent = '⚙️ Portal de: ' + clientName;
    _loadPortalConfigEditor(clientName);
    modal.style.display = 'flex';
  };

  window.closePortalConfig = function() {
    var modal = document.getElementById('portalConfigModal');
    if (modal) modal.style.display = 'none';
  };

  function _loadPortalConfigEditor(clientName) {
    var body = document.getElementById('pcm-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">⏳ Cargando configuración...</div>';

    var clientKey = fsKey(clientName);

    // Load both portal config and current trees config
    var db = window._dbAll || window._fbRawAll || {};
    var clientTrees = {};
    Object.keys(db).forEach(function(key) {
      var ev = db[key];
      var evClient = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
      if (evClient.toLowerCase() === clientName.toLowerCase()) {
        var arbolId = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
        if (!clientTrees[arbolId] || (ev.timestamp || 0) > (clientTrees[arbolId].timestamp || 0)) {
          clientTrees[arbolId] = Object.assign({}, ev, { _fbKey: key });
        }
      }
    });

    if (typeof window._fbOnPortalTrees === 'function') {
      window._fbOnPortalTrees(clientKey, function(snap) {
        var savedCfg = (snap && snap.val ? snap.val() : null) || {};
        _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, savedCfg);
      });
    } else {
      _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, {});
    }
  }

  function _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, savedCfg) {
    var treeIds = Object.keys(clientTrees);
    if (treeIds.length === 0) {
      body.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Sin evaluaciones para este cliente.</div>';
      return;
    }

    var html =
      '<div style="padding:14px 16px 0;">' +
        '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Configuración global del portal</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">' +
          _cfgToggle('pcm-global-risk', 'Mostrar nivel de riesgo', savedCfg._global && savedCfg._global.showRiskSummary !== false) +
          _cfgToggle('pcm-global-gps', 'Mostrar GPS de árboles', savedCfg._global && savedCfg._global.showGPS !== false) +
        '</div>' +
        '<button onclick="window._pcmSaveGlobal(\'' + clientKey + '\')" ' +
          'style="width:100%;padding:10px;background:#0f3320;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:16px;">💾 Guardar configuración global</button>' +
      '</div>';

    html += '<div style="border-top:1px solid #e5e7eb;padding:14px 16px 0;">';
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Árboles del cliente (' + treeIds.length + ')</div>';

    treeIds.forEach(function(arbolId) {
      var ev  = clientTrees[arbolId];
      var ak  = fsKey(arbolId);
      var cfg = savedCfg[ak] || {};
      var especie   = ev.especie || (ev.answers && ev.answers.especie) || '?';
      var risk      = getEffRisk(ev);
      var clr       = riskColor(risk);
      var photos    = ev.photoUrls || [];
      var isVisible = cfg.visible !== false;

      // Suggest photos: all photos from eval + any that were previously saved
      var allPhotos = photos.slice();
      if (cfg.showPhotos) cfg.showPhotos.forEach(function(u) { if (allPhotos.indexOf(u) === -1) allPhotos.push(u); });

      html +=
        '<div style="border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-bottom:10px;background:' + (isVisible ? '#fff' : '#f9fafb') + ';">';

      // Header
      html +=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:9px;font-weight:800;text-transform:uppercase;background:' + clr + '1a;color:' + clr + ';border:1px solid ' + clr + '33;padding:2px 7px;border-radius:20px;">' + riskLabel(risk) + '</span>' +
          '<strong style="font-size:13px;font-family:\'Fraunces\',Georgia,serif;flex:1;">' + arbolId + '</strong>' +
          '<span style="font-size:11px;color:#9ca3af;">' + especie + '</span>' +
        '</div>';

      // Visibility toggle
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;background:#f9fafb;border-radius:8px;padding:8px 10px;margin-bottom:8px;">' +
          '<span style="font-size:12px;font-weight:600;">Visible para el cliente</span>' +
          '<label style="display:flex;align-items:center;cursor:pointer;gap:4px;">' +
            '<input type="checkbox" id="pcm-vis-' + ak + '" ' + (isVisible ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#0f3320;">' +
          '</label>' +
        '</div>';

      // Show risk + GPS
      html +=
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
          _cfgToggle('pcm-risk-' + ak, 'Mostrar riesgo', cfg.showRisk !== false) +
          _cfgToggle('pcm-gps-'  + ak, 'Mostrar GPS',   cfg.showGPS  !== false) +
        '</div>';

      // Photos selector
      html += '<div style="margin-bottom:8px;">';
      html += '<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:5px;">Fotos a mostrar (' + allPhotos.length + ' disponibles)</div>';
      if (allPhotos.length > 0) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        allPhotos.forEach(function(url, i) {
          var isSelected = !cfg.showPhotos || cfg.showPhotos.indexOf(url) !== -1;
          html +=
            '<label style="position:relative;cursor:pointer;" title="Foto ' + (i+1) + '">' +
              '<input type="checkbox" class="pcm-photo-cb" data-arbol="' + ak + '" data-url="' + url.replace(/"/g,'&quot;') + '" ' +
                (isSelected ? 'checked' : '') + ' style="position:absolute;top:3px;left:3px;z-index:2;accent-color:#0f3320;width:14px;height:14px;">' +
              '<img src="' + url + '" style="width:60px;height:60px;object-fit:cover;border-radius:7px;border:2px solid ' + (isSelected ? '#0f3320' : '#e5e7eb') + ';" ' +
                'onerror="this.parentElement.style.display=\'none\'">' +
            '</label>';
        });
        html += '</div>';
      } else {
        html += '<span style="font-size:11px;color:#9ca3af;">Sin fotos en este árbol</span>';
      }
      html += '</div>';

      // Admin note
      html +=
        '<div>' +
          '<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px;">Nota para el cliente (opcional)</div>' +
          '<textarea id="pcm-note-' + ak + '" style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;resize:none;min-height:48px;outline:none;" ' +
            'placeholder="Observaciones, recomendaciones...">' + (cfg.adminNote || '') + '</textarea>' +
        '</div>';

      // Save button for this tree
      html +=
        '<button onclick="window._pcmSaveTree(\'' + clientKey + '\',\'' + ak + '\',\'' + arbolId + '\')" ' +
          'style="margin-top:8px;width:100%;padding:9px;background:#0f3320;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">💾 Guardar árbol</button>';

      html += '</div>'; // tree card
    });

    html += '</div>'; // trees section
    body.innerHTML = html;
  }

  function _cfgToggle(id, label, checked) {
    return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:6px;">' +
      '<span style="font-size:11px;font-weight:600;">' + label + '</span>' +
      '<input type="checkbox" id="' + id + '" ' + (checked ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#0f3320;flex-shrink:0;">' +
    '</div>';
  }

  window._pcmSaveGlobal = function(clientKey) {
    var showRisk = document.getElementById('pcm-global-risk');
    var showGPS  = document.getElementById('pcm-global-gps');
    var cfg = {
      showRiskSummary: showRisk ? showRisk.checked : true,
      showGPS: showGPS ? showGPS.checked : true,
      updatedAt: Date.now()
    };
    if (typeof window._fbSetPortalConfig === 'function') {
      window._fbSetPortalConfig(clientKey, cfg)
        .then(function() { window.showNotif('✅ Configuración global guardada'); })
        .catch(function(e) { window.showNotif('Error: ' + e.message, 'error'); });
    }
  };

  window._pcmSaveTree = function(clientKey, arbolKey, arbolId) {
    var visEl  = document.getElementById('pcm-vis-'  + arbolKey);
    var riskEl = document.getElementById('pcm-risk-' + arbolKey);
    var gpsEl  = document.getElementById('pcm-gps-'  + arbolKey);
    var noteEl = document.getElementById('pcm-note-' + arbolKey);

    // Collect selected photos
    var photoCbs = document.querySelectorAll('.pcm-photo-cb[data-arbol="' + arbolKey + '"]');
    var selectedPhotos = [];
    photoCbs.forEach(function(cb) { if (cb.checked && cb.dataset.url) selectedPhotos.push(cb.dataset.url); });

    var data = {
      visible:    visEl  ? visEl.checked  : true,
      showRisk:   riskEl ? riskEl.checked : true,
      showGPS:    gpsEl  ? gpsEl.checked  : true,
      showPhotos: selectedPhotos,
      adminNote:  noteEl ? (noteEl.value.trim() || null) : null,
      updatedAt:  Date.now()
    };

    if (typeof window._fbSetPortalTree === 'function') {
      window._fbSetPortalTree(clientKey, arbolKey, data)
        .then(function() { window.showNotif('✅ Árbol ' + arbolId + ' guardado'); })
        .catch(function(e) { window.showNotif('Error: ' + e.message, 'error'); });
    }
  };

})();
