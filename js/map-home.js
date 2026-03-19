/* ═══════════════════════════════════════════
   map-home.js — Home split screen map + GPS tracking
   Bosques Urbanos — forestry engineering app
   Plain <script> tag, all exports on window.
═══════════════════════════════════════════ */

// ── GPS normalization: supports all legacy and new formats ──
function _normalizeGPS(d) {
  var g;
  // New format: string "lat,lng"
  if (d.gps && typeof d.gps === 'string') return d.gps;
  // v7 format: gps object {lat, lng}
  if (d.gps && typeof d.gps === 'object' && d.gps.lat != null) return d.gps.lat + ',' + d.gps.lng;
  // Answers: string gps
  if (d.answers && d.answers.gps && typeof d.answers.gps === 'string') return d.answers.gps;
  // Answers: gps object
  if (d.answers && d.answers.gps && typeof d.answers.gps === 'object' && d.answers.gps.lat != null) return d.answers.gps.lat + ',' + d.answers.gps.lng;
  // Legacy: separate lat/lng fields
  if (d.lat && d.lng) return d.lat + ',' + d.lng;
  if (d.answers && d.answers.lat && d.answers.lng) return d.answers.lat + ',' + d.answers.lng;
  return null;
}
window._normalizeGPS = _normalizeGPS;

var homeMapInstance = null;
var homeMarkers = [];
var _homeUserMarker = null;
var _homeWatchId = null;
var _pickerMapInstance = null;
var _pickerActiveIdx = -1;

var SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var SATELLITE_TILE_OPTS = {
  attribution: 'Tiles &copy; Esri',
  maxZoom: 24,
  maxNativeZoom: 19
};

/* ─────────────────────────────────────────
   MAP INITIALIZATION
───────────────────────────────────────── */

// Auto-resize Leaflet when window resizes (desktop layout change)
window.addEventListener('resize', function () {
  if (homeMapInstance) {
    clearTimeout(window._mapResizeTimer);
    window._mapResizeTimer = setTimeout(function () {
      homeMapInstance.invalidateSize(true);
    }, 150);
  }
});

window.initHomeMap = function () {
  var el = document.getElementById('homeLeafletMap');
  if (!el) return;
  if (homeMapInstance) {
    homeMapInstance.invalidateSize();
    window.refreshHomeMap();
    return;
  }

  homeMapInstance = L.map('homeLeafletMap', {
    zoomControl: false,
    attributionControl: false,
    tap: true
  }).setView([4.711, -74.0721], 12);

  L.tileLayer(SATELLITE_TILE_URL, SATELLITE_TILE_OPTS).addTo(homeMapInstance);

  // No zoom control — pinch-to-zoom on mobile; avoids overlapping floating buttons

  homeMapInstance.on('move', function () {
    if (_pickerMapInstance) {
      var c = _pickerMapInstance.getCenter();
      var info = document.getElementById('pickerCoordInfo');
      if (info) {
        info.textContent = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
      }
    }
  });

  window.refreshHomeMap();

  // Start real-time GPS tracking (Google Maps-style moving blue dot)
  window.startHomeGPSTracking();
};

window.initOrRefreshHomeMap = function () {
  if (!homeMapInstance) {
    window.initHomeMap();
  } else {
    homeMapInstance.invalidateSize();
    window.refreshHomeMap();
  }
};

/* ─────────────────────────────────────────
   REFRESH MAP MARKERS
───────────────────────────────────────── */

window.refreshHomeMap = function () {
  if (!homeMapInstance) return;

  homeMarkers.forEach(function (m) { homeMapInstance.removeLayer(m); });
  homeMarkers = [];

  var db = window._dbAll || {};
  var activeClient = window.APP && window.APP.activeClient;

  // Group entries by arbolId:
  //   - "latest" holds the most-recent evaluation (for risk/species info)
  //   - "gpsSource" holds the most-recent evaluation that actually has GPS
  //     (may be an older record — critical for trees evaluated before GPS was mandatory)
  var latest = {};
  var gpsSource = {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var client = window.getClientName(d);
    if (activeClient && client !== activeClient) return;
    var arbolId = d.arbolId || key;
    var ts = d.ts || d.timestamp || 0;
    // Track latest evaluation overall
    if (!latest[arbolId] || ts > (latest[arbolId].ts || 0)) {
      latest[arbolId] = { key: key, data: d, ts: ts };
    }
    // Track latest evaluation that has GPS coordinates.
    // Supports all known formats: new string "lat,lng", legacy separate lat/lng fields,
    // and GPS stored inside answers (old system).
    var gps = _normalizeGPS(d);
    if (gps) {
      var parts = String(gps).split(',');
      if (parts.length >= 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
        if (!gpsSource[arbolId] || ts > (gpsSource[arbolId].ts || 0)) {
          gpsSource[arbolId] = { key: key, data: d, ts: ts, gps: gps };
        }
      }
    }
  });

  var bounds = [];
  Object.keys(latest).forEach(function (arbolId) {
    var item = latest[arbolId];
    var d = item.data;
    // Use GPS from any evaluation if latest doesn't have one
    var gpsItem = gpsSource[arbolId];
    var gps = gpsItem ? gpsItem.gps : null;
    if (!gps) return;

    var parts = String(gps).split(',');
    if (parts.length < 2) return;
    var lat = parseFloat(parts[0]);
    var lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return;

    var risk = window.getEffectiveRisk(d);
    var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';

    var label = arbolId.length > 6 ? arbolId.substring(0, 6) : arbolId;
    var icon = L.divIcon({
      className: '',
      html: '<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center">' +
          '<div style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.7)"></div>' +
        '</div>' +
        '<div style="margin-top:2px;background:rgba(0,0,0,0.65);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;font-family:\'IBM Plex Mono\',monospace;letter-spacing:.5px">' + label + '</div>' +
      '</div>',
      iconSize: [44, 48],
      iconAnchor: [22, 16]
    });

    var marker = L.marker([lat, lng], { icon: icon });
    marker.on('click', (function (k, itemData) {
      return function () {
        window.openMapActionSheet(k, itemData.data);
      };
    }(item.key, item)));

    marker.addTo(homeMapInstance);
    homeMarkers.push(marker);
    bounds.push([lat, lng]);
  });

  var emptyEl = document.getElementById('homeMapEmpty');
  if (homeMarkers.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    try {
      homeMapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } catch (e) {}
  }
};

/* ─────────────────────────────────────────
   GPS — GO TO MY LOCATION
───────────────────────────────────────── */

