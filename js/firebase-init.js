import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, get, set, onDisconnect as fbOnDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: window.atob("QUl6YVN5QkM1ZnowYnFfTDF3b2o0UTN2U3VDSEtMM0Nzd3pMaHh3"),
  authDomain: "appp-1ed52.firebaseapp.com",
  databaseURL: "https://appp-1ed52-default-rtdb.firebaseio.com",
  projectId: "appp-1ed52",
  storageBucket: "appp-1ed52.firebasestorage.app",
  messagingSenderId: "377421785269",
  appId: "1:377421785269:web:48088a6486262e237576fc"
};
const app = initializeApp(firebaseConfig);

const db      = getDatabase(app);
const storage = getStorage(app);

const evalsRef    = ref(db, 'evaluaciones');
const clientesRef = ref(db, 'clientes');
const usuariosRef = ref(db, 'usuarios');

// ── Evaluaciones ──
window._fbPush       = d    => push(evalsRef, d);
window._fbRemove     = key  => remove(ref(db, 'evaluaciones/' + key));
window._fbUpdateEval = (key, u) => update(ref(db, 'evaluaciones/' + key), u);
window._fbOnValue    = cb   => onValue(evalsRef, cb);

// ── Clientes ──
window._fbPushCliente   = d   => push(clientesRef, d);
window._fbUpdateCliente = (key, u) => update(ref(db, 'clientes/' + key), u);
window._fbRemoveCliente = key => remove(ref(db, 'clientes/' + key));
window._fbOnClientes    = cb  => onValue(clientesRef, cb);

// ── Usuarios (custom auth via DB) ──
window._fbGetAllUsers = () => get(usuariosRef).then(s => s.val() || {});
window._fbHasUsers    = () => get(usuariosRef).then(s => s.exists());
window._fbSaveUser    = (uid, data) => update(ref(db, 'usuarios/' + uid), data);
window._fbUpdateUser  = (uid, data) => update(ref(db, 'usuarios/' + uid), data);
window._fbRemoveUser  = (uid)       => remove(ref(db, 'usuarios/' + uid));

// ── Reportes / Sugerencias ──
const reportsRef = ref(db, 'reportes');
window._fbPushReport    = d        => push(reportsRef, d);
window._fbOnReports     = cb       => onValue(reportsRef, cb);
window._fbUpdateReport  = (key, u) => update(ref(db, 'reportes/' + key), u);
window._fbRemoveReport  = key      => remove(ref(db, 'reportes/' + key));

// ── App config (cloudinary, etc.) stored in /config/ ──
window._fbSetConfig    = (key, val) => set(ref(db, 'config/' + key), val);
window._fbGetConfig    = (key)      => get(ref(db, 'config/' + key)).then(s => s.exists() ? s.val() : null);
window._FIREBASE_DB_URL = firebaseConfig.databaseURL || '';

// Load Cloudinary config on boot (if saved previously by admin)
(async function() {
  try {
    var cfg = await window._fbGetConfig('cloudinary');
    if (cfg && cfg.cloudName && cfg.uploadPreset) {
      window.CLOUDINARY_CLOUD_NAME    = cfg.cloudName;
      window.CLOUDINARY_UPLOAD_PRESET = cfg.uploadPreset;
    }
  } catch(e) { /* offline — use defaults */ }
})();

// ── Archivos (docs per client or tree) ──
const _fsKey = s => (s||'sin_cliente').replace(/[.#$[\]/]/g,'_');
window._fsKey           = _fsKey;
window._fbPushArchivo   = (clienteId, data) => push(ref(db, 'archivos/' + _fsKey(clienteId)), data);
window._fbRemoveArchivo = (clienteId, key)  => remove(ref(db, 'archivos/' + _fsKey(clienteId) + '/' + key));
window._fbOnArchivos    = cb => onValue(ref(db, 'archivos'), cb);
window._fbOnArchivosCliente = (clienteId, cb) => onValue(ref(db, 'archivos/' + _fsKey(clienteId)), cb);

// ── Dev Console — generic path helpers ──
window._fbReadPath   = (path, cb) => onValue(ref(db, path), cb, { onlyOnce: true });
window._fbSetPath    = (path, val) => set(ref(db, path), val);
window._fbDeletePath = (path)     => remove(ref(db, path));

// ── Presencia en tiempo real ──
window._myPresenceKey = null;

// IP geolocation fallback (when GPS unavailable)
window._fbGeoByIP = function(presRef) {
  fetch('https://ipapi.co/json/')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.latitude) {
        update(presRef, { gps: {
          lat: d.latitude, lng: d.longitude, acc: 5000,
          source: 'ip', city: d.city || '', country: d.country_name || '', isp: d.org || ''
        }});
      }
    })
    .catch(function() {
      // backup IP API
      fetch('https://freeipapi.com/api/json')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.latitude) {
            update(presRef, { gps: {
              lat: d.latitude, lng: d.longitude, acc: 8000,
              source: 'ip', city: d.cityName || '', country: d.countryName || ''
            }});
          }
        }).catch(function(){});
    });
};

