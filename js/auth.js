/* ============================================================
   auth.js — Custom auth via Firebase Realtime DB
   No Firebase Authentication service required.
   Passwords are hashed with PBKDF2 (Web Crypto API, built into all browsers).
   Sessions are INDEFINITE by default.
   Admin/Programador can set a sessionExpires timestamp per user in DB.
   ============================================================ */

window._AUTH = { currentUser: null, userData: null };
var _SESSION_KEY = 'bu_session_v1';

/* ─────────────────────────────────────────
   PASSWORD HASHING (PBKDF2 via Web Crypto)
───────────────────────────────────────── */

window._generateSalt = function () {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
};

window._hashPassword = async function (password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
};

/* ─────────────────────────────────────────
   SESSION (localStorage)
───────────────────────────────────────── */

function _saveSession(uid, userData) {
  var session = { uid: uid, nombre: userData.nombre, email: userData.email, role: userData.role };
  // No expiry stored locally — expiry is controlled per-user in the DB (sessionExpires field)
  localStorage.setItem(_SESSION_KEY, JSON.stringify(session));
  return session;
}

function _loadSession() {
  try {
    var raw = localStorage.getItem(_SESSION_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.uid) { localStorage.removeItem(_SESSION_KEY); return null; }
    return s;
  } catch (e) {
    return null;
  }
}

function _clearSession() {
  localStorage.removeItem(_SESSION_KEY);
}

/* ─────────────────────────────────────────
   BOOT — called on window load
───────────────────────────────────────── */

window._bootAuth = async function () {
  var session = _loadSession();
  if (!session) {
    // No valid session — check if first-time setup needed
    await window._checkFirstSetup();
    window.showLoginScreen();
    return;
  }

  // Validate session against DB
  try {
    var users = await window._fbGetAllUsers();
    var userData = users[session.uid];

    if (!userData || userData.activo === false) {
      _clearSession();
      await window._checkFirstSetup();
      window.showLoginScreen();
      return;
    }

    // Check admin-set session expiry (only for role 'usuario')
    if (userData.role === 'usuario' && userData.sessionExpires) {
      if (Date.now() > userData.sessionExpires) {
        _clearSession();
        window.showLoginScreen();
        var err = document.getElementById('loginError');
        if (err) {
          err.textContent = 'Tu acceso temporal ha vencido. Contacta al administrador.';
          err.style.display = 'block';
        }
        return;
      }
    }

    // Session valid — start app
    window._AUTH.currentUser = { uid: session.uid };
    window._AUTH.userData = userData;
    _applyUserToApp(session.uid, userData);
    window._updateAuthUI();
    window._startDataListeners();
    window.hideLoginScreen();
    // Track presence
    if (typeof window._fbSetPresence === 'function') {
      window._fbSetPresence({ nombre: userData.nombre || userData.email, role: userData.role || 'usuario', uid: session.uid });
    }
    // Route cliente to portal
    if ((userData.role || '') === 'cliente') {
      setTimeout(function() { if (window.initClientPortal) window.initClientPortal(); }, 400);
    }
  } catch (e) {
    // DB unreachable — allow offline with cached session
    window._AUTH.currentUser = { uid: session.uid };
    window._AUTH.userData = { nombre: session.nombre, email: session.email, role: session.role, activo: true };
    _applyUserToApp(session.uid, window._AUTH.userData);
    window._updateAuthUI();
    window._startDataListeners();
    window.hideLoginScreen();
    if ((session.role || '') === 'cliente') {
      setTimeout(function() { if (window.initClientPortal) window.initClientPortal(); }, 400);
    }
  }
};

function _applyUserToApp(uid, userData) {
  window.APP = window.APP || {};
  window.APP.currentUser    = { uid: uid, email: userData.email };
  window.APP.userRole       = userData.role || 'usuario';
  window.APP.allowedClients = (userData.clientesPermitidos && userData.clientesPermitidos.length > 0)
    ? userData.clientesPermitidos : null;
  window.APP.activeEngineer  = userData.nombre || userData.email;
  window.APP.clienteAsignado = userData.clienteAsignado || null;
}

/* ─────────────────────────────────────────
   LOGIN SCREEN VISIBILITY
───────────────────────────────────────── */

window.showLoginScreen = function () {
  var ls  = document.getElementById('loginScreen');
  var app = document.getElementById('app');
  if (ls)  ls.style.display  = 'flex';
  if (app) app.style.display = 'none';
  var btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
  var err = document.getElementById('loginError');
  if (err) err.style.display = 'none';
};

window.hideLoginScreen = function () {
  var ls  = document.getElementById('loginScreen');
  var app = document.getElementById('app');
  if (ls)  ls.style.display  = 'none';
  if (app) app.style.display = 'flex';
};

/* ─────────────────────────────────────────
   LOGIN
───────────────────────────────────────── */