window.homeGoToMyLocation = function () {
  // If we already have a tracked position, fly there instantly
  if (_homeUserMarker && homeMapInstance) {
    var ll = _homeUserMarker.getLatLng();
    homeMapInstance.flyTo([ll.lat, ll.lng], 18, { animate: true, duration: 1.0 });
    window.showNotif('📍 Ubicado en tu posición');
    return;
  }
  if (!navigator.geolocation) {
    window.showNotif('Geolocalización no soportada');
    return;
  }
  var btn = document.getElementById('homeLocateBtn');
  if (btn) btn.style.opacity = '0.5';
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      if (homeMapInstance) {
        homeMapInstance.flyTo([lat, lng], 18, { animate: true, duration: 1.0 });
      }
      if (btn) btn.style.opacity = '1';
      window.showNotif('📍 Ubicado en tu posición');
    },
    function () {
      if (btn) btn.style.opacity = '1';
      window.showNotif('No se pudo obtener la ubicación');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

/* ─────────────────────────────────────────
   GPS REAL-TIME TRACKING
───────────────────────────────────────── */

window.startHomeGPSTracking = function () {
  if (!navigator.geolocation || !homeMapInstance) return;
  if (_homeWatchId !== null) return; // already watching

  _homeWatchId = navigator.geolocation.watchPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;

      if (_homeUserMarker) {
        _homeUserMarker.setLatLng([lat, lng]);
      } else {
        var userIcon = L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3);animation:homePulse 1.5s infinite;"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        _homeUserMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 });
        _homeUserMarker.addTo(homeMapInstance);
      }
    },
    function (err) {
      // Only warn once — PERMISSION_DENIED (code 1) won't resolve on retry
      if (err.code === 1) {
        navigator.geolocation.clearWatch(_homeWatchId);
        _homeWatchId = null;
      } else {
        console.warn('GPS tracking error:', err.message);
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
};

window.stopHomeGPSTracking = function () {
  if (_homeWatchId !== null) {
    navigator.geolocation.clearWatch(_homeWatchId);
    _homeWatchId = null;
  }
  if (_homeUserMarker && homeMapInstance) {
    homeMapInstance.removeLayer(_homeUserMarker);
    _homeUserMarker = null;
  }
};

/* ─────────────────────────────────────────
   MAP PICKER (for form GPS selection)
───────────────────────────────────────── */

window.openMapPicker = function (idx, centerCoords) {
  _pickerActiveIdx = idx;
  var modal = document.getElementById('mapPickerModal');
  if (modal) modal.classList.add('open');

  setTimeout(function () {
    var pickerEl = document.getElementById('pickerMap');
    if (!pickerEl) return;

    if (!_pickerMapInstance) {
      _pickerMapInstance = L.map('pickerMap', {
        zoomControl: true,
        attributionControl: false,
        tap: true
      }).setView([4.711, -74.0721], 16);

      L.tileLayer(SATELLITE_TILE_URL, SATELLITE_TILE_OPTS).addTo(_pickerMapInstance);

      _pickerMapInstance.on('move', function () {
        var c = _pickerMapInstance.getCenter();
        var info = document.getElementById('pickerCoordInfo');
        if (info) {
          info.textContent = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
        }
      });
    }

    _pickerMapInstance.invalidateSize();

    // Center on provided coords (e.g. from user GPS) or try geolocation
    if (centerCoords && centerCoords.lat && centerCoords.lng) {
      _pickerMapInstance.setView([centerCoords.lat, centerCoords.lng], 19);
      // Show user location marker
      if (!_pickerMapInstance._userDot) {
        _pickerMapInstance._userDot = L.circleMarker([centerCoords.lat, centerCoords.lng], {
          radius: 8, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9,
          weight: 2
        }).bindTooltip('Tu ubicación', { permanent: false }).addTo(_pickerMapInstance);
      } else {
        _pickerMapInstance._userDot.setLatLng([centerCoords.lat, centerCoords.lng]);
      }
    } else {
      navigator.geolocation && navigator.geolocation.getCurrentPosition(
        function (pos) {
          _pickerMapInstance.setView([pos.coords.latitude, pos.coords.longitude], 19);
        },
        function () {}
      );
    }

    setTimeout(function () {
      window.addExistingTreesToPickerMap();
    }, 400);
  }, 100);
};

window.closeMapPicker = function () {
  var modal = document.getElementById('mapPickerModal');
  if (modal) modal.classList.remove('open');
  _pickerActiveIdx = -1;
};

window.confirmMapPicker = function () {
  if (!_pickerMapInstance) return;
  var c = _pickerMapInstance.getCenter();
  var gpsStr = c.lat.toFixed(7) + ',' + c.lng.toFixed(7);

  // Expose for form.js to pick up
  window._pickerGpsResult = { idx: _pickerActiveIdx, gps: gpsStr };
  if (typeof window.applyPickerGps === 'function') {
    window.applyPickerGps(_pickerActiveIdx, gpsStr);
  }

  // Invoke wizard callback if picker was opened from wizard
  if (typeof window._mapPickerCallback === 'function') {
    window._mapPickerCallback(c.lat, c.lng);
    window._mapPickerCallback = null;
  }

  window.closeMapPicker();
  window.showNotif('📍 Ubicación confirmada');
};

window.addExistingTreesToPickerMap = function () {
  if (!_pickerMapInstance) return;
  var db = window._dbAll || {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var gps = _normalizeGPS(d);
    if (!gps) return;
    var parts = String(gps).split(',');
    if (parts.length < 2) return;
    var lat = parseFloat(parts[0]);
    var lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return;

    var risk = window.getEffectiveRisk(d);
    var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:' + color + ';border:2px solid #fff;opacity:0.75;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    L.marker([lat, lng], { icon: icon })
      .bindTooltip(d.arbolId || key, { permanent: false, direction: 'top' })
      .addTo(_pickerMapInstance);
  });
};

window.reEvalFromPicker = function (arbolId) {
  var db = window._dbAll || {};
  var best = null;
  var bestTs = 0;
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var aid = d.arbolId || key;
    if (aid === arbolId) {
      var ts = d.ts || d.timestamp || 0;
      if (ts > bestTs) { best = d; bestTs = ts; }
    }
  });
  if (best) {
    window.APP.dbRevalBase = best;
    if (typeof window.dbStartReeval === 'function') window.dbStartReeval();
  }
  window.closeMapPicker();
};

/* ─────────────────────────────────────────
   PANEL — TREES LIST
───────────────────────────────────────── */