window._fbSetPresence = function(userInfo) {
  var key = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  window._myPresenceKey = key;
  var presRef = ref(db, 'presencia/' + key);
  var data = Object.assign({}, userInfo, {
    ts: Date.now(), online: true,
    ua: navigator.userAgent.slice(0, 120),
    screen: window.screen ? window.screen.width + 'x' + window.screen.height : '',
    lang: navigator.language || ''
  });
  set(presRef, data);
  fbOnDisconnect(presRef).remove();
  // Try GPS first; on failure (or no geolocation API) → IP fallback
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        update(presRef, { gps: {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy), source: 'gps'
        }});
      },
      function() { window._fbGeoByIP(presRef); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  } else {
    window._fbGeoByIP(presRef);
  }
};
window._fbClearPresence = function() {
  if (window._myPresenceKey) remove(ref(db, 'presencia/' + window._myPresenceKey));
};
window._fbOnPresence = function(cb) { return onValue(ref(db, 'presencia'), cb); };
window._FIREBASE_PROJECT_ID = firebaseConfig.projectId || '';

// ── Portal del Cliente ──
window._fbOnPortalTrees   = (clientKey, cb) => onValue(ref(db, 'clientePortal/' + clientKey + '/config/trees'), cb);
window._fbSetPortalTree   = (clientKey, arbolKey, data) => set(ref(db, 'clientePortal/' + clientKey + '/config/trees/' + arbolKey), data);
window._fbGetPortalConfig = (clientKey, cb) => onValue(ref(db, 'clientePortal/' + clientKey + '/config'), cb, { onlyOnce: true });
window._fbSetPortalConfig = (clientKey, cfg) => set(ref(db, 'clientePortal/' + clientKey + '/config'), cfg);

// ── Chat cliente–admin ──
window._fbOnChat        = (clientKey, cb) => onValue(ref(db, 'chat/' + clientKey + '/messages'), cb);
window._fbSendMessage   = (clientKey, msg) => push(ref(db, 'chat/' + clientKey + '/messages'), msg);
window._fbMarkChatRead  = (clientKey, msgId) => update(ref(db, 'chat/' + clientKey + '/messages/' + msgId), { read: true });
window._fbOnAllChats    = (cb) => onValue(ref(db, 'chat'), cb);

// ── Portal config (new structure: /clientePortal/{key}/config) ──
window._fbOnPortalConfig  = (clientKey, cb) => onValue(ref(db, 'clientePortal/' + clientKey + '/config'), cb);
// _fbGetPortalConfig and _fbSetPortalConfig already defined above

// ── Notificaciones admin ──
window._fbPushNotif       = (msg) => push(ref(db, 'notificaciones'), msg);
window._fbOnNotifs        = (cb)  => onValue(ref(db, 'notificaciones'), cb);
window._fbMarkNotifRead   = (key) => update(ref(db, 'notificaciones/' + key), { read: true });
window._fbPushReport      = (data) => push(ref(db, 'reportes'), data);
window._fbGetReports      = (cb)   => get(ref(db, 'reportes')).then(s => cb(s.val() || {}));
window._fbOnReports       = (cb)   => onValue(ref(db, 'reportes'), cb);
window._fbUpdateReport    = (key, u) => update(ref(db, 'reportes/' + key), u);
window._fbRemoveReport    = (key)  => remove(ref(db, 'reportes/' + key));

