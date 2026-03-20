/* ═══════════════════════════════════════════
   client-portal.js — Portal del Cliente
   Bosques Urbanos · Rol "cliente"

   3 tabs: Mapa, Documentos, Consultas
   Solo muestra datos configurados por admin.
   Sin términos técnicos (ISA, TRAQ, riesgo).
═══════════════════════════════════════════ */
(function () {
  'use strict';

  var _portalClienteName = '';
  var _portalClienteKey  = '';
  var _portalConfig      = {};   // /clientePortal/{key}/config
  var _portalEvals       = {};   // evaluaciones filtradas para este cliente
  var _portalChatUnsub   = null;
  var _portalConfigUnsub = null;
  var _portalTab         = 'map'; // 'map' | 'docs' | 'chat'
  var _chatUnread        = 0;
  var _portalMap         = null;  // Leaflet map instance
  var _portalMapMarkers  = [];

  /* ── helpers ── */
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

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function docIcon(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['xls','xlsx','csv'].indexOf(ext) !== -1) return '📗';
    if (['doc','docx'].indexOf(ext) !== -1) return '📘';
    if (['jpg','jpeg','png','gif','webp','heic'].indexOf(ext) !== -1) return '🖼️';
    return '📄';
  }

  /* ── Get trees visible in this portal ── */
  function _getVisibleTrees() {
    var trees = _portalConfig.trees || {};
    return Object.keys(_portalEvals).filter(function (arbolId) {
      var ak = fsKey(arbolId);
      var cfg = trees[ak];
      return cfg && cfg.visible === true;
    }).map(function (arbolId) {
      return {
        arbolId: arbolId,
        ev: _portalEvals[arbolId],
        cfg: (trees[fsKey(arbolId)] || {})
      };
    });
  }

  /* ── Load evaluations for this client ── */
  function _refreshPortalEvals() {
    var db = window._dbAll || window._fbRawAll || {};
    _portalEvals = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var evClient = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
      if (evClient.toLowerCase() === _portalClienteName.toLowerCase()) {
        var arbolId = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
        if (!_portalEvals[arbolId] || (ev.timestamp || 0) > (_portalEvals[arbolId].timestamp || 0)) {
          _portalEvals[arbolId] = Object.assign({}, ev, { _fbKey: key });
        }
      }
    });
  }

  /* ══════════════════════════════════════
     PUBLIC: Initialize portal
  ══════════════════════════════════════ */
  window.initClientPortal = function () {
    var userData = window._AUTH && window._AUTH.userData;
    if (!userData) return;
    _portalClienteName = userData.clienteAsignado || '';
    _portalClienteKey  = fsKey(_portalClienteName);

    // Build portal screen
    _buildPortalScreen();

    // Hide evaluator app
    var appEl = document.getElementById('app');
    if (appEl) appEl.style.display = 'none';

    var screen = document.getElementById('clientePortalScreen');
    if (screen) screen.style.display = 'flex';

    // Load evals
    _refreshPortalEvals();

    // Listen to portal config realtime
    if (typeof window._fbOnPortalConfig === 'function') {
      if (_portalConfigUnsub) try { _portalConfigUnsub(); } catch(e){}
      _portalConfigUnsub = window._fbOnPortalConfig(_portalClienteKey, function (snap) {
        _portalConfig = (snap && snap.val ? snap.val() : null) || {};
        _renderCurrentTab();
        _updateWelcomeMsg();
      });
    }

    // Chat listener
    _initPortalChat();

    _renderCurrentTab();
    _updateWelcomeMsg();
  };

  /* ── Build the portal screen HTML ── */
  function _buildPortalScreen() {
    var userData = window._AUTH && window._AUTH.userData;
    var clientName = _portalClienteName || 'Mi Portal';
    var userName   = userData ? (userData.nombre || userData.email || '') : '';

    var screen = document.getElementById('clientePortalScreen');
    if (!screen) return;

    screen.style.cssText = 'display:none;position:fixed;inset:0;z-index:800;background:#f8f9fa;flex-direction:column;font-family:\'IBM Plex Sans\',system-ui,sans-serif;';

    screen.innerHTML =
      /* ── HEADER ── */
      '<div id="cp-header" style="background:#0f3320;color:#fff;padding:14px 18px 10px;flex-shrink:0;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:10px;font-weight:700;color:#86efac;text-transform:uppercase;letter-spacing:.1em;">Bosques Urbanos · Mi Portal</div>' +
            '<div id="cp-client-name" style="font-size:17px;font-weight:800;font-family:\'Fraunces\',Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(clientName) + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0;">' +
            '<div id="cp-user-name" style="font-size:11px;color:#86efac;margin-bottom:4px;">' + escHtml(userName) + '</div>' +
            '<button onclick="window._cpLogout()" style="font-size:10px;font-weight:700;color:#fca5a5;background:transparent;border:1px solid #b91c1c;padding:4px 12px;border-radius:20px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">Cerrar sesión</button>' +
          '</div>' +
        '</div>' +
        /* welcome message */
        '<div id="cp-welcome-msg" style="display:none;margin-top:10px;padding:8px 12px;background:rgba(255,255,255,.08);border-radius:10px;font-size:12px;color:#d1fae5;line-height:1.4;"></div>' +
      '</div>' +

      /* ── TAB BAR ── */
      '<div style="background:#fff;border-bottom:1px solid #e5e7eb;display:flex;flex-shrink:0;">' +
        '<button id="cp-tab-map" onclick="window._cpSetTab(\'map\')" ' +
          'style="flex:1;padding:12px 0;font-size:12px;font-weight:700;background:none;border:none;border-bottom:2.5px solid #0f3320;cursor:pointer;color:#0f3320;font-family:\'IBM Plex Sans\',sans-serif;">' +
          '🗺️ Mapa</button>' +
        '<button id="cp-tab-docs" onclick="window._cpSetTab(\'docs\')" ' +
          'style="flex:1;padding:12px 0;font-size:12px;font-weight:700;background:none;border:none;border-bottom:2.5px solid transparent;cursor:pointer;color:#9ca3af;font-family:\'IBM Plex Sans\',sans-serif;">' +
          '📄 Documentos</button>' +
        '<button id="cp-tab-chat" onclick="window._cpSetTab(\'chat\')" ' +
          'style="flex:1;padding:12px 0;font-size:12px;font-weight:700;background:none;border:none;border-bottom:2.5px solid transparent;cursor:pointer;color:#9ca3af;font-family:\'IBM Plex Sans\',sans-serif;position:relative;">' +
          '💬 Consultas' +
          '<span id="cp-chat-badge" style="display:none;position:absolute;top:7px;right:calc(50% - 36px);background:#b91c1c;color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:20px;min-width:14px;align-items:center;justify-content:center;"></span>' +
        '</button>' +
      '</div>' +

      /* ── MAIN CONTENT ── */
      '<div id="cp-main" style="flex:1;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;position:relative;"></div>';
  }

  function _updateWelcomeMsg() {
    var msg = _portalConfig.welcomeMessage || '';
    var el = document.getElementById('cp-welcome-msg');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  /* ── Tab switching ── */
  window._cpSetTab = function (tab) {
    _portalTab = tab;
    var tabs = ['map', 'docs', 'chat'];
    tabs.forEach(function (t) {
      var btn = document.getElementById('cp-tab-' + t);
      if (!btn) return;
      if (t === tab) {
        btn.style.borderBottom = '2.5px solid #0f3320';
        btn.style.color = '#0f3320';
      } else {
        btn.style.borderBottom = '2.5px solid transparent';
        btn.style.color = '#9ca3af';
      }
    });
    if (tab === 'chat') {
      _chatUnread = 0;
      var badge = document.getElementById('cp-chat-badge');
      if (badge) badge.style.display = 'none';
    }
    _renderCurrentTab();
  };

  function _renderCurrentTab() {
    var container = document.getElementById('cp-main');
    if (!container) return;
    if (_portalTab === 'map')  _renderMapTab(container);
    else if (_portalTab === 'docs') _renderDocsTab(container);
    else if (_portalTab === 'chat') _renderChatTab(container);
  }

  /* ══════════════════════════════════════
     TAB 1: MAPA
  ══════════════════════════════════════ */
  function _renderMapTab(container) {
    var trees = _getVisibleTrees();

    // Always render the map container (needed for Leaflet)
    container.innerHTML =
      '<div id="cp-map-wrap" style="position:relative;height:100%;min-height:0;">' +
        '<div id="cp-leaflet-map" style="width:100%;height:100%;"></div>' +
        (trees.length === 0 ?
          '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:500;">' +
            '<div style="background:rgba(255,255,255,.95);border-radius:16px;padding:24px 28px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.12);">' +
              '<div style="font-size:48px;margin-bottom:12px;">🌳</div>' +
              '<div style="font-size:15px;font-weight:700;color:#0f3320;margin-bottom:6px;">Tu portal está listo</div>' +
              '<div style="font-size:13px;color:#6b7280;">Tu equipo aún está configurando la información de tus árboles.</div>' +
            '</div>' +
          '</div>' : '') +
      '</div>';

    // Initialize or update Leaflet map
    setTimeout(function () { _initLeafletMap(trees); }, 80);
  }

  function _initLeafletMap(trees) {
    var mapEl = document.getElementById('cp-leaflet-map');
    if (!mapEl) return;

    // Destroy previous map
    if (_portalMap) {
      try { _portalMap.remove(); } catch(e){}
      _portalMap = null;
      _portalMapMarkers = [];
    }

    if (typeof L === 'undefined') return;

    // Default center: Santiago, Chile
    var defaultLat = -33.45, defaultLng = -70.65, defaultZoom = 13;

    // Find first tree with GPS
    var firstTree = null;
    trees.forEach(function (item) {
      if (firstTree) return;
      var gps = _extractGPS(item.ev);
      if (gps) firstTree = gps;
    });

    _portalMap = L.map(mapEl, {
      center: firstTree ? [firstTree.lat, firstTree.lng] : [defaultLat, defaultLng],
      zoom: firstTree ? 16 : defaultZoom,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(_portalMap);

    // Add markers for visible trees with GPS
    var bounds = [];
    trees.forEach(function (item) {
      var gps = _extractGPS(item.ev);
      if (!gps) return;

      var especie = item.ev.especie || (item.ev.answers && item.ev.answers.especie) || 'Árbol';
      var note    = item.cfg.adminNote || '';
      var date    = fmtDate(item.ev.timestamp || item.ev.ts);

      // Custom green divIcon
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:32px;height:32px;background:#0f3320;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35);">' +
              '<div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;">🌳</div></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36]
      });

      var popupHtml =
        '<div style="font-family:\'IBM Plex Sans\',sans-serif;min-width:160px;">' +
          '<div style="font-weight:800;font-size:14px;color:#0f3320;margin-bottom:4px;">' + escHtml(item.arbolId) + '</div>' +
          '<div style="font-size:12px;color:#4b5563;font-style:italic;margin-bottom:4px;">' + escHtml(especie) + '</div>' +
          (date ? '<div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">📅 ' + escHtml(date) + '</div>' : '') +
          (note ? '<div style="font-size:12px;color:#1a1a1a;background:#f0fdf4;border-radius:8px;padding:8px;border-left:3px solid #0f3320;margin-top:4px;line-height:1.4;">' + escHtml(note) + '</div>' : '') +
        '</div>';

      var marker = L.marker([gps.lat, gps.lng], { icon: icon })
        .addTo(_portalMap)
        .bindPopup(popupHtml, { maxWidth: 240 });

      _portalMapMarkers.push(marker);
      bounds.push([gps.lat, gps.lng]);
    });

    // Fit bounds if multiple trees
    if (bounds.length > 1) {
      try { _portalMap.fitBounds(bounds, { padding: [32, 32] }); } catch(e){}
    }
  }

  function _extractGPS(ev) {
    if (!ev) return null;
    var gpsObj = ev.gps && typeof ev.gps === 'object' ? ev.gps : null;
    var gStr   = typeof ev.gps === 'string' ? ev.gps : null;
    var lat = gpsObj ? parseFloat(gpsObj.lat) : (gStr ? parseFloat(gStr.split(',')[0]) : parseFloat(ev.lat));
    var lng = gpsObj ? parseFloat(gpsObj.lng) : (gStr ? parseFloat(gStr.split(',')[1]) : parseFloat(ev.lng));
    if (!isNaN(lat) && !isNaN(lng) && lat && lng) return { lat: lat, lng: lng };
    return null;
  }

  /* ══════════════════════════════════════
     TAB 2: DOCUMENTOS
  ══════════════════════════════════════ */
  function _renderDocsTab(container) {
    var docs = (_portalConfig.docs || []).slice();

    // Also collect visiblePhotos from visible trees
    var photoItems = [];
    var trees = _getVisibleTrees();
    trees.forEach(function (item) {
      var photos = item.cfg.visiblePhotos || [];
      photos.forEach(function (url) {
        photoItems.push({ type: 'photo', url: url, arbolId: item.arbolId, especie: item.ev.especie || '' });
      });
    });

    var html = '<div style="padding:16px;padding-bottom:80px;">';

    /* Documentos section */
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Documentos</div>';

    if (docs.length === 0) {
      html += '<div style="background:#fff;border-radius:12px;padding:20px;text-align:center;color:#9ca3af;font-size:13px;border:1.5px dashed #e5e7eb;">' +
        '📂 No hay documentos compartidos aún.</div>';
    } else {
      docs.forEach(function (doc) {
        var name = doc.name || 'Documento';
        var url  = doc.url  || '';
        var date = doc.ts ? fmtDate(doc.ts) : '';
        var icon = docIcon(name);
        html +=
          '<a href="' + escHtml(url) + '" target="_blank" ' +
            'style="display:flex;align-items:center;gap:12px;background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:8px;text-decoration:none;color:#1a1a1a;box-shadow:0 1px 4px rgba(0,0,0,.07);border:1px solid #f1f1f1;">' +
            '<div style="font-size:28px;flex-shrink:0;">' + icon + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(name) + '</div>' +
              (date ? '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">' + escHtml(date) + '</div>' : '') +
            '</div>' +
            '<div style="flex-shrink:0;background:#0f3320;color:#fff;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;">↓ Ver</div>' +
          '</a>';
      });
    }
    html += '</div>';

    /* Fotos de árboles section */
    if (photoItems.length > 0) {
      html += '<div>';
      html += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Fotos de árboles</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;">';
      photoItems.forEach(function (item) {
        html +=
          '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);cursor:pointer;" ' +
            'onclick="window._cpFullPhoto(\'' + escHtml(item.url).replace(/'/g,"\\'") + '\')">' +
            '<img src="' + escHtml(item.url) + '" alt="Foto" ' +
              'style="width:100%;height:110px;object-fit:cover;display:block;" ' +
              'onerror="this.closest(\'div\').style.display=\'none\'">' +
            '<div style="padding:6px 8px;">' +
              '<div style="font-size:10px;font-weight:700;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(item.arbolId) + '</div>' +
              (item.especie ? '<div style="font-size:9px;color:#9ca3af;font-style:italic;">' + escHtml(item.especie) + '</div>' : '') +
            '</div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  /* ══════════════════════════════════════
     TAB 3: CONSULTAS (Chat)
  ══════════════════════════════════════ */
  function _renderChatTab(container) {
    container.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">' +
        '<div id="cpChatMsgs" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-height:0;-webkit-overflow-scrolling:touch;"></div>' +
        '<div style="flex-shrink:0;border-top:1px solid #e5e7eb;padding:10px 14px;background:#fff;display:flex;gap:8px;align-items:flex-end;">' +
          '<textarea id="cpChatInput" placeholder="Haz tu consulta al equipo…" ' +
            'style="flex:1;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:12px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;resize:none;min-height:42px;max-height:100px;outline:none;line-height:1.4;" ' +
            'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();window._cpSendMsg();}"></textarea>' +
          '<button onclick="window._cpSendMsg()" ' +
            'style="padding:10px 16px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;height:42px;font-family:\'IBM Plex Sans\',sans-serif;">Enviar →</button>' +
        '</div>' +
      '</div>';

    // Mark unread as read when opening chat
    if (typeof window._fbOnChat === 'function') {
      window._fbOnChat(_portalClienteKey, function (snap) {
        var msgs = (snap && snap.val ? snap.val() : null) || {};
        _renderChatMessages(msgs);
        var userData = window._AUTH && window._AUTH.userData;
        if (userData && userData.role === 'cliente' && typeof window._fbMarkChatRead === 'function') {
          Object.keys(msgs).forEach(function (msgId) {
            if (msgs[msgId].senderRole !== 'cliente' && !msgs[msgId].read) {
              window._fbMarkChatRead(_portalClienteKey, msgId);
            }
          });
        }
      });
    }
  }

  function _initPortalChat() {
    if (typeof window._fbOnChat !== 'function') return;
    if (_portalChatUnsub) try { _portalChatUnsub(); } catch(e){}
    _portalChatUnsub = window._fbOnChat(_portalClienteKey, function (snap) {
      var msgs = (snap && snap.val ? snap.val() : null) || {};
      var userData = window._AUTH && window._AUTH.userData;
      var myRole = userData ? (userData.role || '') : '';
      if (myRole === 'cliente') {
        _chatUnread = Object.values(msgs).filter(function (m) {
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

  function _renderChatMessages(msgs) {
    var el = document.getElementById('cpChatMsgs');
    if (!el) return;
    var userData = window._AUTH && window._AUTH.userData;
    var myRole   = userData ? (userData.role || 'cliente') : 'cliente';

    var entries = Object.entries(msgs).sort(function (a, b) { return (a[1].ts || 0) - (b[1].ts || 0); });

    if (entries.length === 0) {
      el.innerHTML =
        '<div style="padding:30px 20px;text-align:center;color:#9ca3af;font-size:13px;">' +
          '<div style="font-size:32px;margin-bottom:8px;">💬</div>' +
          '<div style="font-weight:600;margin-bottom:4px;">Sin mensajes aún</div>' +
          '<div style="font-size:12px;">Escribe tu consulta al equipo técnico y te responderemos pronto.</div>' +
        '</div>';
      return;
    }

    var html = '';
    var lastDate = '';
    entries.forEach(function (entry) {
      var msg = entry[1];
      var isMine = msg.senderRole === 'cliente';
      var date = msg.ts ? new Date(msg.ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '';
      if (date && date !== lastDate) {
        html += '<div style="text-align:center;font-size:10px;color:#9ca3af;margin:8px 0;">' + escHtml(date) + '</div>';
        lastDate = date;
      }
      var time = msg.ts ? fmtTime(msg.ts) : '';
      html +=
        '<div style="display:flex;flex-direction:column;align-items:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:6px;">' +
          (!isMine ? '<div style="font-size:9px;font-weight:700;color:#0f3320;margin-bottom:2px;margin-left:4px;">🌳 Equipo Bosques Urbanos' + (msg.senderName ? ' · ' + escHtml(msg.senderName) : '') + '</div>' : '') +
          '<div style="max-width:78%;padding:10px 13px;border-radius:' + (isMine ? '16px 16px 4px 16px' : '4px 16px 16px 16px') + ';' +
            'background:' + (isMine ? '#0f3320' : '#ffffff') + ';' +
            'color:' + (isMine ? '#d1fae5' : '#1a1a1a') + ';' +
            'font-size:13px;line-height:1.5;' +
            (isMine ? '' : 'box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #f1f1f1;') + '">' +
            escHtml(msg.text || '') +
          '</div>' +
          (time ? '<div style="font-size:9px;color:#9ca3af;margin-top:2px;' + (isMine ? 'margin-right:4px;' : 'margin-left:4px;') + '">' + escHtml(time) + '</div>' : '') +
        '</div>';
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  window._cpSendMsg = function () {
    var inp = document.getElementById('cpChatInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    var userData = window._AUTH && window._AUTH.userData;
    var senderName = userData ? (userData.nombre || userData.email || 'Cliente') : 'Cliente';
    var msg = {
      text: text,
      senderName: senderName,
      senderRole: 'cliente',
      ts: Date.now(),
      read: false
    };
    if (typeof window._fbSendMessage === 'function') {
      window._fbSendMessage(_portalClienteKey, msg);
      inp.value = '';

      // Push notification to admin
      if (typeof window._fbPushNotif === 'function') {
        window._fbPushNotif({
          clientName: _portalClienteName,
          clienteKey: _portalClienteKey,
          message: text.slice(0, 120),
          ts: Date.now(),
          read: false
        });
      }
    }
  };

  /* ── Full-screen photo overlay ── */
  window._cpFullPhoto = function (url) {
    var overlay = document.getElementById('cpPhotoOverlay');
    var img     = document.getElementById('cpPhotoOverlayImg');
    if (!overlay || !img) return;
    img.src = url;
    overlay.style.display = 'flex';
  };

  window._cpClosePhoto = function () {
    var overlay = document.getElementById('cpPhotoOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  /* ── Logout ── */
  window._cpLogout = function () {
    if (typeof window._fbClearPresence === 'function') window._fbClearPresence();
    if (_portalChatUnsub)   try { _portalChatUnsub();   } catch(e){}
    if (_portalConfigUnsub) try { _portalConfigUnsub(); } catch(e){}
    if (_portalMap) { try { _portalMap.remove(); } catch(e){} _portalMap = null; }
    if (typeof window.handleLogout === 'function') window.handleLogout();
  };

  /* ══════════════════════════════════════
     ADMIN: Portal Config Editor
     Called from admin panel "Clientes" tab
  ══════════════════════════════════════ */
  window.openPortalConfigEditor = function (clientName) {
    var modal = document.getElementById('portalConfigModal');
    if (!modal) return;
    modal.style.display = 'flex';
    _loadPortalConfigEditor(clientName);
  };

  // Keep old name working
  window.openPortalConfig = window.openPortalConfigEditor;

  window.closePortalConfig = function () {
    var modal = document.getElementById('portalConfigModal');
    if (modal) modal.style.display = 'none';
  };

  function _loadPortalConfigEditor(clientName) {
    var body = document.getElementById('pcm-body');
    if (!body) return;
    var titleEl = document.getElementById('pcm-title');
    if (titleEl) titleEl.textContent = 'Configurando portal: ' + clientName;

    body.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">⏳ Cargando configuración...</div>';

    var clientKey = fsKey(clientName);

    // Gather trees for this client
    var db = window._dbAll || window._fbRawAll || {};
    var clientTrees = {};
    Object.keys(db).forEach(function (key) {
      var ev = db[key];
      var evClient = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
      if (evClient.toLowerCase() === clientName.toLowerCase()) {
        var arbolId = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
        if (!clientTrees[arbolId] || (ev.timestamp || 0) > (clientTrees[arbolId].timestamp || 0)) {
          clientTrees[arbolId] = Object.assign({}, ev, { _fbKey: key });
        }
      }
    });

    // Load portal config from Firebase
    if (typeof window._fbGetPortalConfig === 'function') {
      window._fbGetPortalConfig(clientKey, function (snap) {
        var savedCfg = (snap && snap.val ? snap.val() : null) || {};
        _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, savedCfg);
      });
    } else {
      _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, {});
    }
  }

  function _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, savedCfg) {
    var treeIds = Object.keys(clientTrees);
    var treesConfig = savedCfg.trees || {};

    var html = '<div style="padding:14px 16px;">';

    /* ── Section 1: Welcome message ── */
    html +=
      '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:14px;margin-bottom:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">💬 Mensaje de bienvenida</div>' +
        '<textarea id="pcm-welcome" placeholder="Escribe un mensaje de bienvenida para el cliente…" ' +
          'style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;resize:none;min-height:60px;outline:none;line-height:1.4;">' +
          escHtml(savedCfg.welcomeMessage || '') + '</textarea>' +
      '</div>';

    /* ── Section 2: Trees ── */
    html +=
      '<div style="font-size:12px;font-weight:700;color:#0f3320;margin-bottom:10px;">🌳 Árboles del cliente (' + treeIds.length + ')</div>';

    if (treeIds.length === 0) {
      html += '<div style="background:#f9fafb;border-radius:12px;padding:16px;text-align:center;color:#9ca3af;font-size:13px;margin-bottom:14px;">Sin evaluaciones registradas para este cliente.</div>';
    } else {
      treeIds.forEach(function (arbolId) {
        var ev     = clientTrees[arbolId];
        var ak     = fsKey(arbolId);
        var treeCfg = treesConfig[ak] || {};
        var especie = ev.especie || (ev.answers && ev.answers.especie) || '?';
        var photos  = ev.photoUrls || [];
        var gps     = _extractGPS(ev);
        var isVisible = treeCfg.visible === true;

        html +=
          '<div style="border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-bottom:10px;background:' + (isVisible ? '#fff' : '#f9fafb') + ';">' +
          /* tree header */
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
            '<strong style="font-size:14px;font-family:\'Fraunces\',Georgia,serif;flex:1;color:#0f3320;">' + escHtml(arbolId) + '</strong>' +
            '<span style="font-size:11px;color:#9ca3af;font-style:italic;">' + escHtml(especie) + '</span>' +
            (gps ? '<span style="font-size:10px;color:#0ea5e9;">📍</span>' : '') +
          '</div>';

        /* visibility toggle */
        html +=
          '<div style="display:flex;align-items:center;justify-content:space-between;background:#f0fdf4;border-radius:8px;padding:10px 12px;margin-bottom:10px;">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:700;color:#0f3320;">Mostrar al cliente</div>' +
              '<div style="font-size:10px;color:#6b7280;">El cliente verá este árbol en su portal</div>' +
            '</div>' +
            /* toggle switch */
            '<label style="display:flex;align-items:center;cursor:pointer;">' +
              '<div style="position:relative;width:44px;height:24px;">' +
                '<input type="checkbox" id="pcm-vis-' + ak + '" ' + (isVisible ? 'checked' : '') + ' ' +
                  'onchange="window._pcmToggleTreeExpand(\'' + ak + '\')" ' +
                  'style="position:absolute;opacity:0;width:0;height:0;">' +
                '<div id="pcm-switch-' + ak + '" onclick="document.getElementById(\'pcm-vis-' + ak + '\').click()" ' +
                  'style="position:absolute;inset:0;border-radius:12px;background:' + (isVisible ? '#0f3320' : '#d1d5db') + ';transition:background .2s;cursor:pointer;">' +
                  '<div style="position:absolute;top:2px;left:' + (isVisible ? '22px' : '2px') + ';width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>' +
                '</div>' +
              '</div>' +
            '</label>' +
          '</div>';

        /* sub-options (visible when toggled on) */
        html += '<div id="pcm-expand-' + ak + '" style="display:' + (isVisible ? 'block' : 'none') + ';">';

        /* admin note */
        html +=
          '<div style="margin-bottom:10px;">' +
            '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">📝 Nota para el cliente (opcional)</div>' +
            '<textarea id="pcm-note-' + ak + '" placeholder="Observaciones visibles para el cliente…" ' +
              'style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;resize:none;min-height:50px;outline:none;">' +
              escHtml(treeCfg.adminNote || '') + '</textarea>' +
          '</div>';

        /* photos */
        html += '<div style="margin-bottom:10px;">';
        if (photos.length > 0) {
          html += '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px;">🖼️ Fotos a mostrar <span style="font-weight:400;color:#0ea5e9;">💡 ' + photos.length + ' foto(s) disponible(s)</span></div>';
          html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
          photos.forEach(function (url, i) {
            var visPhotos = treeCfg.visiblePhotos || [];
            var isSelected = visPhotos.indexOf(url) !== -1;
            html +=
              '<label style="position:relative;cursor:pointer;" title="Foto ' + (i+1) + '">' +
                '<input type="checkbox" class="pcm-photo-cb" data-arbol="' + ak + '" data-url="' + escHtml(url) + '" ' +
                  (isSelected ? 'checked' : '') + ' ' +
                  'style="position:absolute;top:4px;left:4px;z-index:2;accent-color:#0f3320;width:15px;height:15px;">' +
                '<img src="' + escHtml(url) + '" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:2.5px solid ' + (isSelected ? '#0f3320' : '#e5e7eb') + ';" ' +
                  'onerror="this.parentElement.style.display=\'none\'">' +
              '</label>';
          });
          html += '</div>';
        } else {
          html += '<div style="font-size:11px;color:#9ca3af;">💡 Sin fotos en este árbol.</div>';
        }
        html += '</div>';

        html += '</div>'; /* end expand */

        /* save button */
        html +=
          '<button onclick="window._pcmSaveTree(\'' + clientKey + '\',\'' + ak + '\',\'' + escHtml(arbolId) + '\')" ' +
            'style="width:100%;padding:9px;background:#0f3320;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;margin-top:8px;">💾 Guardar árbol</button>';

        html += '</div>'; /* end tree card */
      });
    }

    /* ── Section 3: Documents ── */
    var docs = savedCfg.docs || [];
    html +=
      '<div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:4px;">' +
        '<div style="font-size:12px;font-weight:700;color:#0f3320;margin-bottom:10px;">📄 Documentos generales</div>';

    html += '<div id="pcm-docs-list">';
    docs.forEach(function (doc, i) {
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f9fafb;border-radius:8px;margin-bottom:6px;border:1px solid #e5e7eb;">' +
          '<span style="font-size:18px;">' + docIcon(doc.name || '') + '</span>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(doc.name || 'Documento') + '</div>' +
            '<div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(doc.url || '') + '</div>' +
          '</div>' +
          '<button onclick="window._pcmRemoveDoc(' + i + ',\'' + clientKey + '\')" ' +
            'style="flex-shrink:0;padding:4px 8px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:11px;cursor:pointer;color:#be123c;">✕</button>' +
        '</div>';
    });
    html += '</div>';

    html +=
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<input type="text" id="pcm-new-doc-name" placeholder="Nombre del documento" ' +
          'style="flex:1;padding:9px 11px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;outline:none;">' +
        '<input type="text" id="pcm-new-doc-url" placeholder="URL (https://…)" ' +
          'style="flex:2;padding:9px 11px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;outline:none;">' +
      '</div>' +
      '<button onclick="window._pcmAddDoc(\'' + clientKey + '\')" ' +
        'style="width:100%;padding:9px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #93c5fd;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;margin-top:6px;">➕ Agregar documento</button>' +
    '</div>';

    /* ── Save all button ── */
    html +=
      '<button onclick="window._pcmSaveAll(\'' + clientKey + '\')" ' +
        'style="width:100%;padding:13px;background:linear-gradient(135deg,#0f3320,#166534);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;margin-top:16px;">💾 Guardar toda la configuración</button>';

    html += '</div>';
    body.innerHTML = html;

    // Store current docs in a JS variable for manipulation
    window._pcmCurrentDocs = JSON.parse(JSON.stringify(docs));
    window._pcmCurrentClientKey = clientKey;
    window._pcmCurrentClientTrees = clientTrees;
    window._pcmCurrentTreeIds = treeIds;
  }

  /* ── Toggle tree expand panel when checkbox changes ── */
  window._pcmToggleTreeExpand = function (ak) {
    var cb  = document.getElementById('pcm-vis-' + ak);
    var exp = document.getElementById('pcm-expand-' + ak);
    var sw  = document.getElementById('pcm-switch-' + ak);
    var ball = sw ? sw.querySelector('div') : null;
    if (!cb || !exp) return;
    exp.style.display = cb.checked ? 'block' : 'none';
    if (sw) sw.style.background = cb.checked ? '#0f3320' : '#d1d5db';
    if (ball) ball.style.left = cb.checked ? '22px' : '2px';
  };

  /* ── Save individual tree ── */
  window._pcmSaveTree = function (clientKey, arbolKey, arbolId) {
    var visEl  = document.getElementById('pcm-vis-'  + arbolKey);
    var noteEl = document.getElementById('pcm-note-' + arbolKey);
    var photoCbs = document.querySelectorAll('.pcm-photo-cb[data-arbol="' + arbolKey + '"]');
    var selectedPhotos = [];
    photoCbs.forEach(function (cb) { if (cb.checked && cb.dataset.url) selectedPhotos.push(cb.dataset.url); });

    var data = {
      visible:       visEl  ? visEl.checked  : false,
      adminNote:     noteEl ? (noteEl.value.trim() || null) : null,
      visiblePhotos: selectedPhotos,
      updatedAt:     Date.now()
    };

    // Save to /clientePortal/{clientKey}/config/trees/{arbolKey}
    if (typeof window._fbSetPortalTree === 'function') {
      window._fbSetPortalTree(clientKey, arbolKey, data)
        .then(function () { if (window.showNotif) window.showNotif('✅ Árbol ' + arbolId + ' guardado'); })
        .catch(function (e) { if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || '')); });
    } else if (typeof window._fbSetPath === 'function') {
      window._fbSetPath('clientePortal/' + clientKey + '/config/trees/' + arbolKey, data)
        .then(function () { if (window.showNotif) window.showNotif('✅ Árbol ' + arbolId + ' guardado'); })
        .catch(function (e) { if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || '')); });
    }
  };

  /* ── Add document ── */
  window._pcmAddDoc = function (clientKey) {
    var nameEl = document.getElementById('pcm-new-doc-name');
    var urlEl  = document.getElementById('pcm-new-doc-url');
    var name   = nameEl ? nameEl.value.trim() : '';
    var url    = urlEl  ? urlEl.value.trim()  : '';
    if (!name || !url) {
      if (window.showNotif) window.showNotif('⚠️ Completa nombre y URL');
      return;
    }
    window._pcmCurrentDocs = window._pcmCurrentDocs || [];
    window._pcmCurrentDocs.push({ name: name, url: url, ts: Date.now() });
    _saveDocsToFirebase(clientKey, window._pcmCurrentDocs);
    if (nameEl) nameEl.value = '';
    if (urlEl)  urlEl.value  = '';
    // Re-render docs list
    _refreshDocsList(clientKey);
  };

  /* ── Remove document ── */
  window._pcmRemoveDoc = function (idx, clientKey) {
    if (!window._pcmCurrentDocs) return;
    window._pcmCurrentDocs.splice(idx, 1);
    _saveDocsToFirebase(clientKey, window._pcmCurrentDocs);
    _refreshDocsList(clientKey);
  };

  function _saveDocsToFirebase(clientKey, docs) {
    var path = 'clientePortal/' + clientKey + '/config/docs';
    if (typeof window._fbSetPath === 'function') {
      window._fbSetPath(path, docs)
        .then(function () { if (window.showNotif) window.showNotif('✅ Documentos guardados'); })
        .catch(function (e) { if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || '')); });
    } else if (typeof window._fbSetPortalConfig === 'function') {
      // fallback: would need to merge; for now use fbSetPath if available
    }
  }

  function _refreshDocsList(clientKey) {
    var listEl = document.getElementById('pcm-docs-list');
    if (!listEl) return;
    var docs = window._pcmCurrentDocs || [];
    var html = '';
    docs.forEach(function (doc, i) {
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f9fafb;border-radius:8px;margin-bottom:6px;border:1px solid #e5e7eb;">' +
          '<span style="font-size:18px;">' + docIcon(doc.name || '') + '</span>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(doc.name || '') + '</div>' +
            '<div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(doc.url || '') + '</div>' +
          '</div>' +
          '<button onclick="window._pcmRemoveDoc(' + i + ',\'' + clientKey + '\')" ' +
            'style="flex-shrink:0;padding:4px 8px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:11px;cursor:pointer;color:#be123c;">✕</button>' +
        '</div>';
    });
    listEl.innerHTML = html;
  }

  /* ── Save all config (welcome + all visible trees in bulk + docs) ── */
  window._pcmSaveAll = function (clientKey) {
    var welcomeEl = document.getElementById('pcm-welcome');
    var welcomeMsg = welcomeEl ? welcomeEl.value.trim() : '';

    // Collect trees data
    var treesData = {};
    var treeIds = window._pcmCurrentTreeIds || [];
    treeIds.forEach(function (arbolId) {
      var ak = fsKey(arbolId);
      var visEl  = document.getElementById('pcm-vis-'  + ak);
      var noteEl = document.getElementById('pcm-note-' + ak);
      var photoCbs = document.querySelectorAll('.pcm-photo-cb[data-arbol="' + ak + '"]');
      var selectedPhotos = [];
      photoCbs.forEach(function (cb) { if (cb.checked && cb.dataset.url) selectedPhotos.push(cb.dataset.url); });
      treesData[ak] = {
        visible:       visEl  ? visEl.checked  : false,
        adminNote:     noteEl ? (noteEl.value.trim() || null) : null,
        visiblePhotos: selectedPhotos,
        updatedAt:     Date.now()
      };
    });

    var config = {
      welcomeMessage: welcomeMsg || null,
      trees:          treesData,
      docs:           window._pcmCurrentDocs || [],
      updatedAt:      Date.now()
    };

    if (typeof window._fbSetPortalConfig === 'function') {
      window._fbSetPortalConfig(clientKey, config)
        .then(function () { if (window.showNotif) window.showNotif('✅ Configuración completa guardada'); })
        .catch(function (e) { if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || '')); });
    }
  };

  /* ── Expose portal config loader for use by admin inline panel ── */
  window._pcmLoadForClient = function (clientName, bodyId) {
    var body = typeof bodyId === 'string' ? document.getElementById(bodyId) : bodyId;
    if (!body) return;

    body.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">⏳ Cargando configuración del portal...</div>';

    var clientKey = fsKey(clientName);

    // Gather trees
    var db3 = window._dbAll || window._fbRawAll || {};
    var clientTrees = {};
    Object.keys(db3).forEach(function (key) {
      var ev      = db3[key];
      var evCli   = (ev.cliente || (ev.answers && ev.answers.cliente) || '').trim();
      if (evCli.toLowerCase() === clientName.toLowerCase()) {
        var arbolId = ev.arbolId || (ev.answers && ev.answers.arbolId) || key;
        if (!clientTrees[arbolId] || (ev.timestamp || 0) > ((clientTrees[arbolId] && clientTrees[arbolId].timestamp) || 0)) {
          clientTrees[arbolId] = Object.assign({}, ev, { _fbKey: key });
        }
      }
    });

    if (typeof window._fbGetPortalConfig === 'function') {
      window._fbGetPortalConfig(clientKey, function (snap) {
        var savedCfg = (snap && snap.val ? snap.val() : null) || {};
        _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, savedCfg);
      });
    } else {
      _renderPortalConfigEditor(body, clientName, clientKey, clientTrees, {});
    }
  };

})();