window.homeRenderTrees = function () {
  var container = document.getElementById('home-tree-list');
  if (!container) return;

  var db = window._dbAll || {};
  var activeClient = window.APP && window.APP.activeClient;
  var riskFilter = (window.APP && window.APP.homeRiskFilter) || '';
  var searchEl = document.getElementById('homeTreeSearch');
  var searchTxt = searchEl ? searchEl.value.toLowerCase().trim() : '';

  // Group by arbolId — keep latest per tree
  var latest = {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var client = window.getClientName(d);
    if (activeClient && client !== activeClient) return;
    var arbolId = d.arbolId || key;
    var ts = d.ts || d.timestamp || 0;
    if (!latest[arbolId] || ts > (latest[arbolId].ts || 0)) {
      latest[arbolId] = { key: key, data: d, ts: ts };
    }
  });

  var entries = Object.keys(latest).map(function (aid) {
    return latest[aid];
  });

  // Apply risk filter
  if (riskFilter) {
    entries = entries.filter(function (item) {
      return window.getEffectiveRisk(item.data) === riskFilter;
    });
  }

  // Apply search
  if (searchTxt) {
    entries = entries.filter(function (item) {
      var d = item.data;
      var haystack = [
        d.arbolId || '',
        d.especie || '',
        d.evaluador || '',
        window.getClientName(d)
      ].join(' ').toLowerCase();
      return haystack.indexOf(searchTxt) !== -1;
    });
  }

  window.APP.currentFiltered = entries;

  if (entries.length === 0) {
    container.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--muted);font-weight:600;">Sin resultados</div>';
    return;
  }

  container.innerHTML = entries.map(function (item) {
    var d = item.data;
    var key = item.key;
    var risk = window.getEffectiveRisk(d);
    var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
    var arbolId = d.arbolId || key;
    var gps = _normalizeGPS(d) || '';
    var gpsHtml = gps
      ? '<span class="tc-gps">📍 ' + String(gps).substring(0, 22) + '</span>'
      : '<span style="color:#ccc;font-size:10px;">Sin GPS</span>';
    var date = d.ts ? new Date(d.ts).toLocaleDateString('es-CO') : (d.fecha || '—');
    var isSelected = window.APP.selectedTrees && window.APP.selectedTrees.has(key);
    var encodedId = encodeURIComponent(arbolId);

    return '<div class="tree-card" style="margin-bottom:8px;cursor:pointer;" onclick="if(!event.target.closest(\'input,button\'))window.openMASFromKey&&window.openMASFromKey(\'' + key + '\')">' +
      '<div class="tc-head" style="display:flex;align-items:center;gap:10px;">' +
        '<input type="checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="window.toggleTreeSelection(\'' + key + '\')" style="width:18px;height:18px;accent-color:var(--g700);flex-shrink:0;">' +
        '<div style="width:12px;height:12px;border-radius:50%;background:' + color + ';flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.2);"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="tc-id">' + arbolId + '</div>' +
          '<div class="tc-species">' + (d.especie || '—') + '</div>' +
          '<div class="tc-evaluator">' + (d.evaluador || '—') + ' · ' + date + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tc-body">' +
        '<div class="tc-pills">' +
          '<span class="tc-pill tp-' + risk + '">' + risk.toUpperCase() + '</span>' +
          (d.isaLevel ? '<span class="tc-pill" style="border-color:#d1d5db;color:#6b7280;">ISA</span>' : '') +
        '</div>' +
        '<div class="tc-meta">' +
          gpsHtml +
          '<button onclick="window.homeReeval(\'' + encodedId + '\')" style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:7px;border:1.2px solid var(--g700);background:var(--g50);color:var(--g800);cursor:pointer;white-space:nowrap;">↺ Re-eval</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};

var _RISK_DOT_COLORS = {
  'extremo': '#dc2626', 'alto': '#ea580c', 'moderado': '#ca8a04', 'bajo': '#15803d', '': '#9ca3af'
};
var _RISK_LABELS_ES = {
  'extremo': 'Extremo', 'alto': 'Alto', 'moderado': 'Moderado', 'bajo': 'Bajo', '': 'Todos'
};

function _updateFilterBtn(lvl) {
  var dot   = document.getElementById('home-filter-dot');
  var label = document.getElementById('home-filter-label');
  var btn   = document.getElementById('home-filter-btn');
  if (dot)   dot.style.background = _RISK_DOT_COLORS[lvl] || '#9ca3af';
  if (label) label.textContent    = _RISK_LABELS_ES[lvl] || 'Todos';
  if (btn) {
    btn.style.borderColor = lvl ? (_RISK_DOT_COLORS[lvl] + '66') : '#d4cfc5';
    btn.style.background  = lvl ? (_RISK_DOT_COLORS[lvl] + '14') : '#f4f1eb';
  }
}

window.homeSetRisk = function (lvl) {
  // Toggle off if same filter tapped again
  window.APP.homeRiskFilter = (window.APP.homeRiskFilter === lvl && lvl !== '') ? '' : lvl;
  _updateFilterBtn(window.APP.homeRiskFilter);
  window.homeRenderTrees();
};

window.homeToggleRiskMenu = function (e) {
  if (e) e.stopPropagation();
  var menu = document.getElementById('home-risk-menu');
  if (!menu) return;
  var isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    // Close on outside tap
    setTimeout(function () {
      document.addEventListener('click', function _close() {
        menu.style.display = 'none';
        document.removeEventListener('click', _close);
      }, { once: true });
    }, 10);
  }
};

window.homeFilterTrees = function () {
  window.homeRenderTrees();
};

window.homeReeval = function (encodedId) {
  var arbolId = decodeURIComponent(encodedId);
  var db = window._dbAll || {};
  var best = null;
  var bestTs = 0;
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var aid = d.arbolId || key;
    if (aid === arbolId) {
      var ts = d.ts || d.timestamp || 0;
      if (ts > bestTs) { best = d; bestTs = ts; }
    }
  });
  if (best) {
    window.APP.dbRevalBase = best;
    if (typeof window.dbStartReeval === 'function') {
      window.dbStartReeval();
    } else {
      window.switchTab('form');
    }
  }
};

/* ─────────────────────────────────────────
   PANEL — PHOTOS (grouped by tree)
───────────────────────────────────────── */

window.renderPanelPhotos = function () {
  var grid = document.getElementById('panel-photos-grid');
  if (!grid) return;

  var db = window._dbAll || {};
  var activeClient = window.APP && window.APP.activeClient;

  if (!activeClient) {
    grid.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-weight:600;">Selecciona un cliente para ver sus fotos</div>';
    return;
  }

  // Group latest eval per tree
  var latestPerTree = {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    if (window.getClientName(d) !== activeClient) return;
    var aid = d.arbolId || key;
    var ts = d.ts || d.timestamp || 0;
    if (!latestPerTree[aid] || ts > (latestPerTree[aid].ts || 0)) {
      latestPerTree[aid] = { key: key, data: d, ts: ts };
    }
  });

  var treeIds = Object.keys(latestPerTree);
  if (treeIds.length === 0) {
    grid.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-weight:600;">Sin árboles registrados para este cliente</div>';
    return;
  }

  var html = '';
  treeIds.forEach(function (aid) {
    var item = latestPerTree[aid];
    var photos = window.FB ? window.FB.getPhotoUrls(item.data) : (item.data.photoUrls || item.data.photos || []);
    html += '<div style="margin-bottom:18px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">' +
        '<div style="font-size:12px;font-weight:800;color:var(--g800);display:flex;align-items:center;gap:5px;"><span>🌳</span>' + aid + '</div>' +
        '<div style="display:flex;gap:5px;">' +
          '<button onclick="window._panelUploadPhotoForTree(\'' + encodeURIComponent(aid) + '\',\'camera\')" style="padding:5px 10px;background:#0f3320;color:#fff;border:none;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">📷</button>' +
          '<button onclick="window._panelUploadPhotoForTree(\'' + encodeURIComponent(aid) + '\',\'gallery\')" style="padding:5px 10px;background:#1d4ed8;color:#fff;border:none;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">🖼️</button>' +
        '</div>' +
      '</div>';
    if (photos.length === 0) {
      html += '<div style="font-size:11px;color:var(--muted);padding:4px 0 8px;">Sin fotos</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">';
      photos.forEach(function (url, idx) {
        html += '<div style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:9px;background:#111;cursor:pointer;" onclick="window.openPhotoModal(\'' + item.key + '\',' + idx + ')">' +
          '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentNode.style.display=\'none\'">' +
        '</div>';
      });
      html += '</div>';
    }
    // Field notes for this tree
    var notasVal = (item.data.notas || '').replace(/"/g, '&quot;');
    var encAid = encodeURIComponent(aid);
    var encKey = encodeURIComponent(item.key);
    html += '<div style="margin-top:4px;">' +
      '<div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;margin-bottom:3px;">📝 Notas</div>' +
      '<textarea id="photos-notas-' + encAid + '" rows="2" placeholder="Notas de campo..." ' +
        'style="width:100%;box-sizing:border-box;padding:6px 9px;border:1px solid #d4cfc5;border-radius:7px;font-size:11px;font-family:\'IBM Plex Sans\',sans-serif;color:#3d3830;background:#fafaf5;resize:vertical;outline:none;">' +
        notasVal +
      '</textarea>' +
      '<button onclick="window._photosPanelSaveNote(\'' + encAid + '\',\'' + encKey + '\')" ' +
        'style="margin-top:3px;padding:4px 10px;background:#0f3320;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">Guardar nota</button>' +
    '</div>';
    html += '</div>';
  });

  grid.innerHTML = html;
};