window.handleLogin = async function () {
  var email = (document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
  var pass  = document.getElementById('loginPass')?.value || '';
  var btn   = document.getElementById('loginBtn');
  var err   = document.getElementById('loginError');

  if (!email || !pass) {
    err.textContent = 'Ingresa tu correo y contraseña.';
    err.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  err.style.display = 'none';

  try {
    var users = await window._fbGetAllUsers();
    // Find user by email
    var match = null;
    var matchUid = null;
    Object.entries(users).forEach(function (entry) {
      if ((entry[1].email || '').toLowerCase() === email) {
        match    = entry[1];
        matchUid = entry[0];
      }
    });

    if (!match) {
      throw { code: 'not-found' };
    }
    if (match.activo === false) {
      throw { code: 'disabled' };
    }
    // Check session expiry for usuarios
    if (match.role === 'usuario' && match.sessionExpires && Date.now() > match.sessionExpires) {
      throw { code: 'expired' };
    }

    // Verify password
    var hash = await window._hashPassword(pass, match.salt || match.email);
    if (hash !== match.passwordHash) {
      throw { code: 'wrong-password' };
    }

    // Success
    _saveSession(matchUid, match);
    window._AUTH.currentUser = { uid: matchUid };
    window._AUTH.userData    = match;
    _applyUserToApp(matchUid, match);
    window._updateAuthUI();
    window._startDataListeners();
    window.hideLoginScreen();
    // Track presence
    if (typeof window._fbSetPresence === 'function') {
      window._fbSetPresence({ nombre: match.nombre || match.email, role: match.role || 'usuario', uid: matchUid });
    }
    // Route cliente to portal
    if ((match.role || '') === 'cliente') {
      setTimeout(function() { if (window.initClientPortal) window.initClientPortal(); }, 400);
    }

  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
    var msg = 'Error al ingresar.';
    if (e.code === 'not-found' || e.code === 'wrong-password') {
      msg = 'Correo o contraseña incorrectos.';
    } else if (e.code === 'disabled') {
      msg = 'Cuenta desactivada. Contacta al administrador.';
    } else if (e.code === 'expired') {
      msg = 'Tu acceso temporal ha vencido. Contacta al administrador.';
    }
    err.textContent = msg;
    err.style.display = 'block';
  }
};

window.loginKeydown = function (e) {
  if (e.key === 'Enter') window.handleLogin();
};

/* ─────────────────────────────────────────
   LOGOUT
───────────────────────────────────────── */

window.handleLogout = async function () {
  if (!confirm('¿Cerrar sesión?')) return;
  // Clear presence before logout
  if (typeof window._fbClearPresence === 'function') window._fbClearPresence();
  _clearSession();
  window._AUTH.currentUser = null;
  window._AUTH.userData    = null;
  window.APP = window.APP || {};
  window.APP.currentUser    = null;
  window.APP.userRole       = null;
  window.APP.allowedClients = null;
  window.showLoginScreen();
};

/* ─────────────────────────────────────────
   UPDATE HEADER UI
───────────────────────────────────────── */

window._updateAuthUI = function () {
  var ud    = window._AUTH.userData;
  if (!ud) return;
  var nombre = ud.nombre || ud.email || 'Usuario';
  var role   = ud.role || 'usuario';

  var pillName = document.getElementById('engPillName');
  if (pillName) pillName.textContent = nombre;

  var adminBtn = document.getElementById('adminHeaderBtn');
  if (adminBtn) {
    adminBtn.style.display = (role === 'admin' || role === 'programador') ? 'flex' : 'none';
  }
  var devBtn = document.getElementById('devConsoleBtn');
  if (devBtn) devBtn.style.display = (role === 'programador') ? 'flex' : 'none';
  if (window.APP) window.APP.activeEngineer = nombre;
};

/* ─────────────────────────────────────────
   FIRST-TIME SETUP
───────────────────────────────────────── */

window._checkFirstSetup = async function () {
  try {
    var hasUsers = await window._fbHasUsers();
    if (!hasUsers) {
      var normal = document.getElementById('loginNormal');
      var setup  = document.getElementById('loginFirstSetup');
      var title  = document.getElementById('loginScreenTitle');
      if (normal) normal.style.display = 'none';
      if (setup)  setup.style.display  = 'block';
      if (title)  title.textContent    = 'Configuración inicial';
    }
  } catch (e) { /* DB unreachable, show normal login */ }
};

window.handleFirstSetup = async function () {
  var nombre = (document.getElementById('setupNombre')?.value || '').trim();
  var email  = (document.getElementById('setupEmail')?.value  || '').trim().toLowerCase();
  var pass   = document.getElementById('setupPass')?.value  || '';
  var pass2  = document.getElementById('setupPass2')?.value || '';
  var btn    = document.getElementById('setupBtn');
  var err    = document.getElementById('setupError');

  err.style.display = 'none';

  if (!nombre || !email || !pass) {
    err.textContent = 'Completa todos los campos.';
    err.style.display = 'block';
    return;
  }
  if (pass.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    err.style.display = 'block';
    return;
  }
  if (pass !== pass2) {
    err.textContent = 'Las contraseñas no coinciden.';
    err.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creando cuenta...';

  try {
    var salt = window._generateSalt();
    var hash = await window._hashPassword(pass, salt);
    var uid  = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    var userData = {
      nombre: nombre, email: email, role: 'programador',
      salt: salt, passwordHash: hash,
      activo: true, creadoEn: Date.now()
    };

    await window._fbSaveUser(uid, userData);

    _saveSession(uid, userData);
    window._AUTH.currentUser = { uid: uid };
    window._AUTH.userData    = userData;
    _applyUserToApp(uid, userData);
    window._updateAuthUI();
    window._startDataListeners();
    window.hideLoginScreen();

  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Crear cuenta programador';
    err.textContent = e.message || 'Error al crear la cuenta.';
    err.style.display = 'block';
  }
};

/* ─────────────────────────────────────────
   DB FILTER BY ALLOWED CLIENTS
───────────────────────────────────────── */

window._applyDBFilter = function () {
  var raw     = window._fbRawAll || {};
  var allowed = window.APP ? window.APP.allowedClients : null;
  if (allowed && Array.isArray(allowed) && allowed.length > 0) {
    window._dbAll = {};
    Object.keys(raw).forEach(function (k) {
      if (allowed.indexOf(raw[k].cliente) !== -1) window._dbAll[k] = raw[k];
    });
  } else {
    window._dbAll = raw;
  }
};