// ── Image compression — canvas resize to ≤1200px, JPEG 0.72 ──
window._compressImage = function(file, maxPx, quality) {
  maxPx = maxPx || 1200; quality = quality || 0.72;
  return new Promise(function(resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(url);
      var w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else       { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
};

// ── Storage — Photos (Firebase Storage → compressed base64 fallback) ──
window._fbUploadPhoto = async function(clienteId, arbolId, file) {
  // Try Firebase Storage first
  try {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = 'fotos/' + (clienteId||'sin_cliente') + '/' + (arbolId||'sin_id') + '/' + Date.now() + '_' + safe;
    const snap = await uploadBytes(sRef(storage, path), file);
    return { url: await getDownloadURL(snap.ref), path, type: 'storage' };
  } catch(e) {
    console.warn('Firebase Storage no disponible, usando base64 comprimido:', e.message);
  }
  // Fallback: compress image and store as base64
  const isImage = file.type.startsWith('image/');
  if (isImage) {
    const dataUrl = await window._compressImage(file, 1200, 0.72);
    return { url: dataUrl, type: 'base64' };
  }
  // Non-image: read raw base64 (limit 3MB)
  return new Promise(function(resolve, reject) {
    if (file.size > 3 * 1024 * 1024) { reject(new Error('Archivo muy grande (máx 3MB sin Storage)')); return; }
    var reader = new FileReader();
    reader.onload = function(e) { resolve({ url: e.target.result, type: 'base64' }); };
    reader.onerror = function() { reject(new Error('Error leyendo archivo')); };
    reader.readAsDataURL(file);
  });
};

// ── Storage — Docs (Firebase Storage → base64 fallback) ──
window._fbUploadDoc = async function(clienteId, file) {
  // Try Firebase Storage first
  try {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = 'documentos/' + (clienteId||'sin_cliente') + '/' + Date.now() + '_' + safe;
    const snap = await uploadBytes(sRef(storage, path), file);
    return { url: await getDownloadURL(snap.ref), path, name: file.name, type: 'storage', ts: Date.now() };
  } catch(e) {
    console.warn('Firebase Storage no disponible, usando base64:', e.message);
  }
  // Fallback: base64 inline (images get compressed, docs limited to 5MB)
  const isImage = file.type.startsWith('image/');
  if (isImage) {
    const dataUrl = await window._compressImage(file, 1200, 0.72);
    return { url: dataUrl, name: file.name, type: 'base64', ts: Date.now() };
  }
  return new Promise(function(resolve, reject) {
    if (file.size > 5 * 1024 * 1024) { reject(new Error('Documento muy grande (máx 5MB). Activa Firebase Storage para archivos mayores.')); return; }
    var reader = new FileReader();
    reader.onload = function(e) { resolve({ url: e.target.result, name: file.name, type: 'base64', ts: Date.now() }); };
    reader.onerror = function() { reject(new Error('Error leyendo archivo')); };
    reader.readAsDataURL(file);
  });
};

// ── Offline/online indicator ──
const dot = document.getElementById('connDot');
window.addEventListener('offline', () => { if(dot){dot.classList.add('off');dot.title='Sin conexión';}});
window.addEventListener('online',  () => { if(dot){dot.classList.remove('off');dot.title='Conectado';}});

// ── Data listeners (started after custom auth confirms session) ──
let _listenersStarted = false;
window._startDataListeners = function() {
  if (_listenersStarted) return;
  _listenersStarted = true;
  window._fbOnValue(snap => {
    window._fbRawAll = snap.val() || {};
    if (window._applyDBFilter)      window._applyDBFilter();
    if (window.populateClientList)  window.populateClientList();
    if (window.updateFilters)       window.updateFilters();
    if (window.refreshMap)          window.refreshMap();
    if (window.refreshHomeMap)      window.refreshHomeMap();
    if (window.renderDashboard)     window.renderDashboard();
    if (dot) { dot.classList.remove('off'); dot.title = 'Conectado'; }
  });
  if (window._fbOnClientes) window._fbOnClientes(snap => {
    window._clientesAll = snap.val() || {};
    if (window.renderClientSelectorList) window.renderClientSelectorList();
  });
  if (window._fbOnArchivos) window._fbOnArchivos(snap => {
    window._archivosAll = snap.val() || {};
    if (window.renderPanelFiles) window.renderPanelFiles();
  });
};

// ── Boot: check localStorage session after scripts load ──
window.addEventListener('load', () => {
  setTimeout(() => {
    if (window._bootAuth) window._bootAuth();
  }, 100);
});