window._panelUploadPhotoForTree = function (encodedArbolId, source) {
  var inputId = (source === 'gallery') ? 'photo-input-gallery' : 'photo-input';
  var inp = document.getElementById(inputId);
  if (!inp) return;
  inp.dataset.arbolId = decodeURIComponent(encodedArbolId);
  inp.value = '';
  inp.click();
};

window._photosPanelSaveNote = function (encodedAid, encodedEvalKey) {
  var aid     = decodeURIComponent(encodedAid);
  var evalKey = decodeURIComponent(encodedEvalKey);
  var ta = document.getElementById('photos-notas-' + encodedAid);
  var notas = ta ? ta.value.trim() : '';
  if (!evalKey) { window.showNotif('Sin evaluación para guardar la nota'); return; }
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }
  window.FB.updateEval(evalKey, { notas: notas })
    .then(function () { window.showNotif('📝 Nota guardada para ' + aid); })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error')); });
};

window.panelUploadPhoto = function (file, arbolId) {
  if (!file) return;
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('Selecciona un cliente primero'); return; }
  if (!arbolId) { window.showNotif('Selecciona un árbol desde el panel'); return; }

  // Find latest eval key for this tree
  var db2 = window._dbAll || {};
  var latestKey = null, latestTs = 0;
  Object.keys(db2).forEach(function (k) {
    var d = db2[k];
    var aid = d.arbolId || k;
    if (aid !== arbolId) return;
    var ts = d.ts || d.timestamp || 0;
    if (ts > latestTs) { latestTs = ts; latestKey = k; }
  });

  if (!latestKey) { window.showNotif('Árbol no encontrado en DB'); return; }
  window.showNotif('⏫ Subiendo foto...');
  window.FB.uploadPhoto(activeClient, arbolId, file)
    .then(function (result) { return window.FB.addPhotoToEval(latestKey, result.url); })
    .then(function () {
      window.showNotif('✅ Foto guardada');
      window.renderPanelPhotos();
    })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error al subir')); });
};

/* ─────────────────────────────────────────
   PANEL — FILES / DOCUMENTS
───────────────────────────────────────── */

function _panelFileRow(clienteId, key, doc) {
  var icon = doc.name && /\.pdf$/i.test(doc.name) ? '📄' : '📎';
  var date = doc.ts ? new Date(doc.ts).toLocaleDateString('es-CO') : '';
  var encC = encodeURIComponent(clienteId);
  return '<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid rgba(240,235,224,.8);">' +
    '<span style="font-size:20px;flex-shrink:0;">' + icon + '</span>' +
    '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (doc.name || 'Documento') + '</div>' +
      '<div style="font-size:10px;color:var(--muted);">' + date + (doc.arbolId ? ' · 🌳 ' + doc.arbolId : '') + '</div>' +
    '</div>' +
    '<a href="' + doc.url + '" target="_blank" rel="noopener" style="padding:5px 11px;background:#eff6ff;color:#1d4ed8;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;">Abrir</a>' +
    '<button onclick="_panelDeleteFile(\'' + encC + '\',\'' + key + '\')" style="background:none;border:none;font-size:15px;cursor:pointer;color:var(--muted);flex-shrink:0;padding:4px;">🗑️</button>' +
  '</div>';
}

