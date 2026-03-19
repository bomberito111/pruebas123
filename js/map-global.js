/* ═══════════════════════════════════════════
   map-global.js — Global map tab ("Mapa")
   Bosques Urbanos — forestry engineering app
   Plain <script> tag, all exports on window.
═══════════════════════════════════════════ */

var mapInstance = null;
var mapMarkers = [];
var _userLocationMarker = null;

var _ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var _OSM_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/* ─────────────────────────────────────────
   INIT GLOBAL MAP
───────────────────────────────────────── */

window.initMap = function () {
  var el = document.getElementById('leafletMap');
  if (!el) return;

  if (mapInstance) {
    mapInstance.invalidateSize();
    window.refreshMap();
    return;
  }

  mapInstance = L.map('leafletMap', {
    zoomControl: true,
    attributionControl: true,
    tap: true
  }).setView([4.711, -74.0721], 12);

  var satelitalLayer = L.tileLayer(_ESRI_URL, {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 24,
    maxNativeZoom: 19
  });

  var normalLayer = L.tileLayer(_OSM_URL, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  });

  // Default: satellite
  satelitalLayer.addTo(mapInstance);

  var baseLayers = {
    'Satelital': satelitalLayer,
    'Mapa Normal': normalLayer
  };

  L.control.layers(baseLayers, {}, { position: 'topright', collapsed: true }).addTo(mapInstance);

  window.updateMapFilters();
  window.refreshMap();
};

/* ─────────────────────────────────────────
   REFRESH MAP MARKERS
───────────────────────────────────────── */

window.refreshMap = function () {
  if (!mapInstance) return;

  mapMarkers.forEach(function (m) { mapInstance.removeLayer(m); });
  mapMarkers = [];

  var clientFilter = (document.getElementById('map-f-cliente') || {}).value || '';
  var riskFilter   = (document.getElementById('map-f-riesgo')  || {}).value || '';

  var db = window._dbAll || {};

  // Group by arbolId — latest per tree
  var latest = {};
  Object.keys(db).forEach(function (key) {
    var d = db[key];
    var arbolId = d.arbolId || key;
    var ts = d.ts || d.timestamp || 0;
    if (!latest[arbolId] || ts > (latest[arbolId].ts || 0)) {
      latest[arbolId] = { key: key, data: d };
    }
  });

  var bounds = [];
  var count = 0;

  Object.keys(latest).forEach(function (arbolId) {
    var item = latest[arbolId];
    var d = item.data;
    var key = item.key;

    var client = window.getClientName(d);
    if (clientFilter && client !== clientFilter) return;

    var risk = window.getEffectiveRisk(d);
    if (riskFilter && risk !== riskFilter) return;

    var gps = d.gps || (d.answers && d.answers.gps);
    if (!gps) return;

    var parts = String(gps).split(',');
    if (parts.length < 2) return;
    var lat = parseFloat(parts[0]);
    var lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return;

    var color = (window.RISK_COLORS && window.RISK_COLORS[risk]) || '#6b7280';
    var riskLabel = risk.charAt(0).toUpperCase() + risk.slice(1);
    var date = d.ts ? new Date(d.ts).toLocaleDateString('es-CO') : (d.fecha || '—');

    var icon = L.divIcon({
      className: '',
      html: '<div style="width:26px;height:26px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;">🌳</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    var popupHtml =
      '<div style="font-family:\'IBM Plex Sans\',sans-serif;min-width:180px;">' +
        '<div style="font-size:11px;font-weight:800;color:#0f3320;letter-spacing:.5px;margin-bottom:4px;">' + arbolId + '</div>' +
        '<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">' + (d.especie || '—') + '</div>' +
        '<div style="font-size:11px;color:#7a746e;margin-bottom:2px;">Evaluador: ' + (d.evaluador || '—') + '</div>' +
        '<div style="font-size:11px;color:#7a746e;margin-bottom:8px;">Fecha: ' + date + '</div>' +
        '<div style="display:inline-block;padding:3px 10px;border-radius:20px;background:' + color + ';color:#fff;font-size:10px;font-weight:800;letter-spacing:.5px;margin-bottom:10px;">' + riskLabel.toUpperCase() + '</div><br>' +
        '<button onclick="window.showTreeDetail(\'' + key + '\')" style="width:100%;padding:8px;background:#0f3320;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">Ver Evaluación Completa</button>' +
      '</div>';

    var marker = L.marker([lat, lng], { icon: icon });
    marker.bindPopup(popupHtml, { maxWidth: 240, className: 'bu-popup' });
    marker.addTo(mapInstance);
    mapMarkers.push(marker);
    bounds.push([lat, lng]);
    count++;
  });

  var subtitle = document.getElementById('mapSubtitle');
  if (subtitle) {
    subtitle.textContent = count + ' árbol' + (count !== 1 ? 'es' : '') + ' evaluado' + (count !== 1 ? 's' : '');
  }

  if (bounds.length > 0) {
    try {
      mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } catch (e) {}
  }
};

/* ─────────────────────────────────────────
   GO TO MY LOCATION
───────────────────────────────────────── */

window.goToMyLocation = function () {
  if (!navigator.geolocation) {
    window.showNotif('Geolocalización no soportada en este dispositivo');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;

      if (!mapInstance) return;
      mapInstance.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });

      if (_userLocationMarker) {
        mapInstance.removeLayer(_userLocationMarker);
      }
      _userLocationMarker = L.circleMarker([lat, lng], {
        radius: 10,
        color: '#1d4ed8',
        fillColor: '#3b82f6',
        fillOpacity: 0.9,
        weight: 3
      }).addTo(mapInstance);
      _userLocationMarker.bindPopup('<b>Tu ubicación</b>').openPopup();

      window.showNotif('📍 Ubicado en tu posición');
    },
    function (err) {
      console.warn('goToMyLocation error:', err.message);
      window.showNotif('No se pudo obtener tu ubicación');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

/* ─────────────────────────────────────────
   UPDATE MAP FILTERS (populate client select)
───────────────────────────────────────── */

window.updateMapFilters = function () {
  var sel = document.getElementById('map-f-cliente');
  if (!sel) return;

  var db = window._dbAll || {};
  var clients = {};
  Object.keys(db).forEach(function (key) {
    var client = window.getClientName(db[key]);
    if (client && client !== '(Sin cliente)') clients[client] = true;
  });

  var currentVal = sel.value;
  sel.innerHTML = '<option value="">Todos los clientes</option>';
  Object.keys(clients).sort().forEach(function (name) {
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });

  // Restore selection if still valid
  if (currentVal && clients[currentVal]) sel.value = currentVal;
};