window.renderPanelFiles = function () {
  var body = document.getElementById('panel-files-body');
  if (!body) return;

  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) {
    body.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-weight:600;">Selecciona un cliente para ver sus archivos</div>';
    return;
  }

  var safeKey = window._fsKey ? window._fsKey(activeClient) : activeClient.replace(/[.#$[\]/]/g, '_');
  var rawDocs = window._archivosAll && window._archivosAll[safeKey] ? window._archivosAll[safeKey] : {};
  var entries = Object.entries(rawDocs);

  var clientLevel = entries.filter(function (e) { return !e[1].arbolId; });
  var byTree = {};
  entries.filter(function (e) { return e[1].arbolId; }).forEach(function (e) {
    var aid = e[1].arbolId;
    if (!byTree[aid]) byTree[aid] = [];
    byTree[aid].push(e);
  });

  var html = '';

  if (clientLevel.length > 0) {
    html += '<div style="font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin:4px 0 8px;">Archivos del cliente</div>';
    html += clientLevel.map(function (e) { return _panelFileRow(activeClient, e[0], e[1]); }).join('');
  }

  // Build latest eval lookup per tree (for notes)
  var db = window._dbAll || {};
  var latestEvalByTree = {};
  Object.keys(db).forEach(function (key) {
    var ev = db[key];
    if ((window.getClientName ? window.getClientName(ev) : (ev.cliente || '')).trim() !== activeClient.trim()) return;
    var aid = (ev.arbolId || key).toUpperCase();
    var ts = ev.ts || ev.timestamp || 0;
    if (!latestEvalByTree[aid] || ts > (latestEvalByTree[aid].ts || 0)) {
      latestEvalByTree[aid] = { key: key, notas: ev.notas || '', ts: ts };
    }
  });

  var treeKeys = Object.keys(byTree);
  if (treeKeys.length > 0) {
    html += '<div style="font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin:14px 0 8px;">Por árbol</div>';
    treeKeys.forEach(function (aid) {
      var evalInfo = latestEvalByTree[aid.toUpperCase()] || {};
      var evalKey = evalInfo.key || '';
      var notasVal = (evalInfo.notas || '').replace(/"/g, '&quot;');
      html += '<div style="margin-bottom:14px;background:#fafaf5;border:1px solid #e5e0d5;border-radius:10px;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:#f0ece3;border-bottom:1px solid #e5e0d5;">' +
          '<span style="font-size:14px;">🌳</span>' +
          '<span style="font-size:12px;font-weight:800;color:var(--g800);">' + aid + '</span>' +
          '<button onclick="window._panelUploadFileForTree(\'' + encodeURIComponent(aid) + '\')" style="margin-left:auto;padding:3px 9px;background:transparent;border:1.2px solid #d4cfc5;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;color:#166534;font-family:\'IBM Plex Sans\',sans-serif;">+ Archivo</button>' +
        '</div>' +
        '<div style="padding:8px 10px;">';
      byTree[aid].forEach(function (e) { html += _panelFileRow(activeClient, e[0], e[1]); });
      // Notes section
      html += '<div style="margin-top:8px;">' +
        '<div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;margin-bottom:4px;">📝 Notas de campo</div>' +
        '<textarea id="panel-notas-' + encodeURIComponent(aid) + '" rows="2" placeholder="Observaciones, notas de terreno..." ' +
          'style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #d4cfc5;border-radius:7px;font-size:12px;font-family:\'IBM Plex Sans\',sans-serif;color:#3d3830;background:#fff;resize:vertical;outline:none;">' +
          notasVal +
        '</textarea>' +
        '<button onclick="window._panelSaveTreeNote(\'' + encodeURIComponent(aid) + '\',\'' + encodeURIComponent(evalKey) + '\')" ' +
          'style="margin-top:4px;padding:5px 12px;background:#0f3320;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">Guardar nota</button>' +
      '</div>';
      html += '</div></div>';
    });
  }

  if (html === '') {
    html = '<div style="padding:28px;text-align:center;color:var(--muted);font-weight:600;font-size:13px;">Sin archivos aún. Usa el botón de abajo para subir.</div>';
  }

  body.innerHTML = html;
};

window.panelUploadFile = function (file, arbolId) {
  if (!file) return;
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('Selecciona un cliente primero'); return; }
  window.showNotif('⏫ Subiendo archivo...');
  window.FB.uploadDoc(activeClient, file)
    .then(function (result) {
      var meta = { name: result.name || file.name, url: result.url, type: result.type || 'storage', ts: Date.now() };
      if (arbolId) meta.arbolId = arbolId;
      return window._fbPushArchivo(activeClient, meta);
    })
    .then(function () { window.showNotif('✅ Archivo guardado'); })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error al subir')); });
};

window._panelUploadFileForTree = function (encodedArbolId) {
  var inp = document.getElementById('file-upload-input');
  if (!inp) return;
  inp.dataset.arbolId = decodeURIComponent(encodedArbolId);
  inp.click();
};

window._panelDeleteFile = function (encodedClienteId, key) {
  var clienteId = decodeURIComponent(encodedClienteId);
  if (!confirm('¿Eliminar este archivo?')) return;
  window._fbRemoveArchivo(clienteId, key)
    .then(function () { window.showNotif('Archivo eliminado'); })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error')); });
};

window._panelSaveTreeNote = function (encodedAid, encodedEvalKey) {
  var aid     = decodeURIComponent(encodedAid);
  var evalKey = decodeURIComponent(encodedEvalKey);
  var ta = document.getElementById('panel-notas-' + encodedAid);
  var notas = ta ? ta.value.trim() : '';
  if (!evalKey) { window.showNotif('Sin evaluación para guardar la nota'); return; }
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }
  window.FB.updateEval(evalKey, { notas: notas })
    .then(function () { window.showNotif('📝 Nota guardada para ' + aid); })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error')); });
};

/* ─────────────────────────────────────────
   PANEL TABS
───────────────────────────────────────── */

window.switchPanelTab = function (tab) {
  // Legacy stub — no longer needed with simplified layout
  if (tab === 'photos') window.renderPanelPhotos();
  if (tab === 'files') window.renderPanelFiles();
  if (tab === 'trees') window.homeRenderTrees();
};

/* ─────────────────────────────────────────
   PANEL RENDER (main entry)
───────────────────────────────────────── */

window.homeRenderPanel = function () {
  if (typeof window.updateClientUI === 'function') window.updateClientUI();
  window.homeRenderTrees();
  _updatePanelClientBar();
};

function _updatePanelClientBar() {
  var activeClient = window.APP && window.APP.activeClient;

  // Compute quick stats
  var db = window._dbAll || {};
  var treeIds = {};
  var extremo = 0;
  if (activeClient) {
    Object.keys(db).forEach(function (key) {
      var d = db[key];
      if (window.getClientName(d) !== activeClient) return;
      var aid = d.arbolId || key;
      treeIds[aid] = true;
      if (window.getEffectiveRisk(d) === 'extremo') extremo++;
    });
  }
  var n = Object.keys(treeIds).length;

  // Update floating bottom bar
  var nameEl = document.getElementById('panel-client-name');
  if (nameEl) nameEl.textContent = activeClient || 'Sin cliente seleccionado';

  var statsEl = document.getElementById('panel-client-stats');
  if (statsEl) {
    statsEl.textContent = activeClient
      ? (n + ' árbol' + (n !== 1 ? 'es' : '') + (extremo > 0 ? ' · 🔴 ' + extremo + ' extremo' : ''))
      : 'Selecciona un cliente en el mapa';
  }

  // Update dot color (worst risk)
  var dot = document.getElementById('home-float-dot');
  if (dot) {
    dot.style.background = (extremo > 0) ? '#dc2626' : (activeClient ? '#22c55e' : '#6b7280');
    dot.style.boxShadow = (extremo > 0) ? '0 0 0 3px rgba(220,38,38,.25)' : '0 0 0 3px rgba(107,114,128,.2)';
  }

  // Legacy: keep panel-client-bar hidden (stubs only)
  var bar = document.getElementById('panel-client-bar');
  if (bar) bar.style.display = 'none';
}

/* ─────────────────────────────────────────
   SEARCH SHEET
───────────────────────────────────────── */

window.openHomeSearch = function () {
  var sheet = document.getElementById('homeSearchSheet');
  if (sheet) sheet.classList.add('open');
  setTimeout(function () {
    var inp = document.getElementById('homeSearchInput');
    if (inp) { inp.value = ''; inp.focus(); }
    window.homeSearchFilter();
  }, 80);
};

window.closeHomeSearch = function () {
  var sheet = document.getElementById('homeSearchSheet');
  if (sheet) sheet.classList.remove('open');
};

window.homeSearchFilter = function () {
  var inp = document.getElementById('homeSearchInput');
  var q = inp ? inp.value.toLowerCase().trim() : '';
  var list = document.getElementById('homeSearchList');
  if (!list) return;

  var db = window._dbAll || {};
  var activeClient = window.APP && window.APP.activeClient;

  // ── Section 1: Trees ──────────────────────────────
  var latest = {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    if (activeClient && window.getClientName(d) !== activeClient) return;
    var aid = d.arbolId || key;
    var ts = d.ts || d.timestamp || 0;
    if (!latest[aid] || ts > (latest[aid].ts || 0)) {
      latest[aid] = { key: key, data: d, ts: ts };
    }
  });

  var entries = Object.keys(latest).map(function (aid) { return latest[aid]; });

  if (q) {
    entries = entries.filter(function (item) {
      var d = item.data;
      return [d.arbolId || '', d.especie || '', d.evaluador || '', window.getClientName(d) || '']
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  var html = '';

  // Trees section header
  if (!q || entries.length > 0) {
    html += '<div style="padding:10px 4px 4px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;">🌳 Árboles (' + entries.length + ')</div>';
  }

  if (entries.length === 0 && !q) {
    html += '<div style="padding:8px 4px 12px;font-size:12px;color:#aaa;">Sin árboles registrados</div>';
  } else {
    html += entries.map(function (item) {
      var d = item.data;
      var risk = window.getEffectiveRisk(d);
      var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
      var arbolId = d.arbolId || item.key;
      var hasGps = !!_normalizeGPS(d);
      return '<div onclick="window.closeHomeSearch();setTimeout(function(){window.openMASFromKey&&window.openMASFromKey(\'' + item.key + '\')},180)" ' +
        'style="display:flex;align-items:center;gap:10px;padding:11px 4px;border-bottom:1px solid #f0ebe0;cursor:pointer;">' +
        '<div style="width:11px;height:11px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:800;color:#0f3320;">' + arbolId + (hasGps ? ' <span style="font-size:10px;color:#15803d">📍</span>' : '') + '</div>' +
          '<div style="font-size:11px;color:#6b6560;">' + (d.especie || '—') + ' · ' + (window.getClientName(d) || '—') + '</div>' +
        '</div>' +
        '<div style="font-size:10px;font-weight:700;color:' + color + ';text-transform:uppercase;">' + risk + '</div>' +
      '</div>';
    }).join('');
  }

  // ── Section 2: Client photos (not assigned to a tree) ──
  var clientesAll = window._clientesAll || {};
  var clientPhotos = [];
  if (activeClient) {
    Object.keys(clientesAll).forEach(function (k) {
      var c = clientesAll[k];
      if ((c.nombre || c.name || '').trim() === activeClient) {
        var photos = c.photoUrls || c.photos || [];
        photos.forEach(function (url, i) {
          if (url) clientPhotos.push({ url: url, idx: i, key: k });
        });
      }
    });
    // Also check local fallback
    if (window._clientPhotos && window._clientPhotos[activeClient]) {
      window._clientPhotos[activeClient].forEach(function (url, i) {
        clientPhotos.push({ url: url, idx: i, key: null });
      });
    }
  }

  if (!q && activeClient) {
    html += '<div style="padding:14px 4px 4px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;">📷 Fotos del cliente (' + clientPhotos.length + ')</div>';
    if (clientPhotos.length === 0) {
      html += '<div style="padding:6px 4px 10px;font-size:12px;color:#aaa;">Sin fotos — usa 📷 para añadir</div>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 0 12px;">';
      clientPhotos.forEach(function (item) {
        html += '<img src="' + item.url + '" style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid #e5e0d5;" ' +
          'onclick="window.openPhotoLightbox&&openPhotoLightbox(\'' + item.url + '\')" loading="lazy">';
      });
      html += '</div>';
    }

    // ── Section 3: Client info summary ──
    html += '<div style="padding:6px 4px 4px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7a746e;">📊 Resumen del cliente</div>';
    var totalTrees = Object.keys(latest).length;
    var withGps = Object.values(latest).filter(function(it){ return !!_normalizeGPS(it.data); }).length;
    var extremo = Object.values(latest).filter(function(it){ return window.getEffectiveRisk(it.data)==='extremo'; }).length;
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px 0 16px;">' +
      '<div style="background:#f4f1eb;border-radius:10px;padding:10px 8px;text-align:center;">' +
        '<div style="font-size:20px;font-weight:900;color:#0f3320;">' + totalTrees + '</div>' +
        '<div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;">Árboles</div>' +
      '</div>' +
      '<div style="background:#f4f1eb;border-radius:10px;padding:10px 8px;text-align:center;">' +
        '<div style="font-size:20px;font-weight:900;color:#15803d;">' + withGps + '</div>' +
        '<div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;">Con GPS</div>' +
      '</div>' +
      '<div style="background:' + (extremo > 0 ? '#fef2f2' : '#f4f1eb') + ';border-radius:10px;padding:10px 8px;text-align:center;">' +
        '<div style="font-size:20px;font-weight:900;color:' + (extremo > 0 ? '#dc2626' : '#0f3320') + ';">' + extremo + '</div>' +
        '<div style="font-size:9px;color:#7a746e;font-weight:700;text-transform:uppercase;">Extremo</div>' +
      '</div>' +
    '</div>';
  }

  if (!html) {
    html = '<div style="padding:28px;text-align:center;color:#7a746e;font-size:13px;">Sin resultados</div>';
  }

  list.innerHTML = html;
};

/* ─────────────────────────────────────────
   QUICK NOTES SHEET
───────────────────────────────────────── */

window.openQuickNotes = function () {
  var activeClient = window.APP && window.APP.activeClient;
  var lbl = document.getElementById('home-notes-target-label');
  if (lbl) lbl.textContent = activeClient ? 'Cliente: ' + activeClient : 'Sin cliente seleccionado';
  var ta = document.getElementById('homeNotesText');
  if (ta) ta.value = '';
  var sheet = document.getElementById('homeNotesSheet');
  if (sheet) sheet.classList.add('open');
  setTimeout(function () { if (ta) ta.focus(); }, 80);
};

window.closeQuickNotes = function () {
  var sheet = document.getElementById('homeNotesSheet');
  if (sheet) sheet.classList.remove('open');
};

window.saveQuickNote = function () {
  var ta = document.getElementById('homeNotesText');
  var text = ta ? ta.value.trim() : '';
  if (!text) { window.showNotif('Escribe una nota primero'); return; }

  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('Selecciona un cliente para asociar la nota'); return; }

  // Find the most recently evaluated tree for this client and save the note there
  var db = window._dbAll || {};
  var best = null;
  var bestTs = 0;
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    if (window.getClientName(d) !== activeClient) return;
    var ts = d.ts || d.timestamp || 0;
    if (ts > bestTs) { best = key; bestTs = ts; }
  });

  if (!best) { window.showNotif('Sin árboles para asociar la nota'); return; }
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }

  window.FB.updateEval(best, { notas: text })
    .then(function () {
      window.showNotif('📝 Nota guardada para ' + activeClient);
      window.closeQuickNotes();
    })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error')); });
};

/* ─────────────────────────────────────────
   ADD PHOTO TO CLIENT (not assigned to any tree)
───────────────────────────────────────── */
window.homeAddClientPhoto = function () {
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('⚠️ Selecciona un cliente primero'); return; }
  var inp = document.getElementById('clientPhotoInput');
  if (inp) inp.click();
};

window.homeClientPhotoSelected = async function (input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) return;
  input.value = '';

  window.showNotif('⏳ Subiendo foto...');
  try {
    var result = await window.FB.uploadPhoto(activeClient, '_cliente', file);
    var photoUrl = result && result.url;
    if (!photoUrl) throw new Error('Sin URL');

    // Save URL under /clientes/{key}/photoUrls
    await _saveClientPhoto(activeClient, photoUrl);
    window.showNotif('✅ Foto guardada en el cliente');
  } catch (e) {
    window.showNotif('❌ Error al subir foto');
    console.error(e);
  }
};

async function _saveClientPhoto(clientName, photoUrl) {
  // Find or create the client record key
  var clientesAll = window._clientesAll || {};
  var clientKey = null;
  Object.keys(clientesAll).forEach(function (k) {
    var c = clientesAll[k];
    if ((c.nombre || c.name || '').trim() === clientName) clientKey = k;
  });

  if (clientKey) {
    var existing = clientesAll[clientKey];
    var photos = (existing.photoUrls || []).slice();
    photos.push(photoUrl);
    await window.FB.updateCliente(clientKey, { photoUrls: photos });
    // Update local cache
    if (window._clientesAll && window._clientesAll[clientKey]) {
      window._clientesAll[clientKey].photoUrls = photos;
    }
  } else if (typeof window._fbPushCliente === 'function') {
    // Fallback: add a client record if none exists
    var doc = { nombre: clientName, photoUrls: [photoUrl] };
    await window._fbPushCliente(doc);
  } else {
    // Local-only fallback
    if (!window._clientPhotos) window._clientPhotos = {};
    if (!window._clientPhotos[clientName]) window._clientPhotos[clientName] = [];
    window._clientPhotos[clientName].push(photoUrl);
  }
}

/* ─────────────────────────────────────────
   ADD FILE TO CLIENT (not assigned to any tree)
───────────────────────────────────────── */
window.homeAddClientFile = function () {
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('⚠️ Selecciona un cliente primero'); return; }
  var inp = document.getElementById('clientFileInput');
  if (inp) inp.click();
};

window.homeClientFileSelected = async function (input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) return;
  input.value = '';

  window.showNotif('⏳ Subiendo archivo...');
  try {
    var result = await window.FB.uploadDoc(activeClient, file);
    // Save metadata to Firebase DB under /archivos/{clientKey}/
    var meta = { name: result.name || file.name, url: result.url, type: result.type || 'base64', ts: Date.now() };
    if (typeof window._fbPushArchivo === 'function') {
      await window._fbPushArchivo(activeClient, meta);
    }
    window.showNotif('✅ Archivo guardado: ' + file.name);
    // Refresh panel files
    if (typeof window.renderPanelFiles === 'function') window.renderPanelFiles();
  } catch (e) {
    window.showNotif('❌ Error al subir: ' + (e.message || 'desconocido'));
    console.error(e);
  }
};

window.homePanelOpenFiles = function () {
  window.homeAddClientFile();
};

window.homePanelOpenPhotos = function () {
  window.homeAddClientPhoto();
};

window.panelExportClientPDF = function () {
  var activeClient = window.APP && window.APP.activeClient;
  if (!activeClient) { window.showNotif('Selecciona un cliente primero'); return; }
  window.dbExportClientPDF && window.dbExportClientPDF(encodeURIComponent(activeClient));
};

/* ─────────────────────────────────────────
   PANEL RESIZER (drag handle)
───────────────────────────────────────── */

(function setupPanelResizer() {
  function init() {
    var resizer = document.getElementById('panelResizer');
    var homePanel = document.getElementById('homePanel');
    if (!resizer || !homePanel) return;

    var startY = 0;
    var startH = 0;
    var isDragging = false;

    function onStart(e) {
      isDragging = true;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      startH = homePanel.offsetHeight;
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var delta = startY - clientY;
      var newH = Math.min(Math.max(startH + delta, 120), window.innerHeight * 0.85);
      homePanel.style.height = newH + 'px';
      if (homeMapInstance) homeMapInstance.invalidateSize();
      e.preventDefault();
    }

    function onEnd() {
      isDragging = false;
      document.body.style.userSelect = '';
    }

    resizer.addEventListener('mousedown', onStart);
    resizer.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());

/* ─────────────────────────────────────────
   MAP ACTION SHEET — tap tree on map
───────────────────────────────────────── */

var _masCurrentKey  = null;
var _masCurrentData = null;

var RISK_LABELS = { bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', extremo: 'Extremo' };

window.openMapActionSheet = function (key, data) {
  _masCurrentKey  = key;
  _masCurrentData = data;

  var arbolId  = data.arbolId || key;
  var especie  = data.especie || 'Especie no registrada';
  var risk     = window.getEffectiveRisk(data);
  var color    = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
  var cliente  = window.getClientName(data) || 'Sin cliente';
  var riskLbl  = RISK_LABELS[risk] || risk;
  var evalr    = data.evaluador || '';
  var photos   = (window.FB ? window.FB.getPhotoUrls(data) : (data.photoUrls || data.photos || [])).filter(function (u) { return u && typeof u === 'string'; });
  var nPhotos  = photos.length;

  var el;
  el = document.getElementById('mas-title');
  if (el) el.textContent = arbolId + (especie !== 'Especie no registrada' ? ' · ' + especie : '');

  el = document.getElementById('mas-risk-dot');
  if (el) {
    el.style.background = color;
    el.style.boxShadow = '0 0 0 3px ' + color + '33';
  }

  el = document.getElementById('mas-meta');
  if (el) {
    var parts = ['🏢 ' + cliente, '⚠️ ' + riskLbl];
    if (evalr) parts.push('👤 ' + evalr);
    if (nPhotos > 0) parts.push('📷 ' + nPhotos + ' foto' + (nPhotos > 1 ? 's' : ''));
    el.textContent = parts.join('  ·  ');
  }

  // Photo strip
  var photosWrap = document.getElementById('mas-photos-wrap');
  var photosStrip = document.getElementById('mas-photos-strip');
  var photoCount = document.getElementById('mas-photo-count');
  if (photosWrap && photosStrip) {
    if (nPhotos > 0) {
      photosWrap.style.display = '';
      if (photoCount) photoCount.textContent = nPhotos;
      photosStrip.innerHTML = photos.map(function (url, idx) {
        return '<div style="flex-shrink:0;width:72px;height:72px;border-radius:10px;overflow:hidden;background:#111;cursor:pointer;" onclick="window.masViewPhoto(' + idx + ')">' +
          '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentNode.style.display=\'none\'">' +
        '</div>';
      }).join('');
    } else {
      photosWrap.style.display = 'none';
    }
  }

  // Pre-fill notes
  var notasEl = document.getElementById('mas-notas');
  if (notasEl) notasEl.value = data.notas || '';

  var sheet = document.getElementById('mapActionSheet');
  if (sheet) sheet.classList.add('open');
};

window.masSaveNotes = function () {
  var key = _masCurrentKey;
  if (!key) return;
  var notasEl = document.getElementById('mas-notas');
  var notas = notasEl ? notasEl.value.trim() : '';
  if (!window.FB) { window.showNotif('Firebase no disponible'); return; }
  window.FB.updateEval(key, { notas: notas })
    .then(function () { window.showNotif('📝 Nota guardada'); })
    .catch(function (e) { window.showNotif('❌ ' + (e.message || 'Error al guardar')); });
};

window.closeMapActionSheet = function () {
  var sheet = document.getElementById('mapActionSheet');
  if (sheet) sheet.classList.remove('open');
  _masCurrentKey  = null;
  _masCurrentData = null;
};

window.masOpenDetail = function () {
  var key = _masCurrentKey; // save before closeMapActionSheet nullifies it
  window.closeMapActionSheet();
  if (key && typeof window.showTreeDetail === 'function') {
    window.showTreeDetail(key);
  }
};

window.masAddPhoto = function (source) {
  var key = _masCurrentKey;
  window.closeMapActionSheet();
  if (!key) return;
  var inputId = (source === 'gallery') ? 'photo-input-gallery' : 'photo-input';
  var inp = document.getElementById(inputId);
  if (!inp) return;
  inp.dataset.arbolId = '';
  if (window.APP) window.APP.detailKey = key;
  inp.value = '';
  inp.click();
};

window.masViewPhoto = function (idx) {
  if (!_masCurrentKey) return;
  window.closeMapActionSheet();
  if (typeof window.openPhotoModal === 'function') {
    window.openPhotoModal(_masCurrentKey, idx);
  }
};

window.masAddDoc = function () {
  var key  = _masCurrentKey;
  var data = _masCurrentData;
  window.closeMapActionSheet();
  if (!key) return;
  var arbolId = data ? (data.arbolId || key) : key;
  var inp = document.getElementById('file-upload-input');
  if (!inp) return;
  inp.dataset.arbolId = arbolId;
  inp.value = '';
  inp.click();
};

// Open action sheet from tree card (home panel) or detail modal button
window.openMASFromKey = function (key) {
  var db = window._dbAll || {};
  var data = db[key];
  if (!data) {
    if (typeof window.showTreeDetail === 'function') window.showTreeDetail(key);
    return;
  }
  // Pan map to tree GPS if available (all legacy formats)
  var gps = _normalizeGPS(data);
  if (gps && homeMapInstance) {
    var parts = String(gps).split(',');
    if (parts.length >= 2) {
      var lat = parseFloat(parts[0]);
      var lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        try { homeMapInstance.flyTo([lat, lng], 18, { animate: true, duration: 0.6 }); } catch (e) {}
      }
    }
  }
  window.openMapActionSheet(key, data);
};

// Called from detail modal "Nueva evaluación ISA TRAQ" button
window.masNewISAFromKey = function (key) {
  var db = window._dbAll || {};
  var data = db[key];
  if (!data) { window.startNewTree && window.startNewTree(); return; }
  _masCurrentKey  = key;
  _masCurrentData = data;
  window.masNewISA();
};

window.masNewISA = function () {
  var data = _masCurrentData;
  window.closeMapActionSheet();
  if (!data) { window.startNewTree && window.startNewTree(); return; }

  // Pre-fill wizard or form with tree data from map
  var arbolId  = data.arbolId  || '';
  var especie  = data.especie  || '';
  var cliente  = window.getClientName(data) || '';
  var evalr    = data.evaluador || (window.APP && window.APP.activeEngineer) || '';
  var gps      = _normalizeGPS(data) || '';

  // Update APP state
  if (window.APP) {
    if (cliente) window.APP.activeClient   = cliente;
    if (evalr)   window.APP.activeEngineer = evalr;
  }

  // Pre-fill wizard fields then launch
  if (typeof window.openTreeWizard === 'function') {
    window.openTreeWizard();
    // Inject values after wizard opens
    setTimeout(function () {
      var set = function (id, val) { var el = document.getElementById(id); if (el && val) el.value = val; };
      set('wiz-arbolId',   arbolId);
      set('wiz-especie',   especie);
      set('wiz-cliente',   cliente);
      set('wiz-evaluador', evalr);
      if (gps) {
        var parts = String(gps).split(',');
        if (parts.length >= 2) {
          var lat = parseFloat(parts[0]);
          var lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            // Set wiz GPS
            var display = document.getElementById('wiz-gps-display');
            var text    = document.getElementById('wiz-gps-text');
            if (display) display.style.display = '';
            if (text)    text.textContent = lat.toFixed(6) + ', ' + lng.toFixed(6);
            // Store in wizard state via exposed setter
            if (typeof window._setWizGPS === 'function') window._setWizGPS(lat, lng);
          }
        }
      }
    }, 80);
  }
};

/* ─────────────────────────────────────────
   UNIFIED FILE INPUT HANDLERS
   photo-input / photo-input-gallery → panelUploadPhoto
   file-upload-input → panelUploadFile
───────────────────────────────────────── */

window._handlePhotoInput = async function (input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var arbolId = input.dataset.arbolId || '';
  var evalKey = (window.APP && window.APP.detailKey) || '';
  input.value = '';

  window.showNotif('⏳ Subiendo foto...');
  try {
    var activeClient = window.APP && window.APP.activeClient;
    var result = await window.FB.uploadPhoto(activeClient || 'sin_cliente', arbolId || 'sin_arbol', file);
    var url = result && result.url;
    if (!url) throw new Error('Sin URL');

    if (evalKey) {
      // Attach to specific evaluation (from tree detail modal in Registros)
      await window.FB.addPhotoToEval(evalKey, url);
      window.APP.detailKey = null;
      window.showNotif('✅ Foto añadida');
      // Refresh the detail modal if open
      if (typeof window.showTreeDetail === 'function') window.showTreeDetail(evalKey);
      return;
    } else if (arbolId) {
      // Find latest eval for this tree
      await window.panelUploadPhoto(file, arbolId);
      return; // panelUploadPhoto already handled notification
    }
    window.showNotif('✅ Foto guardada');
    if (typeof window.renderPanelPhotos === 'function') window.renderPanelPhotos();
    if (typeof window.refreshHomeMap === 'function') window.refreshHomeMap();
  } catch (e) {
    window.showNotif('❌ Error: ' + (e.message || 'desconocido'));
    console.error('_handlePhotoInput:', e);
  }
};

window._handleFileInput = async function (input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var arbolId = input.dataset.arbolId || '';
  input.value = '';

  window.showNotif('⏳ Subiendo archivo...');
  try {
    var activeClient = window.APP && window.APP.activeClient;
    if (!activeClient) { window.showNotif('⚠️ Selecciona un cliente primero'); return; }
    var result = await window.FB.uploadDoc(activeClient, file);
    var meta = { name: result.name || file.name, url: result.url, type: result.type || 'base64', ts: Date.now() };
    if (arbolId) meta.arbolId = arbolId;
    if (typeof window._fbPushArchivo === 'function') {
      await window._fbPushArchivo(activeClient, meta);
    }
    window.showNotif('✅ Archivo guardado: ' + file.name);
    if (typeof window.renderPanelFiles === 'function') window.renderPanelFiles();
  } catch (e) {
    window.showNotif('❌ Error: ' + (e.message || 'desconocido'));
    console.error('_handleFileInput:', e);
  }
};
