/* ============================================================
   admin.js — Admin panel: user management, roles & client permissions
   ============================================================ */

window._allUsersCache = {};
window._editingClientsUid = null;
window._adminCurrentTab = 'users'; // 'users' | 'settings' | 'clientes'
window._adminNotifUnsub = null;   // realtime notifs listener
window._adminNotifCount = 0;
window._adminChatClient = null;   // clientKey of open admin chat

/* ─────────────────────────────────────────
   OPEN / CLOSE ADMIN PANEL
───────────────────────────────────────── */

window.openAdminPanel = function () {
  var modal = document.getElementById('adminPanelModal');
  if (!modal) return;
  modal.style.display = 'flex';
  window.renderAdminPanel();
};

window.closeAdminPanel = function () {
  var modal = document.getElementById('adminPanelModal');
  if (modal) modal.style.display = 'none';
};

/* ─────────────────────────────────────────
   MAIN RENDER
───────────────────────────────────────── */

window.renderAdminPanel = async function () {
  var body = document.getElementById('adminPanelBody');
  if (!body) return;

  var myRole = window.APP?.userRole || 'usuario';
  var users = await window._fbGetAllUsers();
  window._allUsersCache = users || {};

  // Gather all client names
  var clienteSet = new Set();
  Object.values(window._fbRawAll || window._dbAll || {}).forEach(function (e) {
    if (e.cliente) clienteSet.add(e.cliente);
  });
  Object.values(window._clientesAll || {}).forEach(function (c) {
    if (c.nombre) clienteSet.add(c.nombre);
  });
  var clienteList = Array.from(clienteSet).sort();

  var html = '';

  // ── Tab bar ──
  if (myRole === 'programador' || myRole === 'admin') {
    var tabs = [
      { id: 'users',    label: '👥 Usuarios',   color: '#0f3320' },
      { id: 'clientes', label: '🏢 Clientes',   color: '#0ea5e9' }
    ];
    if (myRole === 'programador') {
      tabs.push({ id: 'settings', label: '⚙️ Config', color: '#7c3aed' });
    }
    html += '<div style="display:flex;border-bottom:1px solid #e5e0d8;margin-bottom:16px;overflow-x:auto">';
    tabs.forEach(function (t) {
      var active = window._adminCurrentTab === t.id;
      var label  = t.label;
      // Notification badge on Clientes tab
      if (t.id === 'clientes' && window._adminNotifCount > 0) {
        label += ' <span style="background:#b91c1c;color:#fff;font-size:9px;padding:1px 5px;border-radius:20px;font-weight:800;">' + window._adminNotifCount + '</span>';
      }
      html += '<button onclick="adminSetTab(\'' + t.id + '\')" style="flex:1;min-width:80px;padding:10px 6px;border:none;background:none;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:' + (active ? t.color : '#9ca3af') + ';border-bottom:2px solid ' + (active ? t.color : 'transparent') + '">' + label + '</button>';
    });
    html += '</div>';
  }

  if (window._adminCurrentTab === 'clientes' && (myRole === 'admin' || myRole === 'programador')) {
    html += renderClientesTab(myRole);
  } else if (window._adminCurrentTab === 'settings' && myRole === 'programador') {
    html += renderSettingsTab();
  } else {
    html += renderUsersTab(users, myRole, clienteList);
  }

  // Start notif listener if not already running
  _adminStartNotifListener();

  body.innerHTML = html;
};

window.adminSetTab = function (tab) {
  window._adminCurrentTab = tab;
  window.renderAdminPanel();
};

/* ─────────────────────────────────────────
   USERS TAB
───────────────────────────────────────── */

function renderUsersTab(users, myRole, clienteList) {
  var html = '';

  // Create user button
  if (myRole === 'admin' || myRole === 'programador') {
    html += '<button onclick="showCreateUserForm()" style="width:100%;padding:12px;background:#0f3320;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px">➕ Nueva cuenta</button>';
  }

  // User list
  if (!users || Object.keys(users).length === 0) {
    html += '<div style="text-align:center;color:#6b7280;padding:30px;font-size:14px">No hay usuarios registrados</div>';
  } else {
    Object.entries(users).forEach(function (entry) {
      var uid = entry[0];
      var u = entry[1];
      var isSelf = uid === (window._AUTH.currentUser?.uid);
      var roleColor = u.role === 'programador' ? '#7c3aed' : u.role === 'admin' ? '#1d4ed8' : '#0f3320';
      var roleLabel = u.role === 'programador' ? 'Programador' : u.role === 'admin' ? 'Admin' : 'Usuario';
      var roleIcon = u.role === 'programador' ? '🔑' : u.role === 'admin' ? '👑' : '👤';
      var isActive = u.activo !== false;
      var allowed = u.clientesPermitidos;

      // Can current user edit this user?
      var canEdit = !isSelf && (
        myRole === 'programador' ||
        (myRole === 'admin' && u.role === 'usuario')
      );

      html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;overflow:hidden;margin-bottom:10px">';

      // Card header
      html += '<div style="padding:12px 14px;display:flex;align-items:center;gap:10px">';
      html += '<div style="width:42px;height:42px;border-radius:11px;background:' + roleColor + ';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">' + roleIcon + '</div>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-weight:700;font-size:14px;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(u.nombre || 'Sin nombre') + (isSelf ? ' <span style="font-size:10px;color:#9ca3af;font-weight:400">(tú)</span>' : '') + '</div>';
      html += '<div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(u.email || '') + '</div>';
      html += '</div>';
      html += '<span style="padding:4px 9px;background:' + roleColor + '22;color:' + roleColor + ';border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0">' + roleLabel + '</span>';
      html += '</div>';

      // Card actions bar
      html += '<div style="padding:8px 14px;background:#faf9f5;border-top:1px solid #f0ede8;display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
      html += '<span style="padding:3px 8px;background:' + (isActive ? '#dcfce7' : '#fee2e2') + ';color:' + (isActive ? '#15803d' : '#b91c1c') + ';border-radius:20px;font-size:10px;font-weight:700">' + (isActive ? '● Activo' : '○ Inactivo') + '</span>';

      if (canEdit) {
        if (isActive) {
          html += '<button onclick="toggleUserActive(\'' + uid + '\',false)" style="' + smallBtnStyle('#fff','#d1d5db','#4b5563') + '">Desactivar</button>';
        } else {
          html += '<button onclick="toggleUserActive(\'' + uid + '\',true)" style="' + smallBtnStyle('#fff','#22c55e','#15803d') + '">Activar</button>';
        }
        if (u.role === 'usuario') {
          var clientCount = (allowed && allowed.length) ? allowed.length + ' cliente' + (allowed.length !== 1 ? 's' : '') : 'Todos';
          html += '<button onclick="editUserClients(\'' + uid + '\')" style="' + smallBtnStyle('#fff','#1d4ed8','#1d4ed8') + '">🏢 ' + clientCount + '</button>';
          // Session expiry badge + button
          var expLabel = u.sessionExpires
            ? (Date.now() > u.sessionExpires ? '⏰ Expirada' : '⏳ ' + _daysLeft(u.sessionExpires) + 'd')
            : '∞ Indefinida';
          var expColor = (!u.sessionExpires) ? '#6b7280' : (Date.now() > u.sessionExpires ? '#b91c1c' : '#d97706');
          html += '<button onclick="editUserSession(\'' + uid + '\')" style="' + smallBtnStyle('#fff', expColor, expColor) + '">' + expLabel + '</button>';
        }
        html += '<button onclick="changeUserPassword(\'' + uid + '\',\'' + escH(u.email || '') + '\')" style="' + smallBtnStyle('#fff','#d97706','#92400e') + '">🔑</button>';
        html += '<button onclick="deleteUser(\'' + uid + '\',\'' + escH(u.nombre || u.email || '') + '\')" style="' + smallBtnStyle('#fff1f2','#fecdd3','#be123c') + '">🗑️</button>';
      } else if (u.role === 'usuario') {
        var cnt = (allowed && allowed.length) ? allowed.join(', ') : 'Todos los clientes';
        html += '<span style="font-size:11px;color:#6b7280">🏢 ' + escH(cnt.substring(0, 50)) + '</span>';
      }

      html += '</div>';
      html += '</div>';
    });
  }

  // ── Create User Form (hidden) ──
  html += '<div id="createUserForm" style="display:none;margin-top:8px;background:#f0fdf4;border:2px solid #22c55e;border-radius:14px;padding:16px">';
  html += '<div style="font-weight:700;font-size:15px;color:#0f3320;margin-bottom:14px">➕ Nueva cuenta</div>';
  html += '<input type="text" id="newUserNombre" placeholder="Nombre completo *" style="' + inputStyle() + '">';
  html += '<input type="email" id="newUserEmail" placeholder="correo@empresa.com *" style="' + inputStyle() + '">';
  html += '<input type="password" id="newUserPass" placeholder="Contraseña (mín. 6 caracteres) *" style="' + inputStyle() + '">';
  if (myRole === 'programador' || myRole === 'admin') {
    html += '<select id="newUserRole" onchange="window._toggleClienteField()" style="' + inputStyle() + '">';
    html += '<option value="usuario">👤 Usuario (evaluador)</option>';
    html += '<option value="admin">👑 Administrador</option>';
    if (myRole === 'programador') html += '<option value="programador">🔑 Programador</option>';
    html += '<option value="cliente">🏢 Cliente (portal solo lectura)</option>';
    html += '</select>';
    // Extra field: assigned client name (shown only when role=cliente)
    html += '<div id="newUserClienteWrap" style="display:none;margin-top:-4px;">';
    html += '<input type="text" id="newUserClienteAsignado" placeholder="Nombre exacto del cliente en el sistema *" style="' + inputStyle() + '" list="cs-datalist">';
    html += '<div style="font-size:10px;color:#6b7280;margin-top:-8px;margin-bottom:6px;">⚠️ Debe coincidir exactamente con el cliente en Registros.</div>';
    html += '</div>';
  } else {
    html += '<input type="hidden" id="newUserRole" value="usuario">';
  }
  html += '<div id="createUserError" style="display:none;color:#b91c1c;font-size:12px;font-weight:600;margin:4px 0 8px;padding:8px;background:#fee2e2;border-radius:8px"></div>';
  html += '<div style="display:flex;gap:8px;margin-top:4px">';
  html += '<button id="createUserBtn" onclick="createNewUser()" style="flex:1;padding:12px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">Crear cuenta</button>';
  html += '<button onclick="document.getElementById(\'createUserForm\').style.display=\'none\'" style="padding:12px 16px;background:#fff;border:1.5px solid #d1d5db;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#6b7280">Cancelar</button>';
  html += '</div></div>';

  // ── Client Assignment Panel (hidden) ──
  html += '<div id="editClientsPanel" style="display:none;margin-top:8px;background:#eff6ff;border:2px solid #1d4ed8;border-radius:14px;padding:16px">';
  html += '<div style="font-weight:700;font-size:15px;color:#1d4ed8;margin-bottom:12px">🏢 Asignar clientes visibles</div>';
  html += '<div id="editClientsList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;max-height:280px;overflow-y:auto"></div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="saveUserClients()" style="flex:1;padding:12px;background:#1d4ed8;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">💾 Guardar</button>';
  html += '<button onclick="document.getElementById(\'editClientsPanel\').style.display=\'none\'" style="padding:12px 16px;background:#fff;border:1.5px solid #d1d5db;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#6b7280">Cancelar</button>';
  html += '</div></div>';

  // ── Session Expiry Panel (hidden) ──
  html += '<div id="editSessionPanel" style="display:none;margin-top:8px;background:#f0f9ff;border:2px solid #0ea5e9;border-radius:14px;padding:16px">';
  html += '<div style="font-weight:700;font-size:15px;color:#0369a1;margin-bottom:4px">⏳ Duración de acceso</div>';
  html += '<div id="editSessionEmail" style="font-size:12px;color:#6b7280;margin-bottom:12px"></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
  var durOpts = [['∞ Indefinida','0'],['1 día','1'],['3 días','3'],['7 días','7'],['15 días','15'],['30 días','30']];
  durOpts.forEach(function(o) {
    html += '<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:10px;border:1.5px solid #e0f2fe;cursor:pointer">';
    html += '<input type="radio" name="sessionDur" value="' + o[1] + '" style="width:16px;height:16px;accent-color:#0ea5e9">';
    html += '<span style="font-size:13px;font-weight:600;color:#0369a1">' + o[0] + '</span></label>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="saveUserSession()" style="flex:1;padding:11px;background:#0ea5e9;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">Guardar</button>';
  html += '<button onclick="document.getElementById(\'editSessionPanel\').style.display=\'none\'" style="padding:11px 16px;background:#fff;border:1.5px solid #d1d5db;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#6b7280">Cancelar</button>';
  html += '</div></div>';

  // ── Password Change Panel (hidden) ──
  html += '<div id="changePassPanel" style="display:none;margin-top:8px;background:#fff7ed;border:2px solid #d97706;border-radius:14px;padding:16px">';
  html += '<div style="font-weight:700;font-size:15px;color:#92400e;margin-bottom:2px">🔑 Cambiar contraseña</div>';
  html += '<div id="changePassEmail" style="font-size:12px;color:#6b7280;margin-bottom:14px"></div>';
  html += '<div style="font-size:12px;color:#6b7280;margin-bottom:10px;padding:8px;background:#fff;border-radius:9px;border:1px solid #fde68a">El admin establece la nueva contraseña directamente. No es necesario conocer la contraseña actual.</div>';
  html += '<input type="password" id="changePassNew" placeholder="Nueva contraseña (mín. 6 caracteres) *" style="' + inputStyle() + '">';
  html += '<input type="password" id="changePassConfirm" placeholder="Confirmar nueva contraseña *" style="' + inputStyle() + '">';
  html += '<button id="changePassBtn" onclick="doChangePassword()" style="width:100%;padding:12px;background:#d97706;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">Guardar nueva contraseña</button>';

  html += '<div id="changePassError" style="display:none;color:#b91c1c;font-size:12px;font-weight:600;margin-top:10px;padding:9px 12px;background:#fee2e2;border-radius:9px"></div>';
  html += '<div id="changePassOk" style="display:none;color:#15803d;font-size:12px;font-weight:600;margin-top:10px;padding:9px 12px;background:#dcfce7;border-radius:9px"></div>';
  html += '<button onclick="document.getElementById(\'changePassPanel\').style.display=\'none\'" style="margin-top:12px;width:100%;padding:10px;background:#fff;border:1.5px solid #d1d5db;border-radius:9px;font-weight:600;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#6b7280">Cerrar</button>';
  html += '</div>';

  // ── Client management (both admin and programador) ──
  html += '<div style="margin-top:20px;border-top:1px solid #e5e0d8;padding-top:16px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:10px">🏢 Clientes registrados</div>';
  var rawAll2 = window._fbRawAll || window._dbAll || {};
  var evalsByClient2 = {};
  Object.values(rawAll2).forEach(function (d) {
    var c = d.cliente || '(Sin cliente)'; evalsByClient2[c] = (evalsByClient2[c] || 0) + 1;
  });
  var clientNames2 = [];
  Object.values(window._clientesAll || {}).forEach(function (c) { if (c.nombre && clientNames2.indexOf(c.nombre) === -1) clientNames2.push(c.nombre); });
  Object.keys(evalsByClient2).forEach(function (c) { if (clientNames2.indexOf(c) === -1) clientNames2.push(c); });
  clientNames2.sort();
  if (clientNames2.length === 0) {
    html += '<div style="font-size:12px;color:#9ca3af;padding:8px 0">Sin clientes</div>';
  } else {
    clientNames2.forEach(function (c) {
      var n = evalsByClient2[c] || 0;
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f3ef">';
      html += '<span style="font-size:13px;font-weight:600;flex:1;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(c) + '</span>';
      html += '<span style="font-size:10px;color:#9ca3af;flex-shrink:0">' + n + ' eval.</span>';
      html += '<button onclick="adminDeleteClient(' + JSON.stringify(c) + ')" style="padding:4px 10px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;color:#be123c;font-family:\'IBM Plex Sans\',sans-serif;flex-shrink:0">🗑️ Eliminar</button>';
      html += '</div>';
    });
  }
  html += '</div>';

  return html;
}

/* ─────────────────────────────────────────
   CLIENTES TAB (admin + programador)
───────────────────────────────────────── */

function renderClientesTab(myRole) {
  var rawAll = window._fbRawAll || window._dbAll || {};
  var evalsByClient = {};
  Object.values(rawAll).forEach(function (d) {
    var c = d.cliente || '(Sin cliente)';
    evalsByClient[c] = (evalsByClient[c] || 0) + 1;
  });

  var clientNames = [];
  Object.values(window._clientesAll || {}).forEach(function (c) {
    if (c.nombre && clientNames.indexOf(c.nombre) === -1) clientNames.push(c.nombre);
  });
  Object.keys(evalsByClient).forEach(function (c) {
    if (c !== '(Sin cliente)' && clientNames.indexOf(c) === -1) clientNames.push(c);
  });
  clientNames.sort();

  // Count unread messages per client
  var unreadByClient = {};
  // We use cached notifs
  Object.values(window._adminNotifsCache || {}).forEach(function (n) {
    if (!n.read && n.clienteKey) {
      unreadByClient[n.clienteKey] = (unreadByClient[n.clienteKey] || 0) + 1;
    }
  });

  var html = '<div style="padding:4px 0;">';
  html += '<div style="font-weight:700;font-size:15px;color:#0f3320;margin-bottom:14px;">🏢 Gestión de Portales de Clientes</div>';

  if (clientNames.length === 0) {
    html += '<div style="background:#f9fafb;border-radius:12px;padding:24px;text-align:center;color:#9ca3af;font-size:13px;">No hay clientes registrados. Agrega evaluaciones con un cliente asignado.</div>';
  } else {
    clientNames.forEach(function (c) {
      var n = evalsByClient[c] || 0;
      var ck = (c || 'sin_cliente').replace(/[.#$[\]/]/g, '_');
      var unread = unreadByClient[ck] || 0;
      html +=
        '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">' +
          '<div style="width:42px;height:42px;border-radius:12px;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🌳</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;font-size:14px;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escH(c) + '</div>' +
            '<div style="font-size:11px;color:#9ca3af;">' + n + ' árbol(es) evaluado(s)</div>' +
          '</div>' +
          (unread > 0 ?
            '<span style="background:#b91c1c;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;flex-shrink:0;">💬 ' + unread + '</span>' : '') +
          '<button onclick="window.openPortalConfigEditor(' + JSON.stringify(c) + ')" ' +
            'style="flex-shrink:0;padding:8px 14px;background:#0f3320;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;white-space:nowrap;">⚙️ Configurar</button>' +
          (unread > 0 ?
            '<button onclick="adminOpenChat(\'' + ck + '\',\'' + escH(c) + '\')" ' +
              'style="flex-shrink:0;padding:8px 14px;background:#b91c1c;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;white-space:nowrap;">💬 Ver</button>' : '') +
        '</div>';
    });
  }

  html += '</div>';

  // Admin chat panel (shows when adminOpenChat is called)
  html += '<div id="adminChatPanel" style="display:none;margin-top:10px;background:#f0f9ff;border:2px solid #0ea5e9;border-radius:14px;overflow:hidden;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#0ea5e9;">' +
      '<div id="adminChatPanelTitle" style="font-weight:700;font-size:13px;color:#fff;">💬 Chat con cliente</div>' +
      '<button onclick="adminCloseChat()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:16px;width:28px;height:28px;border-radius:50%;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div id="adminChatMsgs" style="height:220px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:4px;background:#fff;"></div>' +
    '<div style="border-top:1px solid #e5e7eb;padding:10px;background:#fff;display:flex;gap:8px;">' +
      '<textarea id="adminChatInput" placeholder="Escribe tu respuesta…" ' +
        'style="flex:1;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:10px;font-family:\'IBM Plex Sans\',sans-serif;font-size:12px;resize:none;min-height:38px;max-height:80px;outline:none;" ' +
        'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();adminSendChatMsg();}"></textarea>' +
      '<button onclick="adminSendChatMsg()" ' +
        'style="padding:8px 14px;background:#0ea5e9;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;">Enviar</button>' +
    '</div>' +
  '</div>';

  return html;
}

/* ─────────────────────────────────────────
   ADMIN NOTIFICATIONS LISTENER
───────────────────────────────────────── */

window._adminNotifsCache = {};

function _adminStartNotifListener() {
  if (window._adminNotifUnsub) return; // already listening
  if (typeof window._fbOnNotifs !== 'function') return;
  window._adminNotifUnsub = window._fbOnNotifs(function (snap) {
    var notifs = (snap && snap.val ? snap.val() : null) || {};
    window._adminNotifsCache = notifs;
    window._adminNotifCount = Object.values(notifs).filter(function (n) { return !n.read; }).length;
    // Update badge in tab bar if visible
    var tabBtns = document.querySelectorAll('[onclick*="adminSetTab"]');
    tabBtns.forEach(function (btn) {
      if (btn.textContent.indexOf('Clientes') !== -1 || btn.innerHTML.indexOf('Clientes') !== -1) {
        // Re-render panel header to update badge
        // Lightweight: just update inner HTML of the clientes button
        var inner = '🏢 Clientes';
        if (window._adminNotifCount > 0) {
          inner += ' <span style="background:#b91c1c;color:#fff;font-size:9px;padding:1px 5px;border-radius:20px;font-weight:800;">' + window._adminNotifCount + '</span>';
        }
        btn.innerHTML = inner;
      }
    });
    // If chat panel is open for this client, refresh messages
    if (window._adminChatClient) {
      _renderAdminChatMessages(window._adminChatClient);
    }
  });
}

/* ─────────────────────────────────────────
   ADMIN CHAT
───────────────────────────────────────── */

var _adminChatUnsub = null;

window.adminOpenChat = function (clientKey, clientName) {
  window._adminChatClient = clientKey;
  var panel     = document.getElementById('adminChatPanel');
  var titleEl   = document.getElementById('adminChatPanelTitle');
  if (!panel) return;
  if (titleEl) titleEl.textContent = '💬 Chat con ' + clientName;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Mark notifs as read
  Object.entries(window._adminNotifsCache || {}).forEach(function (entry) {
    if (!entry[1].read && entry[1].clienteKey === clientKey) {
      if (typeof window._fbMarkNotifRead === 'function') window._fbMarkNotifRead(entry[0]);
    }
  });

  // Subscribe to chat messages
  if (_adminChatUnsub) try { _adminChatUnsub(); } catch(e){}
  if (typeof window._fbOnChat === 'function') {
    _adminChatUnsub = window._fbOnChat(clientKey, function (snap) {
      var msgs = (snap && snap.val ? snap.val() : null) || {};
      _renderAdminChatMsgs(msgs);
      // Mark client messages as read
      Object.keys(msgs).forEach(function (msgId) {
        if (msgs[msgId].senderRole === 'cliente' && !msgs[msgId].read) {
          if (typeof window._fbMarkChatRead === 'function') window._fbMarkChatRead(clientKey, msgId);
        }
      });
    });
  }
};

window.adminCloseChat = function () {
  window._adminChatClient = null;
  if (_adminChatUnsub) try { _adminChatUnsub(); } catch(e){}
  _adminChatUnsub = null;
  var panel = document.getElementById('adminChatPanel');
  if (panel) panel.style.display = 'none';
};

function _renderAdminChatMsgs(msgs) {
  var el = document.getElementById('adminChatMsgs');
  if (!el) return;
  var userData = window._AUTH && window._AUTH.userData;
  var myRole   = userData ? (userData.role || '') : '';

  var entries = Object.entries(msgs).sort(function (a, b) { return (a[1].ts || 0) - (b[1].ts || 0); });

  if (entries.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:16px;">Sin mensajes aún.</div>';
    return;
  }

  var html = '';
  entries.forEach(function (entry) {
    var msg = entry[1];
    var isMine = msg.senderRole === myRole;
    var time   = msg.ts ? new Date(msg.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    var name   = msg.senderName || (msg.senderRole === 'cliente' ? 'Cliente' : 'Equipo');
    html +=
      '<div style="display:flex;flex-direction:column;align-items:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:4px;">' +
        '<div style="font-size:9px;color:#9ca3af;margin-bottom:1px;' + (isMine ? 'margin-right:4px;' : 'margin-left:4px;') + '">' + escH(name) + '</div>' +
        '<div style="max-width:80%;padding:8px 11px;border-radius:' + (isMine ? '12px 12px 2px 12px' : '2px 12px 12px 12px') + ';' +
          'background:' + (isMine ? '#0ea5e9' : '#f3f4f6') + ';' +
          'color:' + (isMine ? '#fff' : '#1a1a1a') + ';font-size:12px;line-height:1.4;">' +
          escH(msg.text || '') +
        '</div>' +
        (time ? '<div style="font-size:9px;color:#9ca3af;margin-top:1px;' + (isMine ? 'margin-right:4px;' : 'margin-left:4px;') + '">' + time + '</div>' : '') +
      '</div>';
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// Keep _renderAdminChatMessages as alias
window._renderAdminChatMessages = _renderAdminChatMsgs;

window.adminSendChatMsg = function () {
  var inp = document.getElementById('adminChatInput');
  if (!inp) return;
  var text = inp.value.trim();
  if (!text || !window._adminChatClient) return;
  var userData = window._AUTH && window._AUTH.userData;
  var msg = {
    text: text,
    senderName: userData ? (userData.nombre || userData.email || 'Admin') : 'Admin',
    senderRole: userData ? (userData.role || 'admin') : 'admin',
    ts: Date.now(),
    read: false
  };
  if (typeof window._fbSendMessage === 'function') {
    window._fbSendMessage(window._adminChatClient, msg);
    inp.value = '';
  }
};

/* ─────────────────────────────────────────
   SETTINGS TAB (Programador only)
───────────────────────────────────────── */

function renderSettingsTab() {
  var html = '<div style="padding:4px 0">';

  // ── Servidores ──
  html += '<div style="font-weight:800;font-size:13px;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;margin-top:2px">🖥️ Servidores</div>';
  html += renderServersTab(true);
  html += '<div style="height:1px;background:#e5e0d8;margin:18px 0 16px"></div>';
  html += '<div style="font-weight:800;font-size:13px;color:#7c3aed;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">⚙️ Sistema &amp; cuenta</div>';

  // ── Info de la app ──
  var evalCount = Object.keys(window._fbRawAll || window._dbAll || {}).length;
  var clientCount = Object.keys(window._clientesAll || {}).length;
  var userCount = Object.keys(window._allUsersCache || {}).length;
  html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:12px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:10px">🌳 Estado del sistema</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
  html += _settingStat('📋', evalCount, 'Evaluaciones');
  html += _settingStat('🏢', clientCount, 'Clientes');
  html += _settingStat('👥', userCount, 'Usuarios');
  html += '</div></div>';

  // ── Mi cuenta ──
  html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:12px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:8px">🔑 Mi cuenta</div>';
  var me = window._AUTH.userData;
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
  html += '<div style="width:38px;height:38px;border-radius:10px;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🔑</div>';
  html += '<div><div style="font-weight:700;font-size:13px;color:#0f3320">' + escH(me ? (me.nombre || '-') : '-') + '</div>';
  html += '<div style="font-size:11px;color:#9ca3af">' + escH(me ? (me.email || '-') : '-') + '</div></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="window._adminSelfChangePass()" style="flex:1;padding:9px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #93c5fd;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">🔑 Cambiar contraseña</button>';
  html += '<button onclick="handleLogout()" style="padding:9px 14px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">🚪 Salir</button>';
  html += '</div></div>';

  // ── Gestión de clientes ──
  html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:12px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:10px">🏢 Gestión de clientes</div>';
  var rawAll = window._fbRawAll || window._dbAll || {};
  var evalsByClient = {};
  Object.values(rawAll).forEach(function (d) {
    var c = d.cliente || '(Sin cliente)';
    evalsByClient[c] = (evalsByClient[c] || 0) + 1;
  });
  var clientNames = [];
  Object.values(window._clientesAll || {}).forEach(function (c) { if (c.nombre && clientNames.indexOf(c.nombre) === -1) clientNames.push(c.nombre); });
  Object.keys(evalsByClient).forEach(function (c) { if (clientNames.indexOf(c) === -1) clientNames.push(c); });
  clientNames.sort();
  if (clientNames.length === 0) {
    html += '<div style="font-size:12px;color:#9ca3af;padding:8px 0">Sin clientes registrados</div>';
  } else {
    clientNames.forEach(function (c) {
      var n = evalsByClient[c] || 0;
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f3ef">';
      html += '<span style="font-size:13px;font-weight:600;flex:1;color:#0f3320;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(c) + '</span>';
      html += '<span style="font-size:10px;color:#9ca3af;flex-shrink:0">' + n + ' eval.</span>';
      html += '<button onclick="adminDeleteClient(' + JSON.stringify(c) + ')" style="padding:4px 10px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;color:#be123c;font-family:\'IBM Plex Sans\',sans-serif;flex-shrink:0">🗑️</button>';
      html += '</div>';
    });
  }
  html += '</div>';

  // ── Control de accesos rápido ──
  html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:12px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:10px">🔒 Control de accesos</div>';
  var usersCache = window._allUsersCache || {};
  var usuariosActivos = Object.entries(usersCache).filter(function(e){ return e[1].role === 'usuario' && e[1].activo !== false; });
  var usuariosInactivos = Object.entries(usersCache).filter(function(e){ return e[1].role === 'usuario' && e[1].activo === false; });
  html += '<div style="font-size:12px;color:#4b5563;margin-bottom:10px">' + usuariosActivos.length + ' usuarios activos · ' + usuariosInactivos.length + ' inactivos</div>';
  html += '<button onclick="forceLogoutAllUsers()" style="width:100%;padding:10px;background:#fff7ed;border:1.5px solid #d97706;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#92400e;margin-bottom:8px;text-align:left">🚪 Forzar re-login de todos los usuarios</button>';
  html += '<button onclick="revokeAllSessions()" style="width:100%;padding:10px;background:#fff1f2;border:1.5px solid #e11d48;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#be123c;margin-bottom:8px;text-align:left">⛔ Desactivar usuarios con sesión vencida</button>';
  html += '<button onclick="adminActivateAll()" style="width:100%;padding:10px;background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#15803d;text-align:left">✅ Reactivar todos los usuarios</button>';
  html += '</div>';

  // ── Herramientas de datos ──
  html += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:12px">';
  html += '<div style="font-weight:700;font-size:14px;color:#0f3320;margin-bottom:10px">🔧 Datos</div>';
  html += '<button onclick="exportAllData()" style="width:100%;padding:10px;background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#15803d;margin-bottom:8px;text-align:left">📥 Exportar todos los datos (JSON)</button>';
  html += '<button onclick="adminImportData()" style="width:100%;padding:10px;background:#eff6ff;border:1.5px solid #93c5fd;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:#1d4ed8;text-align:left">📤 Importar evaluaciones (JSON)</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

/* ─────────────────────────────────────────
   SERVERS TAB (Programador only)
   — Firebase Realtime DB (primary, always on)
   — Cloudinary (secondary, configurable)
───────────────────────────────────────── */

function renderServersTab(inline) {
  var cfgCN     = window.CLOUDINARY_CLOUD_NAME   || '';
  var cfgPreset = window.CLOUDINARY_UPLOAD_PRESET || '';
  var fbUrl     = window._FIREBASE_DB_URL || '(firebase url no detectada)';

  var s = '';
  if (!inline) s += '<div style="padding:4px 0">';

  // ── SERVER 1: Firebase Realtime DB ──────────────────────────────
  s += '<div style="background:#fff;border:2px solid #22c55e;border-radius:14px;padding:14px 16px;margin-bottom:14px">';
  s += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
  s += '<div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;border:1.5px solid #86efac;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🔥</div>';
  s += '<div><div style="font-weight:800;font-size:14px;color:#0f3320">Firebase Realtime DB</div>';
  s += '<div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px">Servidor primario · Siempre activo</div></div>';
  s += '<span style="margin-left:auto;padding:4px 10px;background:#dcfce7;color:#15803d;border-radius:20px;font-size:10px;font-weight:800">✅ ACTIVO</span>';
  s += '</div>';

  s += '<div style="font-size:11px;color:#4b5563;line-height:1.6">';
  s += '<div style="margin-bottom:4px"><b>URL:</b> <code style="font-family:monospace;background:#f5f5f5;padding:1px 5px;border-radius:4px;font-size:10px">' + escH(fbUrl) + '</code></div>';
  s += '<div style="margin-bottom:4px"><b>Plan:</b> Spark (gratuito) — 1 GB datos · 100 MB/día descarga · Siempre activo</div>';
  s += '<div><b>Almacena:</b> Evaluaciones, clientes, usuarios, metadatos, URLs de archivos</div>';
  s += '</div>';

  s += '<div style="margin-top:10px;padding:10px 12px;background:#f0fdf4;border-radius:9px;border:1px solid #bbf7d0">';
  s += '<div style="font-size:11px;font-weight:700;color:#15803d;margin-bottom:3px">ℹ️ Siempre disponible</div>';
  s += '<div style="font-size:11px;color:#166534">Este servidor no necesita configuración. Funciona desde el primer inicio.</div>';
  s += '</div>';
  s += '</div>';

  // ── SERVER 2: Cloudinary ─────────────────────────────────────────
  var cloudActive = !!(cfgCN && cfgPreset);
  s += '<div style="background:#fff;border:2px solid ' + (cloudActive ? '#6366f1' : '#e5e0d8') + ';border-radius:14px;padding:14px 16px;margin-bottom:14px">';
  s += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
  s += '<div style="width:40px;height:40px;border-radius:10px;background:#eef2ff;border:1.5px solid #a5b4fc;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">☁️</div>';
  s += '<div><div style="font-weight:800;font-size:14px;color:#0f3320">Cloudinary</div>';
  s += '<div style="font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px">Servidor secundario · Archivos pesados</div></div>';
  s += '<span style="margin-left:auto;padding:4px 10px;background:' + (cloudActive ? '#eef2ff' : '#f5f5f5') + ';color:' + (cloudActive ? '#6366f1' : '#9ca3af') + ';border-radius:20px;font-size:10px;font-weight:800">' + (cloudActive ? '✅ ACTIVO' : '○ NO CONFIG.') + '</span>';
  s += '</div>';

  s += '<div style="font-size:11px;color:#4b5563;line-height:1.7;margin-bottom:10px">';
  s += '<b>Plan gratuito:</b> 25 GB storage + 25 GB bandwidth/mes · No requiere tarjeta de crédito<br>';
  s += '<b>Almacena:</b> Fotos de evaluaciones (JPEG/HEIC), documentos PDF, Word';
  s += '</div>';

  // Current config
  if (cloudActive) {
    s += '<div style="padding:8px 12px;background:#eef2ff;border-radius:8px;font-size:11px;margin-bottom:10px">';
    s += '<b>Cloud name:</b> ' + escH(cfgCN) + ' &nbsp;·&nbsp; <b>Preset:</b> ' + escH(cfgPreset);
    s += '</div>';
  }

  // Config form
  s += '<div style="margin-top:4px">';
  s += '<div style="font-size:11px;font-weight:700;color:#1a1a1a;margin-bottom:6px">Configurar Cloudinary</div>';
  s += '<input type="text" id="srv-cloud-name" placeholder="Cloud Name (ej: bosques-urbanos)" value="' + escH(cfgCN) + '" style="width:100%;padding:9px 11px;border:1.5px solid #ddd;border-radius:8px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;margin-bottom:6px;box-sizing:border-box">';
  s += '<input type="text" id="srv-preset" placeholder="Upload Preset (ej: bosques_preset)" value="' + escH(cfgPreset) + '" style="width:100%;padding:9px 11px;border:1.5px solid #ddd;border-radius:8px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;margin-bottom:6px;box-sizing:border-box">';
  s += '<div id="srv-error" style="display:none;color:#b91c1c;font-size:11px;font-weight:600;margin-bottom:6px;padding:7px;background:#fee2e2;border-radius:7px"></div>';
  s += '<button id="srv-save-btn" onclick="saveCloudinaryConfig()" style="width:100%;padding:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">💾 Guardar configuración</button>';
  if (cloudActive) {
    s += '<button onclick="clearCloudinaryConfig()" style="width:100%;margin-top:6px;padding:8px;background:#fff;color:#9ca3af;border:1.5px solid #e5e7eb;border-radius:10px;font-size:12px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif">✕ Eliminar configuración</button>';
  }
  s += '</div>';

  // Guide
  s += '<details style="margin-top:14px">';
  s += '<summary style="font-size:12px;font-weight:700;color:#6366f1;cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:6px">📖 Guía de configuración paso a paso ▾</summary>';
  s += '<div style="margin-top:10px;font-size:11px;color:#374151;line-height:1.8;background:#f8f8ff;padding:12px;border-radius:10px;border:1px solid #e0e7ff">';
  s += '<b style="color:#6366f1">Paso 1:</b> Ve a <a href="https://cloudinary.com/users/register_free" target="_blank" style="color:#6366f1;font-weight:700">cloudinary.com/users/register_free</a><br>';
  s += '— Crea una cuenta gratuita (no requiere tarjeta).<br><br>';
  s += '<b style="color:#6366f1">Paso 2:</b> En el Dashboard, copia tu <b>Cloud Name</b>.<br>';
  s += '— Aparece arriba a la izquierda, ej: <code style="background:#e8e8ff;padding:1px 4px;border-radius:3px;font-family:monospace">bosques-urbanos-9842</code><br><br>';
  s += '<b style="color:#6366f1">Paso 3:</b> Ve a <b>Settings → Upload</b> (ícono de llave).<br>';
  s += '— Busca la sección "Upload presets".<br>';
  s += '— Haz clic en <b>"Add upload preset"</b>.<br>';
  s += '— Signing mode → <b>Unsigned</b> (obligatorio para subir desde el browser sin backend).<br>';
  s += '— Folder: escribe <code style="background:#e8e8ff;padding:1px 4px;border-radius:3px;font-family:monospace">bosques-urbanos</code><br>';
  s += '— Guarda. Copia el nombre del preset, ej: <code style="background:#e8e8ff;padding:1px 4px;border-radius:3px;font-family:monospace">bosques_preset</code><br><br>';
  s += '<b style="color:#6366f1">Paso 4:</b> Pega los datos arriba y haz clic en <b>Guardar configuración</b>.<br>';
  s += '— La configuración se guarda en Firebase y persiste para siempre.<br>';
  s += '— Todos los nuevos uploads usarán Cloudinary automáticamente.';
  s += '</div></details>';
  s += '</div>';

  // ── Firebase Storage (legacy / upgrade path) ──
  s += '<div style="background:#fff;border:1.5px solid #e5e0d8;border-radius:14px;padding:14px 16px;margin-bottom:14px">';
  s += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
  s += '<div style="width:40px;height:40px;border-radius:10px;background:#fff7ed;border:1.5px solid #fed7aa;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🗄️</div>';
  s += '<div><div style="font-weight:700;font-size:13px;color:#0f3320">Firebase Storage</div>';
  s += '<div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Fallback automático</div></div>';
  s += '<span style="margin-left:auto;padding:4px 10px;background:#fff7ed;color:#d97706;border-radius:20px;font-size:10px;font-weight:800">⚡ FALLBACK</span>';
  s += '</div>';
  s += '<div style="font-size:11px;color:#4b5563;line-height:1.6">';
  s += 'Si Cloudinary no está configurado, las fotos se comprimen y almacenan como base64 en la DB (Realtime DB).<br>';
  s += '<b>Límite efectivo:</b> ~200KB por foto (comprimidas automáticamente) · No requiere configuración.';
  s += '</div></div>';

  if (!inline) s += '</div>';
  return s;
}

window.saveCloudinaryConfig = async function () {
  var cloudName = (document.getElementById('srv-cloud-name')?.value || '').trim();
  var preset    = (document.getElementById('srv-preset')?.value   || '').trim();
  var errEl     = document.getElementById('srv-error');
  var btn       = document.getElementById('srv-save-btn');

  if (errEl) errEl.style.display = 'none';

  if (!cloudName || !preset) {
    if (errEl) { errEl.textContent = 'Completa Cloud Name y Upload Preset.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    // Save to Firebase DB at /config/cloudinary
    if (typeof window._fbSetConfig === 'function') {
      await window._fbSetConfig('cloudinary', { cloudName: cloudName, uploadPreset: preset, updatedAt: Date.now() });
    }
    // Apply immediately
    window.CLOUDINARY_CLOUD_NAME    = cloudName;
    window.CLOUDINARY_UPLOAD_PRESET = preset;

    if (window.showNotif) window.showNotif('✅ Cloudinary configurado');
    window.renderAdminPanel();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar configuración'; }
    if (errEl) { errEl.textContent = '❌ Error: ' + (e.message || 'Intenta de nuevo'); errEl.style.display = 'block'; }
  }
};

window.clearCloudinaryConfig = async function () {
  if (!confirm('¿Eliminar la configuración de Cloudinary? Los uploads volverán a usar base64.')) return;
  try {
    if (typeof window._fbSetConfig === 'function') {
      await window._fbSetConfig('cloudinary', null);
    }
    window.CLOUDINARY_CLOUD_NAME    = '';
    window.CLOUDINARY_UPLOAD_PRESET = '';
    if (window.showNotif) window.showNotif('⚠️ Cloudinary desactivado');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || ''));
  }
};

function _settingStat(icon, value, label) {
  return '<div style="background:#f9f7f4;border-radius:10px;padding:10px;text-align:center">' +
    '<div style="font-size:18px;margin-bottom:2px">' + icon + '</div>' +
    '<div style="font-family:\'Fraunces\',serif;font-size:18px;font-weight:900;color:#0f3320">' + value + '</div>' +
    '<div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">' + label + '</div>' +
  '</div>';
}

/* ─────────────────────────────────────────
   CREATE USER
───────────────────────────────────────── */

window._toggleClienteField = function() {
  var role = document.getElementById('newUserRole');
  var wrap = document.getElementById('newUserClienteWrap');
  if (role && wrap) wrap.style.display = role.value === 'cliente' ? 'block' : 'none';
};

window.showCreateUserForm = function () {
  var form = document.getElementById('createUserForm');
  if (form) {
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    var input = document.getElementById('newUserNombre');
    if (input) input.focus();
  }
};

window.createNewUser = async function () {
  var nombre = (document.getElementById('newUserNombre')?.value || '').trim();
  var email = (document.getElementById('newUserEmail')?.value || '').trim();
  var pass = document.getElementById('newUserPass')?.value || '';
  var role = document.getElementById('newUserRole')?.value || 'usuario';
  var clienteAsignado = role === 'cliente' ? (document.getElementById('newUserClienteAsignado')?.value || '').trim() : null;
  var btn = document.getElementById('createUserBtn');
  var err = document.getElementById('createUserError');

  err.style.display = 'none';

  if (!nombre || !email || !pass) {
    err.textContent = 'Completa todos los campos obligatorios.';
    err.style.display = 'block';
    return;
  }
  if (pass.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    err.style.display = 'block';
    return;
  }
  if (role === 'cliente' && !clienteAsignado) {
    err.textContent = 'Debes indicar el nombre del cliente asignado.';
    err.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creando...';

  try {
    var salt = window._generateSalt();
    var hash = await window._hashPassword(pass, salt);
    var uid  = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var userData = {
      nombre: nombre, email: email.toLowerCase(), role: role,
      salt: salt, passwordHash: hash,
      activo: true, clientesPermitidos: [],
      creadoPor: window._AUTH.currentUser?.uid || null,
      creadoEn: Date.now()
    };
    if (clienteAsignado) userData.clienteAsignado = clienteAsignado;
    await window._fbSaveUser(uid, userData);
    if (window.showNotif) window.showNotif('✅ Cuenta creada: ' + nombre);
    // Reset form
    ['newUserNombre', 'newUserEmail', 'newUserPass'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
    window.renderAdminPanel();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
    var msg = e.message || 'Error al crear la cuenta.';
    if (e.code === 'auth/email-already-in-use') msg = 'Ese correo ya está registrado.';
    if (e.code === 'auth/invalid-email') msg = 'Correo no válido.';
    if (e.code === 'auth/weak-password') msg = 'Contraseña muy débil. Usa al menos 6 caracteres.';
    err.textContent = msg;
    err.style.display = 'block';
  }
};

/* ─────────────────────────────────────────
   TOGGLE ACTIVE
───────────────────────────────────────── */

window.toggleUserActive = async function (uid, active) {
  try {
    await window._fbUpdateUser(uid, { activo: active });
    if (window.showNotif) window.showNotif(active ? '✅ Usuario activado' : '⚠️ Usuario desactivado');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error al actualizar');
  }
};

/* ─────────────────────────────────────────
   EDIT CLIENT PERMISSIONS
───────────────────────────────────────── */

window.editUserClients = function (uid) {
  window._editingClientsUid = uid;
  var u = window._allUsersCache[uid];
  var allowed = u?.clientesPermitidos || [];

  var clienteSet = new Set();
  Object.values(window._fbRawAll || window._dbAll || {}).forEach(function (e) {
    if (e.cliente) clienteSet.add(e.cliente);
  });
  Object.values(window._clientesAll || {}).forEach(function (c) {
    if (c.nombre) clienteSet.add(c.nombre);
  });
  var clienteList = Array.from(clienteSet).sort();

  var panel = document.getElementById('editClientsPanel');
  var list = document.getElementById('editClientsList');
  if (!panel || !list) return;

  var html = '';

  if (clienteList.length === 0) {
    html = '<div style="color:#6b7280;font-size:13px;padding:8px">No hay clientes registrados aún.</div>';
  } else {
    // All clients option
    html += '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border-radius:10px;border:1.5px solid #e5e0d8;cursor:pointer">';
    html += '<input type="radio" name="clientAccess" value="all" ' + (allowed.length === 0 ? 'checked' : '') + ' onchange="handleClientAccessChange(this)" style="width:16px;height:16px;accent-color:#0f3320">';
    html += '<span style="font-weight:600;font-size:13px;color:#0f3320">🌳 Todos los clientes</span></label>';

    html += '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border-radius:10px;border:1.5px solid #e5e0d8;cursor:pointer">';
    html += '<input type="radio" name="clientAccess" value="specific" ' + (allowed.length > 0 ? 'checked' : '') + ' onchange="handleClientAccessChange(this)" style="width:16px;height:16px;accent-color:#1d4ed8">';
    html += '<span style="font-weight:600;font-size:13px;color:#1d4ed8">🏢 Clientes específicos</span></label>';

    html += '<div id="specificClientsList" style="padding-left:8px;display:' + (allowed.length > 0 ? 'flex' : 'none') + ';flex-direction:column;gap:4px">';
    clienteList.forEach(function (c) {
      var checked = allowed.indexOf(c) !== -1;
      html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:' + (checked ? '#f0fdf4' : '#fff') + ';border-radius:8px;border:1px solid ' + (checked ? '#22c55e' : '#e5e0d8') + ';cursor:pointer">';
      html += '<input type="checkbox" name="clientCheck" value="' + escH(c) + '" ' + (checked ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#0f3320">';
      html += '<span style="font-size:13px;font-weight:500">' + escH(c) + '</span></label>';
    });
    html += '</div>';
  }

  list.innerHTML = html;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.handleClientAccessChange = function (radio) {
  var specific = document.getElementById('specificClientsList');
  if (specific) specific.style.display = radio.value === 'specific' ? 'flex' : 'none';
};

window.saveUserClients = async function () {
  var uid = window._editingClientsUid;
  if (!uid) return;

  var allRadio = document.querySelector('input[name="clientAccess"][value="all"]');
  var allowed = [];

  if (!allRadio?.checked) {
    var checks = document.querySelectorAll('input[name="clientCheck"]:checked');
    allowed = Array.from(checks).map(function (c) { return c.value; });
  }

  try {
    await window._fbUpdateUser(uid, { clientesPermitidos: allowed });
    if (window.showNotif) window.showNotif('✅ Permisos de clientes actualizados');
    document.getElementById('editClientsPanel').style.display = 'none';
    window._editingClientsUid = null;
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error al guardar permisos');
  }
};

/* ─────────────────────────────────────────
   CHANGE PASSWORD
   Two methods offered to admin/programador:
   1. Send reset email → Firebase mails a secure link to the user
   2. Direct change → admin enters current + new password (uses secondary app)
───────────────────────────────────────── */

window._changingPassUid   = null;
window._changingPassEmail = null;

window.changeUserPassword = function (uid, email) {
  window._changingPassUid   = uid;
  window._changingPassEmail = email;

  var emailEl = document.getElementById('changePassEmail');
  var curPass = document.getElementById('changePassCurrent');
  var newPass = document.getElementById('changePassNew');
  var conf    = document.getElementById('changePassConfirm');
  var err     = document.getElementById('changePassError');
  var ok      = document.getElementById('changePassOk');

  if (emailEl) emailEl.textContent = email;
  if (curPass) curPass.value = '';
  if (newPass) newPass.value = '';
  if (conf)    conf.value    = '';
  if (err)     err.style.display = 'none';
  if (ok)      ok.style.display  = 'none';

  var panel = document.getElementById('changePassPanel');
  if (panel) {
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

// Direct password change — admin sets the new password, no current password needed.
// Hashes new password with PBKDF2 and saves to DB. Works 100% client-side.
window.doChangePassword = async function () {
  var newPass = (document.getElementById('changePassNew')?.value    || '');
  var conf    = (document.getElementById('changePassConfirm')?.value || '');
  var btn     = document.getElementById('changePassBtn');
  var err     = document.getElementById('changePassError');
  var ok      = document.getElementById('changePassOk');

  err.style.display = 'none';
  ok.style.display  = 'none';

  if (newPass.length < 6) {
    err.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
    err.style.display = 'block';
    return;
  }
  if (newPass !== conf) {
    err.textContent = 'Las contraseñas no coinciden.';
    err.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    var salt = window._generateSalt();
    var hash = await window._hashPassword(newPass, salt);
    await window._fbUpdateUser(window._changingPassUid, { salt: salt, passwordHash: hash });

    ok.textContent   = '✅ Contraseña actualizada correctamente.';
    ok.style.display = 'block';
    document.getElementById('changePassNew').value     = '';
    document.getElementById('changePassConfirm').value = '';
    if (window.showNotif) window.showNotif('✅ Contraseña actualizada');
  } catch (e) {
    err.textContent   = e.message || 'Error al cambiar contraseña.';
    err.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar nueva contraseña';
  }
};

/* ─────────────────────────────────────────
   SYSTEM TOOLS (Programador only)
───────────────────────────────────────── */

// Force all regular users to re-login next time by clearing sessionExpires
// (sets a past timestamp so their boot check fails)
window.forceLogoutAllUsers = async function () {
  if (!confirm('¿Forzar cierre de sesión a todos los usuarios? Deberán volver a ingresar.')) return;
  var users = await window._fbGetAllUsers();
  var updates = {};
  Object.entries(users).forEach(function (e) {
    if (e[1].role === 'usuario') {
      // Set sessionExpires to 1ms ago — boot check will reject
      updates['usuarios/' + e[0] + '/sessionExpires'] = Date.now() - 1;
    }
  });
  try {
    var { getDatabase, ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    // Use the existing FB update pattern
    for (var uid of Object.keys(users)) {
      if (users[uid].role === 'usuario') {
        await window._fbUpdateUser(uid, { sessionExpires: Date.now() - 1 });
      }
    }
    if (window.showNotif) window.showNotif('✅ Sesiones revocadas');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error');
  }
};

// Remove expired sessionExpires (set them to null = indefinite)
window.revokeAllSessions = async function () {
  if (!confirm('¿Limpiar todas las sesiones temporales vencidas? Los usuarios quedarán sin acceso hasta que un admin les asigne nueva duración.')) return;
  var users = await window._fbGetAllUsers();
  try {
    for (var uid of Object.keys(users)) {
      var u = users[uid];
      if (u.role === 'usuario' && u.sessionExpires && Date.now() > u.sessionExpires) {
        // Keep expired flag so user can't log in until admin resets
        await window._fbUpdateUser(uid, { activo: false });
      }
    }
    if (window.showNotif) window.showNotif('✅ Sesiones vencidas desactivadas');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error');
  }
};

/* ─────────────────────────────────────────
   EXPORT ALL DATA
───────────────────────────────────────── */

window.exportAllData = function () {
  var data = {
    evaluaciones: window._fbRawAll || window._dbAll || {},
    clientes: window._clientesAll || {},
    exportedAt: new Date().toISOString()
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'bosques-urbanos-export-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
};

/* ─────────────────────────────────────────
   SESSION EXPIRY
───────────────────────────────────────── */

window._editingSessionUid = null;

window.editUserSession = function (uid) {
  window._editingSessionUid = uid;
  var u = window._allUsersCache[uid];
  var panel    = document.getElementById('editSessionPanel');
  var emailEl  = document.getElementById('editSessionEmail');
  if (emailEl) emailEl.textContent = u?.email || '';

  // Pre-select current duration
  var radios = document.querySelectorAll('input[name="sessionDur"]');
  radios.forEach(function (r) { r.checked = r.value === '0'; }); // default: indefinite
  if (u?.sessionExpires && Date.now() < u.sessionExpires) {
    var daysLeft = Math.ceil((u.sessionExpires - Date.now()) / 86400000);
    var closest = ['1','3','7','15','30'].find(function (d) { return parseInt(d) >= daysLeft; }) || '30';
    radios.forEach(function (r) { if (r.value === closest) r.checked = true; });
  }

  if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
};

window.saveUserSession = async function () {
  var uid = window._editingSessionUid;
  if (!uid) return;
  var radio = document.querySelector('input[name="sessionDur"]:checked');
  var days  = radio ? parseInt(radio.value) : 0;
  var sessionExpires = days > 0 ? Date.now() + days * 86400000 : null;

  try {
    await window._fbUpdateUser(uid, { sessionExpires: sessionExpires });
    var msg = days > 0 ? ('⏳ Acceso limitado a ' + days + ' día' + (days !== 1 ? 's' : '')) : '✅ Acceso indefinido';
    if (window.showNotif) window.showNotif(msg);
    document.getElementById('editSessionPanel').style.display = 'none';
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error al guardar');
  }
};

function _daysLeft(ts) {
  return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
}

/* ─────────────────────────────────────────
   DELETE USER (programador + admin)
───────────────────────────────────────── */

window.deleteUser = async function (uid, displayName) {
  var myRole = window.APP && window.APP.userRole;
  var myUid  = window._AUTH && window._AUTH.currentUser && window._AUTH.currentUser.uid;
  if (uid === myUid) { window.showNotif('No puedes eliminarte a ti mismo'); return; }
  if (!confirm('¿Eliminar la cuenta de "' + displayName + '"? Esta acción es irreversible.')) return;
  try {
    await window._fbRemoveUser(uid);
    window.showNotif('✅ Usuario eliminado');
    window.renderAdminPanel();
  } catch (e) {
    window.showNotif('❌ Error: ' + (e.message || 'desconocido'));
  }
};

/* ─────────────────────────────────────────
   PROGRAMADOR — CLIENT MANAGEMENT
───────────────────────────────────────── */

window.adminDeleteClient = async function (clienteName) {
  var rawAll = window._fbRawAll || window._dbAll || {};
  var keysToDelete = Object.entries(rawAll)
    .filter(function (e) { return e[1].cliente === clienteName; })
    .map(function (e) { return e[0]; });

  if (!confirm('¿Eliminar el cliente "' + clienteName + '" y sus ' + keysToDelete.length + ' evaluaciones? Esto es irreversible.')) return;

  try {
    for (var i = 0; i < keysToDelete.length; i++) {
      await window._fbRemove(keysToDelete[i]);
    }
    // Also remove from clientes collection
    var clientesAll = window._clientesAll || {};
    var ckEntries = Object.entries(clientesAll);
    for (var j = 0; j < ckEntries.length; j++) {
      if (ckEntries[j][1].nombre === clienteName) {
        await window._fbRemoveCliente(ckEntries[j][0]);
        break;
      }
    }
    if (window.showNotif) window.showNotif('✅ Cliente eliminado (' + keysToDelete.length + ' evaluaciones)');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error: ' + (e.message || 'desconocido'));
  }
};

/* ─────────────────────────────────────────
   PROGRAMADOR — REACTIVATE ALL USERS
───────────────────────────────────────── */

window.adminActivateAll = async function () {
  if (!confirm('¿Reactivar todos los usuarios desactivados?')) return;
  var users = await window._fbGetAllUsers();
  try {
    var count = 0;
    var uids = Object.keys(users);
    for (var i = 0; i < uids.length; i++) {
      var uid = uids[i];
      if (users[uid].activo === false && users[uid].role !== 'programador') {
        await window._fbUpdateUser(uid, { activo: true });
        count++;
      }
    }
    if (window.showNotif) window.showNotif('✅ ' + count + ' usuario(s) reactivado(s)');
    window.renderAdminPanel();
  } catch (e) {
    if (window.showNotif) window.showNotif('❌ Error');
  }
};

/* ─────────────────────────────────────────
   PROGRAMADOR — IMPORT DATA
───────────────────────────────────────── */

window.adminImportData = function () {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = async function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var data = JSON.parse(text);
      if (!data.evaluaciones || typeof data.evaluaciones !== 'object') {
        if (window.showNotif) window.showNotif('❌ Formato inválido: falta "evaluaciones"');
        return;
      }
      var count = Object.keys(data.evaluaciones).length;
      if (!confirm('¿Importar ' + count + ' evaluaciones? Se añadirán a los datos existentes.')) return;
      var imported = 0;
      var evals = Object.values(data.evaluaciones);
      for (var i = 0; i < evals.length; i++) {
        await window.FB.pushEval(evals[i]);
        imported++;
      }
      if (window.showNotif) window.showNotif('✅ Importadas ' + imported + ' evaluaciones');
    } catch (ex) {
      if (window.showNotif) window.showNotif('❌ Error: ' + (ex.message || 'archivo inválido'));
    }
  };
  inp.click();
};

/* ─────────────────────────────────────────
   PROGRAMADOR — SELF CHANGE PASSWORD
───────────────────────────────────────── */

window._adminSelfChangePass = function () {
  var uid = window._AUTH && window._AUTH.currentUser && window._AUTH.currentUser.uid;
  var email = window._AUTH && window._AUTH.userData && window._AUTH.userData.email;
  if (uid) window.changeUserPassword(uid, email || '');
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════
   DEV CONSOLE — programador only
   Full raw Firebase browser + inline editor
═══════════════════════════════════════════════════════ */

var _devTab        = 'overview';
var _devData       = null;     // raw object loaded
var _devPath       = '';       // active Firebase path string
var _devSelPath    = null;     // dotted path within _devData of selected node
var _devExpanded   = {};       // set of expanded node paths

var _devTabPaths = {
  overview:   null,
  eval:       'evaluaciones',
  clientes:   'clientes',
  archivos:   'archivos',
  usuarios:   'usuarios',
  online:     null,
  servidores: null,
  config:     null,
  custom:     null
};

// Tabs that use the editor panel and toolbar (data explorer tabs)
var _devDataTabs = { eval:true, clientes:true, archivos:true, usuarios:true, custom:true };

window.openDevConsole = function () {
  var role = window.APP && window.APP.userRole;
  if (role !== 'programador') { window.showNotif('Acceso restringido'); return; }
  var modal = document.getElementById('devConsoleModal');
  if (modal) modal.style.display = 'flex';
  _devExpanded = {};
  _devSelPath = null;
  // Sync editor/toolbar visibility with the current tab
  var isDataTab = _devDataTabs[_devTab];
  var editor = document.getElementById('devEditor');
  var toolbar = document.getElementById('devToolbar');
  if (editor) editor.style.display = isDataTab ? 'flex' : 'none';
  if (toolbar) toolbar.style.display = isDataTab ? 'flex' : 'none';
  devLoad();
};

window.closeDevConsole = function () {
  var modal = document.getElementById('devConsoleModal');
  if (modal) modal.style.display = 'none';
};

window.devSetTab = function (tab) {
  _devTab = tab;
  _devSelPath = null;
  var tabs = document.querySelectorAll('.dev-tab');
  tabs.forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  var fbPath = _devTabPaths[tab];
  if (fbPath) {
    var pathEl = document.getElementById('devPathInput');
    if (pathEl) pathEl.value = '/' + fbPath;
  }
  // Show/hide editor and toolbar based on tab type
  var isDataTab = _devDataTabs[tab];
  var editor = document.getElementById('devEditor');
  var toolbar = document.getElementById('devToolbar');
  if (editor) editor.style.display = isDataTab ? 'flex' : 'none';
  if (toolbar) toolbar.style.display = isDataTab ? 'flex' : 'none';
  _devExpanded = {};
  devLoad();
};

window.devLoad = async function () {
  // Special tabs with custom renderers
  if (_devTab === 'overview')   { _devRenderOverview();   return; }
  if (_devTab === 'servidores') { _devRenderServidores(); return; }
  if (_devTab === 'online')     { _devRenderOnline();     return; }
  if (_devTab === 'config')     { _devRenderConfig();     return; }

  var pathEl = document.getElementById('devPathInput');
  var rawPath = (pathEl ? pathEl.value.trim() : '') || '/';
  // Normalize
  if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
  _devPath = rawPath;

  var statusEl = document.getElementById('devStatus');
  if (statusEl) statusEl.textContent = '⏳ Cargando ' + rawPath + '...';

  var treeEl = document.getElementById('devTree');
  if (treeEl) treeEl.innerHTML = '<span style="color:#4b5563">Cargando...</span>';

  try {
    // Use Firebase onValue once to get the data at this path
    var data = await _devReadPath(rawPath);
    _devData = data;
    if (statusEl) statusEl.textContent = '✅ ' + rawPath + ' · ' + (data ? Object.keys(data).length : 0) + ' claves raíz';
    _devRenderTree();
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌ ' + e.message;
    if (treeEl) treeEl.innerHTML = '<span style="color:#f87171">Error: ' + _escDev(e.message) + '</span>';
  }
};

window.devRefresh = window.devLoad;

// ── 🌐 SERVIDORES tab ──────────────────────────────────────────
function _devRenderServidores() {
  var treeEl   = document.getElementById('devTree');
  var statusEl = document.getElementById('devStatus');
  if (statusEl) statusEl.textContent = '🌐 Cargando información de servidores...';

  var projectId = window._FIREBASE_PROJECT_ID || 'appp-1ed52';
  var dbUrl      = window._FIREBASE_DB_URL     || 'https://appp-1ed52-default-rtdb.firebaseio.com';
  var cloudName  = window.CLOUDINARY_CLOUD_NAME    || 'db2qb5hlj';
  var preset     = window.CLOUDINARY_UPLOAD_PRESET || 'bosques_urbanos';
  var ghPages    = 'https://bomberito111.github.io/pruebas/';
  var ghRepo     = 'https://github.com/bomberito111/pruebas';

  // Count local DB stats
  var db = window._dbAll || {};
  var cls = window._clientesAll || {};
  var nEvals    = Object.keys(db).length;
  var nClientes = Object.keys(cls).length;

  function link(label, href, bg) {
    return '<a href="' + href + '" target="_blank" ' +
      'style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:' + (bg||'#111') + ';' +
      'border:1px solid #1f2937;border-radius:9px;text-decoration:none;color:#d1fae5;font-weight:700;font-size:12px;' +
      'margin-bottom:6px;transition:opacity .15s;" onmouseover="this.style.opacity=.75" onmouseout="this.style.opacity=1">' +
      label + '<span style="margin-left:auto;font-size:10px;color:#4b5563;">→</span></a>';
  }

  function section(color, icon, title, sub) {
    return '<div style="margin-bottom:20px;border:1px solid ' + color + '22;border-radius:12px;overflow:hidden;">' +
      '<div style="background:' + color + '15;border-bottom:1px solid ' + color + '22;padding:10px 14px;display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:16px">' + icon + '</span>' +
        '<div><div style="font-size:11px;font-weight:800;color:' + color + '">' + title + '</div>' +
        (sub ? '<div style="font-size:9px;color:#4b5563;margin-top:1px">' + sub + '</div>' : '') + '</div>' +
      '</div>' +
      '<div style="padding:10px 14px 6px;">';
  }

  function statPill(label, val, col) {
    return '<span style="display:inline-flex;flex-direction:column;align-items:center;padding:6px 12px;' +
      'background:#0a0a0a;border:1px solid #1f2937;border-radius:8px;margin:0 4px 6px 0;">' +
      '<span style="font-size:13px;font-weight:800;color:' + (col||'#d1fae5') + '">' + val + '</span>' +
      '<span style="font-size:8px;font-weight:600;color:#4b5563;text-transform:uppercase;letter-spacing:.6px">' + label + '</span></span>';
  }

  var html = '<div style="max-width:720px;">';

  // ── FIREBASE ──
  html += section('#4ade80', '🔥', 'Firebase Realtime DB', projectId);
  html += '<div style="display:flex;flex-wrap:wrap;margin-bottom:10px;">';
  html += statPill('Evaluaciones', nEvals, '#4ade80');
  html += statPill('Clientes', nClientes, '#4ade80');
  html += statPill('Plan', 'Spark Free', '#9ca3af');
  html += statPill('Storage', '1 GB incluido', '#9ca3af');
  html += '</div>';
  html += link('🔥 Firebase Console — Realtime DB', 'https://console.firebase.google.com/project/' + projectId + '/database/' + projectId + '-default-rtdb/data', '#0f1f0f');
  html += link('🗄️ Firebase Storage (archivos)', 'https://console.firebase.google.com/project/' + projectId + '/storage', '#0a1210');
  html += link('🔑 Firebase API Keys', 'https://console.firebase.google.com/project/' + projectId + '/settings/general', '#0a1210');
  html += link('📊 Firebase Analytics', 'https://console.firebase.google.com/project/' + projectId + '/analytics', '#0a1210');

  // Mini DB export/migrate
  html += '<div style="margin-top:8px;padding:10px;background:#0a0a0a;border:1px solid #1f2937;border-radius:8px">';
  html += '<div style="font-size:10px;color:#4ade80;font-weight:700;margin-bottom:8px">⚙️ Acciones rápidas</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
  html += '<button onclick="devSetTab(\'eval\')" style="padding:6px 12px;background:#065f46;color:#6ee7b7;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;">🌳 Ver evaluaciones</button>';
  html += '<button onclick="devSetTab(\'clientes\')" style="padding:6px 12px;background:#065f46;color:#6ee7b7;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;">👥 Ver clientes</button>';
  html += '<button onclick="window.devExportRaw&&devSetTab(\'eval\');" style="padding:6px 12px;background:#111827;color:#9ca3af;border:1px solid #374151;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;">📦 Exportar JSON</button>';
  html += '</div></div>';
  html += '</div></div>'; // close section inner + section

  // ── CLOUDINARY ──
  html += section('#fbbf24', '☁️', 'Cloudinary — Almacenamiento multimedia', 'cloud: ' + cloudName + ' · preset: ' + preset);
  html += '<div style="display:flex;flex-wrap:wrap;margin-bottom:10px;">';
  html += statPill('Plan', 'Free', '#fbbf24');
  html += statPill('Storage', '25 GB', '#fbbf24');
  html += statPill('Bandwidth', '25 GB/mes', '#fbbf24');
  html += statPill('Preset', preset || '—', '#9ca3af');
  html += '</div>';
  html += link('🖼️ Cloudinary Media Library', 'https://console.cloudinary.com/app/c-0c31f5457d7927d7441b74c0ee3ebe/assets', '#1a1400');
  html += link('📈 Cloudinary Dashboard & Usage', 'https://console.cloudinary.com/app/c-0c31f5457d7927d7441b74c0ee3ebe/home/dashboard', '#1a1400');
  html += link('⚙️ Cloudinary Upload Presets', 'https://console.cloudinary.com/app/c-0c31f5457d7927d7441b74c0ee3ebe/settings/upload/presets', '#1a1400');

  // Cloudinary config form
  html += '<div style="margin-top:8px;padding:10px;background:#0a0a0a;border:1px solid #374151;border-radius:8px">';
  html += '<div style="font-size:10px;color:#fbbf24;font-weight:700;margin-bottom:8px">⚙️ Configurar credenciales</div>';
  html += '<input id="devCloudName" value="' + _escDev(cloudName) + '" placeholder="Cloud Name" ' +
    'style="width:100%;box-sizing:border-box;background:#111;border:1px solid #374151;border-radius:6px;padding:7px 9px;color:#fde68a;font-family:\'IBM Plex Mono\',monospace;font-size:11px;margin-bottom:5px;outline:none">';
  html += '<input id="devUploadPreset" value="' + _escDev(preset) + '" placeholder="Upload Preset (unsigned)" ' +
    'style="width:100%;box-sizing:border-box;background:#111;border:1px solid #374151;border-radius:6px;padding:7px 9px;color:#fde68a;font-family:\'IBM Plex Mono\',monospace;font-size:11px;margin-bottom:7px;outline:none">';
  html += '<button onclick="_devSaveCloudinary()" style="padding:7px 14px;background:#92400e;color:#fde68a;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;font-family:\'IBM Plex Mono\',monospace">💾 Guardar en Firebase</button>';
  html += '<div id="devCloudinaryStatus" style="font-size:10px;color:#4b5563;margin-top:5px"></div>';
  html += '</div>';
  html += '</div></div>'; // close section

  // ── GITHUB ──
  html += section('#93c5fd', '🐙', 'GitHub · Código fuente y despliegue', ghRepo);
  html += '<div style="display:flex;flex-wrap:wrap;margin-bottom:10px;">';
  html += statPill('Repo', 'bomberito111/pruebas', '#93c5fd');
  html += statPill('Branch', 'main', '#9ca3af');
  html += statPill('Deploy', 'GitHub Pages', '#9ca3af');
  html += '</div>';
  html += link('🐙 Repositorio GitHub', ghRepo, '#0a0f1a');
  html += link('🌐 App en vivo (GitHub Pages)', ghPages, '#0a0f1a');
  html += link('⚙️ GitHub Pages Settings', ghRepo + '/settings/pages', '#0a0f1a');
  html += link('📜 GitHub Actions (deploys)', ghRepo + '/actions', '#0a0f1a');
  html += '</div></div>'; // close section

  // ── DB URL ──
  html += '<div style="margin-top:6px;background:#0a0a0a;border:1px solid #1f2937;border-radius:8px;padding:10px 12px;">';
  html += '<div style="font-size:9px;color:#4b5563;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Firebase DB URL</div>';
  html += '<div style="font-size:10px;color:#6ee7b7;font-family:\'IBM Plex Mono\',monospace;word-break:break-all">' + _escDev(dbUrl) + '</div>';
  html += '</div>';

  html += '</div>'; // max-width wrapper
  treeEl.innerHTML = html;
  if (statusEl) statusEl.textContent = '🌐 ' + nEvals + ' evals · ' + nClientes + ' clientes — Firebase + Cloudinary + GitHub';
}

window._devSaveCloudinary = async function() {
  var name   = (document.getElementById('devCloudName')    || {}).value || '';
  var preset = (document.getElementById('devUploadPreset') || {}).value || '';
  var st = document.getElementById('devCloudinaryStatus');
  if (!name || !preset) { if (st) st.textContent = '⚠️ Completa ambos campos'; return; }
  if (st) st.textContent = '⏳ Guardando...';
  try {
    await window._fbSetConfig('cloudinary', { cloudName: name, uploadPreset: preset });
    window.CLOUDINARY_CLOUD_NAME    = name;
    window.CLOUDINARY_UPLOAD_PRESET = preset;
    if (st) st.style.color = '#4ade80', st.textContent = '✅ Guardado. Cloudinary activo.';
  } catch(e) {
    if (st) st.style.color = '#f87171', st.textContent = '❌ Error: ' + e.message;
  }
};

// ── ⚙️ CONFIG tab ──────────────────────────────────────────
function _devRenderConfig() {
  var treeEl   = document.getElementById('devTree');
  var statusEl = document.getElementById('devStatus');
  if (statusEl) statusEl.textContent = '⚙️ Configuración de la aplicación';

  treeEl.style.overflow = '';
  treeEl.style.display  = '';
  treeEl.style.flexDirection = '';
  treeEl.style.padding  = '';

  var inp = function(id, val, placeholder, color) {
    return '<input id="' + id + '" value="' + _escDev(val||'') + '" placeholder="' + _escDev(placeholder||'') + '" ' +
      'style="width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #374151;border-radius:6px;padding:7px 9px;' +
      'color:' + (color||'#d1fae5') + ';font-family:\'IBM Plex Mono\',monospace;font-size:11px;margin-bottom:5px;outline:none">';
  };

  function section(icon, title, content) {
    return '<div style="background:#111;border:1px solid #1f2937;border-radius:10px;margin-bottom:12px;overflow:hidden;">' +
      '<div style="padding:10px 14px;border-bottom:1px solid #1f2937;font-size:10px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:1px;">' + icon + ' ' + title + '</div>' +
      '<div style="padding:12px 14px;">' + content + '</div>' +
    '</div>';
  }

  function saveBtn(fn, label) {
    return '<button onclick="' + fn + '" style="padding:7px 14px;background:#065f46;color:#6ee7b7;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;">' + label + '</button>';
  }

  // Load current config from Firebase
  (async function() {
    var cfg = {};
    try {
      if (typeof window._fbGetConfig === 'function') {
        var appCfg = await window._fbGetConfig('app');
        if (appCfg) cfg = appCfg;
      }
    } catch(e) {}

    var appTitle  = cfg.title  || 'Bosques Urbanos';
    var appSub    = cfg.subtitle || 'ISA TRAQ Asset Management';
    var ghRepo    = cfg.ghRepo    || 'https://github.com/bomberito111/pruebas';
    var ghPages   = cfg.ghPages   || 'https://bomberito111.github.io/pruebas/';
    var maxPhotos = cfg.maxPhotos || 10;
    var defRol    = cfg.defaultRole || 'usuario';

    treeEl.innerHTML = '<div style="max-width:680px;padding-bottom:20px;">' +

    section('🏷️', 'Identidad de la app',
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Título principal</label>' +
      inp('cfg-title', appTitle, 'Bosques Urbanos') +
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Subtítulo / descripción</label>' +
      inp('cfg-subtitle', appSub, 'ISA TRAQ Asset Management') +
      saveBtn('_devSaveAppConfig()', '💾 Guardar')
    ) +

    section('🔗', 'URLs de la aplicación',
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Repositorio GitHub</label>' +
      inp('cfg-ghrepo', ghRepo, 'https://github.com/...') +
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">URL pública (GitHub Pages)</label>' +
      inp('cfg-ghpages', ghPages, 'https://...github.io/...') +
      saveBtn('_devSaveAppConfig()', '💾 Guardar')
    ) +

    section('☁️', 'Cloudinary — Almacenamiento',
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Cloud Name</label>' +
      inp('devCloudName', window.CLOUDINARY_CLOUD_NAME||'db2qb5hlj', 'Cloud Name', '#fde68a') +
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Upload Preset (unsigned)</label>' +
      inp('devUploadPreset', window.CLOUDINARY_UPLOAD_PRESET||'bosques_urbanos', 'Upload Preset', '#fde68a') +
      saveBtn('_devSaveCloudinary()', '💾 Guardar Cloudinary') +
      '<div id="devCloudinaryStatus" style="font-size:10px;color:#4b5563;margin-top:5px"></div>'
    ) +

    section('⚙️', 'Opciones generales',
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Máximo de fotos por árbol</label>' +
      inp('cfg-maxphotos', maxPhotos, '10') +
      '<label style="font-size:10px;color:#4b5563;display:block;margin-bottom:2px">Rol por defecto para nuevos usuarios</label>' +
      '<select id="cfg-defrole" style="width:100%;background:#0a0a0a;border:1px solid #374151;border-radius:6px;padding:7px 9px;color:#d1fae5;font-family:\'IBM Plex Mono\',monospace;font-size:11px;margin-bottom:5px;outline:none">' +
        '<option value="usuario"' + (defRol==='usuario'?' selected':'') + '>usuario</option>' +
        '<option value="admin"' + (defRol==='admin'?' selected':'') + '>admin</option>' +
      '</select>' +
      saveBtn('_devSaveAppConfig()', '💾 Guardar')
    ) +

    section('🔒', 'Seguridad y acceso',
      '<div style="font-size:11px;color:#d1fae5;margin-bottom:10px">Gestión de usuarios de la aplicación:</div>' +
      '<button onclick="devSetTab(\'usuarios\')" style="padding:8px 14px;background:#1e3a5f;color:#93c5fd;border:1px solid #1d4ed8;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;margin-bottom:6px;display:block;width:100%">👥 Abrir gestión de usuarios →</button>' +
      '<div style="font-size:10px;color:#4b5563;margin-top:8px">Los usuarios se almacenan en Firebase <code style="color:#4ade80">/usuarios</code> y se autentican con contraseña hasheada.</div>'
    ) +

    '</div>';
  })();
}

window._devSaveAppConfig = async function() {
  var title     = (document.getElementById('cfg-title')    || {}).value || '';
  var subtitle  = (document.getElementById('cfg-subtitle') || {}).value || '';
  var ghRepo    = (document.getElementById('cfg-ghrepo')   || {}).value || '';
  var ghPages   = (document.getElementById('cfg-ghpages')  || {}).value || '';
  var maxPhotos = parseInt((document.getElementById('cfg-maxphotos')||{}).value||'10', 10);
  var defRole   = (document.getElementById('cfg-defrole')  || {}).value || 'usuario';

  try {
    await window._fbSetConfig('app', { title, subtitle, ghRepo, ghPages, maxPhotos, defaultRole: defRole });
    window.showNotif('✅ Configuración guardada');
  } catch(e) {
    window.showNotif('❌ Error: ' + e.message);
  }
};

// ── 📊 RESUMEN tab ──────────────────────────────────────────
function _devRenderOverview() {
  var treeEl   = document.getElementById('devTree');
  var statusEl = document.getElementById('devStatus');
  if (statusEl) statusEl.textContent = '📊 Resumen del sistema';

  var db  = window._dbAll || {};
  var cls = window._clientesAll || {};
  var nEv = Object.keys(db).length;
  var nCl = Object.keys(cls).length;

  // Risk distribution
  var riskCounts = { bajo:0, moderado:0, alto:0, extremo:0 };
  var latestByTree = {};
  Object.keys(db).forEach(function(k) {
    var ev = db[k]; var aid = ev.arbolId || k;
    var ts = ev.timestamp || 0;
    if (!latestByTree[aid] || ts > (latestByTree[aid].ts||0)) latestByTree[aid] = { ev:ev, ts:ts };
  });
  Object.values(latestByTree).forEach(function(item) {
    var r = (typeof window.getEffectiveRisk==='function') ? window.getEffectiveRisk(item.ev) : (item.ev.isaLevel||'bajo');
    riskCounts[r] = (riskCounts[r]||0) + 1;
  });
  var nTrees = Object.keys(latestByTree).length;

  var clN = window.CLOUDINARY_CLOUD_NAME || 'db2qb5hlj';
  var proj = window._FIREBASE_PROJECT_ID || 'appp-1ed52';

  function big(val, lbl, col) {
    return '<div style="background:#111;border:1px solid #1f2937;border-radius:10px;padding:14px 12px;text-align:center;">' +
      '<div style="font-size:24px;font-weight:800;color:' + (col||'#4ade80') + ';line-height:1">' + val + '</div>' +
      '<div style="font-size:9px;color:#4b5563;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-top:4px">' + lbl + '</div>' +
    '</div>';
  }

  var rColors = { bajo:'#4ade80', moderado:'#fbbf24', alto:'#f97316', extremo:'#ef4444' };
  var riskBar = Object.entries(riskCounts).filter(function(e){return e[1]>0;}).map(function(e) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
      '<span style="width:55px;font-size:9px;font-weight:700;color:' + rColors[e[0]] + ';text-transform:uppercase">' + e[0] + '</span>' +
      '<div style="flex:1;background:#1f2937;border-radius:4px;height:12px;overflow:hidden;">' +
        '<div style="height:100%;background:' + rColors[e[0]] + ';width:' + (nTrees>0?Math.round(e[1]/nTrees*100):0) + '%"></div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:700;color:#d1fae5;width:24px;text-align:right">' + e[1] + '</span>' +
    '</div>';
  }).join('');

  treeEl.innerHTML =
    '<div style="max-width:720px;padding-bottom:20px;">' +

    '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#4b5563;margin-bottom:10px;">📊 Estadísticas generales</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">' +
      big(nEv, 'Evaluaciones', '#4ade80') +
      big(nTrees, 'Árboles', '#4ade80') +
      big(nCl, 'Clientes', '#93c5fd') +
      big(riskCounts.extremo||0, 'Extremo', '#ef4444') +
    '</div>' +

    '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#4b5563;margin-bottom:8px;">🎯 Distribución de riesgo</div>' +
    '<div style="background:#111;border:1px solid #1f2937;border-radius:10px;padding:14px;margin-bottom:16px;">' +
      (nTrees > 0 ? riskBar : '<span style="color:#4b5563;font-size:10px">Sin árboles evaluados</span>') +
    '</div>' +

    '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#4b5563;margin-bottom:8px;">⚡ Acceso rápido</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' +
      '<button onclick="devSetTab(\'usuarios\')" style="padding:12px;background:#111;border:1px solid #374151;border-radius:8px;color:#d1fae5;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;text-align:left">👥 Gestionar usuarios →</button>' +
      '<button onclick="devSetTab(\'online\')" style="padding:12px;background:#111;border:1px solid #374151;border-radius:8px;color:#d1fae5;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;text-align:left">🟢 Ver sesiones activas →</button>' +
      '<button onclick="devSetTab(\'servidores\')" style="padding:12px;background:#111;border:1px solid #374151;border-radius:8px;color:#d1fae5;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;text-align:left">🌐 Panel de servidores →</button>' +
      '<button onclick="devSetTab(\'config\')" style="padding:12px;background:#111;border:1px solid #374151;border-radius:8px;color:#d1fae5;font-size:11px;font-weight:700;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;text-align:left">⚙️ Configuración de app →</button>' +
    '</div>' +

    '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#4b5563;margin-bottom:8px;">🔗 Servidores activos</div>' +
    '<div style="background:#111;border:1px solid #1f2937;border-radius:10px;padding:12px;font-size:11px;display:flex;flex-direction:column;gap:6px;">' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#4ade80">🔥</span> <span style="color:#d1fae5;font-weight:700">Firebase</span> <span style="color:#4b5563">· ' + proj + '</span> <span style="margin-left:auto;color:#4ade80;font-size:9px">● ACTIVO</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#fbbf24">☁️</span> <span style="color:#d1fae5;font-weight:700">Cloudinary</span> <span style="color:#4b5563">· ' + clN + '</span> <span style="margin-left:auto;color:#4ade80;font-size:9px">● ACTIVO</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#93c5fd">🐙</span> <span style="color:#d1fae5;font-weight:700">GitHub Pages</span> <span style="color:#4b5563">· bomberito111/pruebas</span> <span style="margin-left:auto;color:#4ade80;font-size:9px">● LIVE</span></div>' +
    '</div>' +

    '</div>';
}

// ── 👁 EN LÍNEA tab ──────────────────────────────────────────
var _devOnlineUnsub  = null;
var _devOnlineMap    = null;
var _devOnlineMarkers = {};   // sessionKey → L.Marker

// Pan + open popup on the embedded map for a session
window._devFlyTo = function(lat, lng, key) {
  if (!_devOnlineMap) return;
  _devOnlineMap.flyTo([lat, lng], 14, { duration: 1.2 });
  var m = _devOnlineMarkers[key];
  if (m) setTimeout(function(){ try { m.openPopup(); } catch(e){} }, 1300);
};

function _devMakeMarkerIcon(role, isGPS) {
  var rColor = role === 'programador' ? '#c084fc' : role === 'admin' ? '#fbbf24' : '#4ade80';
  var pulse  = isGPS ? 'animation:devPulse 2s infinite' : '';
  return L.divIcon({
    html: '<div style="position:relative;width:18px;height:18px;">' +
            '<div style="position:absolute;inset:0;border-radius:50%;background:' + rColor + '33;' + pulse + ';border-radius:50%;"></div>' +
            '<div style="position:absolute;inset:3px;border-radius:50%;background:' + rColor + ';border:2px solid #fff;box-shadow:0 0 6px ' + rColor + '88;"></div>' +
          '</div>',
    className: '', iconSize:[18,18], iconAnchor:[9,9], popupAnchor:[0,-12]
  });
}

function _devRenderOnline() {
  var treeEl   = document.getElementById('devTree');
  var statusEl = document.getElementById('devStatus');
  if (statusEl) statusEl.textContent = '👁 Monitoreando sesiones en tiempo real...';

  if (_devOnlineUnsub && typeof _devOnlineUnsub === 'function') { _devOnlineUnsub(); _devOnlineUnsub = null; }
  if (_devOnlineMap) { try { _devOnlineMap.remove(); } catch(e){} _devOnlineMap = null; }
  _devOnlineMarkers = {};

  if (!treeEl) return;

  // Inject pulse keyframe once
  if (!document.getElementById('devPulseStyle')) {
    var st = document.createElement('style');
    st.id = 'devPulseStyle';
    st.textContent = '@keyframes devPulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(2.2);opacity:0}}';
    document.head.appendChild(st);
  }

  // Layout: MAP fills 55% / list scrolls below
  treeEl.style.cssText = 'overflow:hidden;display:flex;flex-direction:column;padding:0;height:100%;';
  treeEl.innerHTML =
    '<div id="devOnlineMapWrap" style="flex:0 0 55%;min-height:220px;position:relative;background:#0a150a;">' +
      '<div id="devOnlineMap" style="height:100%;width:100%;"></div>' +
      '<div id="devOnlineMapBadge" style="position:absolute;top:10px;left:10px;z-index:1000;background:rgba(0,0,0,.7);color:#4ade80;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;font-family:\'IBM Plex Mono\',monospace;pointer-events:none;">⏳ cargando...</div>' +
    '</div>' +
    '<div id="devOnlineList" style="flex:1;overflow-y:auto;padding:10px 14px 20px;min-height:0;"></div>';

  // Init Leaflet map
  setTimeout(function() {
    var mapEl = document.getElementById('devOnlineMap');
    if (!mapEl || typeof L === 'undefined') return;
    try {
      var map = L.map('devOnlineMap', {
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true
      }).setView([-33.45, -70.65], 5); // Default: Chile
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a','b','c']
      }).addTo(map);
      _devOnlineMap = map;
    } catch(e) { console.warn('Map init:', e); }
  }, 90);

  if (typeof window._fbOnPresence !== 'function') {
    var listEl2 = document.getElementById('devOnlineList');
    if (listEl2) listEl2.innerHTML = '<div style="padding:20px;color:#f87171;font-size:12px;">⚠️ Firebase presencia no disponible</div>';
    return;
  }

  _devOnlineUnsub = window._fbOnPresence(function(snap) {
    var data = snap && snap.val ? snap.val() : null;
    var sessions = data ? Object.entries(data) : [];
    var count = sessions.length;

    // Update tab label + badge
    var tabBtn = document.getElementById('devTabOnline');
    if (tabBtn) tabBtn.textContent = '🟢 En línea (' + count + ')';
    if (statusEl) statusEl.textContent = '🟢 ' + count + ' sesión' + (count !== 1 ? 'es' : '') + ' activa' + (count !== 1 ? 's' : '');
    var badge = document.getElementById('devOnlineMapBadge');
    if (badge) badge.textContent = count > 0 ? '🟢 ' + count + ' activ' + (count === 1 ? 'o' : 'os') : '⚪ Sin sesiones';

    var listEl = document.getElementById('devOnlineList');
    if (!listEl) return;

    // ── UPDATE MAP MARKERS ─────────────────────────
    if (_devOnlineMap && typeof L !== 'undefined') {
      var currentKeys = sessions.map(function(e){ return e[0]; });
      var bounds = [];

      // Remove markers for gone sessions
      Object.keys(_devOnlineMarkers).forEach(function(k) {
        if (currentKeys.indexOf(k) === -1) {
          try { _devOnlineMap.removeLayer(_devOnlineMarkers[k]); } catch(e){}
          delete _devOnlineMarkers[k];
        }
      });

      // Add or update markers
      sessions.forEach(function(entry) {
        var key = entry[0], s = entry[1];
        if (!s.gps || !s.gps.lat || !s.gps.lng) return;
        var lat = Number(s.gps.lat), lng = Number(s.gps.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        var role  = s.role || 'usuario';
        var user  = s.username || s.nombre || s.email || 'Anónimo';
        var isGPS = s.gps.source !== 'ip';
        var city  = s.gps.city ? s.gps.city + (s.gps.country ? ', ' + s.gps.country : '') : '';
        var acc   = s.gps.acc  ? '±' + Math.round(s.gps.acc) + 'm' : '';
        var src   = isGPS ? '📍 GPS exacto' : '📡 Aprox. por IP';
        var ago   = s.ts ? Math.round((Date.now() - s.ts) / 60000) + ' min atrás' : '';
        var rColor = role === 'programador' ? '#c084fc' : role === 'admin' ? '#fbbf24' : '#4ade80';

        var popupHtml =
          '<div style="font-family:\'IBM Plex Sans\',sans-serif;min-width:160px;">' +
            '<div style="font-size:13px;font-weight:800;margin-bottom:4px;">' + _escDev(user) + '</div>' +
            '<div style="font-size:10px;font-weight:700;color:' + rColor + ';text-transform:uppercase;margin-bottom:6px;">' + _escDev(role) + '</div>' +
            '<div style="font-size:10px;color:#374151;margin-bottom:2px;">' + src + (acc ? ' ' + acc : '') + '</div>' +
            (city ? '<div style="font-size:10px;color:#374151;margin-bottom:2px;">📌 ' + _escDev(city) + '</div>' : '') +
            '<div style="font-size:10px;color:#6b7280;font-family:\'IBM Plex Mono\',monospace;">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>' +
            (ago ? '<div style="font-size:9px;color:#9ca3af;margin-top:3px;">Hace ' + ago + '</div>' : '') +
          '</div>';

        if (_devOnlineMarkers[key]) {
          // Update existing marker position + popup
          try {
            _devOnlineMarkers[key].setLatLng([lat, lng]);
            _devOnlineMarkers[key].setIcon(_devMakeMarkerIcon(role, isGPS));
            _devOnlineMarkers[key].bindPopup(popupHtml);
          } catch(e) {}
        } else {
          // Create new marker
          try {
            var marker = L.marker([lat, lng], { icon: _devMakeMarkerIcon(role, isGPS) })
              .bindPopup(popupHtml)
              .addTo(_devOnlineMap);
            _devOnlineMarkers[key] = marker;
          } catch(e) {}
        }
        bounds.push([lat, lng]);
      });

      // Fit map to all markers (only on first load when no markers existed)
      if (bounds.length > 0 && Object.keys(_devOnlineMarkers).length === bounds.length) {
        try {
          if (bounds.length === 1) {
            _devOnlineMap.setView(bounds[0], 12);
          } else {
            _devOnlineMap.fitBounds(bounds, { padding:[40,40], maxZoom:12 });
          }
        } catch(e){}
      }
    }

    // ── RENDER SESSION LIST ────────────────────────
    if (count === 0) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#374151;font-size:12px;">Sin usuarios conectados ahora mismo</div>';
      return;
    }

    var now = Date.now();
    listEl.innerHTML = sessions
      .sort(function(a,b){ return (b[1].ts||0) - (a[1].ts||0); })
      .map(function(entry) {
        var key = entry[0], s = entry[1];
        var ago  = Math.round((now - (s.ts||now)) / 1000);
        var agoStr = ago < 60 ? ago + 's' : ago < 3600 ? Math.round(ago/60) + 'min' : Math.round(ago/3600) + 'h';
        var role   = s.role || 'usuario';
        var user   = s.username || s.nombre || s.email || '(anónimo)';
        var rColor = role === 'programador' ? '#c084fc' : role === 'admin' ? '#fbbf24' : '#4ade80';
        var ua     = s.ua || '';
        var isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
        var screenStr = s.screen ? s.screen : '';

        var gpsBlock = '';
        if (s.gps && s.gps.lat && s.gps.lng) {
          var lat = Number(s.gps.lat), lng = Number(s.gps.lng);
          var isGPS  = s.gps.source !== 'ip';
          var srcLbl = isGPS ? '📍 GPS exacto' : '📡 Aprox. por IP';
          var city   = s.gps.city ? s.gps.city + (s.gps.country ? ', ' + s.gps.country : '') : '';
          var acc    = s.gps.acc  ? '±' + Math.round(s.gps.acc) + 'm' : '';
          gpsBlock =
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;">' +
              '<button onclick="window._devFlyTo(' + lat + ',' + lng + ',\'' + key + '\')" ' +
                'style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#071207;border:1px solid #16a34a;border-radius:6px;color:#4ade80;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer;font-weight:700;">' +
                '🗺️ ' + lat.toFixed(4) + ', ' + lng.toFixed(4) +
              '</button>' +
              '<span style="font-size:9px;color:#4ade8066;">' + srcLbl + (acc ? ' ' + acc : '') + '</span>' +
              (city ? '<span style="font-size:9px;color:#4b5563;">📌 ' + _escDev(city) + '</span>' : '') +
            '</div>';
        } else {
          gpsBlock = '<div style="font-size:9px;color:#374151;margin-top:6px;">📍 Sin ubicación disponible</div>';
        }

        return '<div style="background:#0d1f0d;border:1px solid #1a2e1a;border-radius:10px;margin-bottom:8px;overflow:hidden;">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;' +
              'box-shadow:0 0 0 3px rgba(34,197,94,.25);animation:devPulse 2.5s ease-in-out infinite;"></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<span style="font-size:12px;font-weight:700;color:#d1fae5;">' + _escDev(user) + '</span>' +
              '<span style="font-size:9px;color:#4b5563;margin-left:8px;">hace ' + agoStr + '</span>' +
            '</div>' +
            '<span style="font-size:9px;font-weight:800;color:' + rColor + ';border:1px solid ' + rColor + '44;padding:2px 7px;border-radius:4px;text-transform:uppercase;">' + _escDev(role) + '</span>' +
          '</div>' +
          '<div style="padding:4px 12px 10px;border-top:1px solid #1a2e1a;">' +
            gpsBlock +
            (ua ? '<div style="font-size:9px;color:#2d3748;margin-top:5px;word-break:break-all;">' +
              (isMobile ? '📱 ' : '💻 ') + _escDev(ua.slice(0,80)) + (screenStr ? ' · ' + screenStr : '') +
            '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('');
  });
}

function _devReadPath(fbPath) {
  // Try to serve from cached window globals first for speed
  var norm = fbPath.replace(/^\//, '').replace(/\/$/, '');
  if (!norm || norm === '') {
    // Root — combine what we have
    return Promise.resolve({
      evaluaciones: window._fbRawAll || window._dbAll || {},
      clientes: window._clientesAll || {},
      archivos: null,
      usuarios: null
    });
  }
  // Use Firebase _fbOnValue-style one-shot read
  return new Promise(function (resolve, reject) {
    if (typeof window._fbReadPath === 'function') {
      window._fbReadPath(norm, function (snap) {
        resolve(snap && snap.val ? snap.val() : null);
      });
    } else {
      // Fallback to cached data
      var parts = norm.split('/');
      var top = parts[0];
      var rest = parts.slice(1).join('/');
      var source = null;
      if (top === 'evaluaciones') source = window._fbRawAll || window._dbAll || {};
      else if (top === 'clientes') source = window._clientesAll || {};
      else source = null;
      if (source && rest) {
        var keys = rest.split('/');
        var cur = source;
        for (var k of keys) { cur = cur && cur[k]; }
        resolve(cur !== undefined ? cur : null);
      } else {
        resolve(source);
      }
    }
  });
}

function _devRenderTree() {
  var treeEl = document.getElementById('devTree');
  if (!treeEl) return;
  treeEl.innerHTML = _devBuildNodeHTML(_devData, '', 0);
}

function _devBuildNodeHTML(obj, nodePath, depth) {
  if (obj === null || obj === undefined) {
    return '<span class="dev-null">null</span>';
  }
  if (typeof obj !== 'object') {
    var cls = typeof obj === 'string' ? 'dev-str' : typeof obj === 'number' ? 'dev-num' : 'dev-bool';
    var display = typeof obj === 'string' ? '"' + _escDev(String(obj).substring(0, 120)) + (String(obj).length > 120 ? '…' : '') + '"' : String(obj);
    return '<span class="' + cls + ' dev-node" onclick="devSelectNode(' + JSON.stringify(nodePath) + ')" title="' + _escDev(nodePath) + '">' + display + '</span>';
  }

  var keys = Object.keys(obj);
  if (keys.length === 0) return '<span style="color:#4b5563">{}</span>';

  var isExpanded = _devExpanded[nodePath] !== false && (depth < 2 || _devExpanded[nodePath] === true);
  var toggleFn = 'devToggleNode(' + JSON.stringify(nodePath) + ')';

  var html = '<span class="dev-node" onclick="' + toggleFn + '" style="color:#4b5563;font-size:10px">' +
    (isExpanded ? '▾ ' : '▸ ') + '{' + keys.length + '}</span>';

  if (!isExpanded) return html;

  html += '<div style="padding-left:16px;border-left:1px solid #1f2937;margin-left:4px">';
  keys.forEach(function (k) {
    var childPath = nodePath ? nodePath + '.' + k : k;
    var isSelected = (_devSelPath === childPath);
    html += '<div class="dev-node' + (isSelected ? '" style="background:rgba(74,222,128,.15);border-radius:4px' : '') + '">';
    html += '<span class="dev-key" onclick="devSelectNode(' + JSON.stringify(childPath) + ')" style="cursor:pointer">"' + _escDev(k) + '"</span>';
    html += '<span style="color:#4b5563">: </span>';
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      html += _devBuildNodeHTML(obj[k], childPath, depth + 1);
    } else {
      var cls = typeof obj[k] === 'string' ? 'dev-str' : typeof obj[k] === 'number' ? 'dev-num' : 'dev-bool';
      var val = typeof obj[k] === 'string' ? '"' + _escDev(String(obj[k]).substring(0,80)) + (String(obj[k]).length>80?'…':'') + '"' : String(obj[k]);
      html += '<span class="' + cls + ' dev-node" onclick="devSelectNode(' + JSON.stringify(childPath) + ')">' + val + '</span>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

window.devToggleNode = function (nodePath) {
  _devExpanded[nodePath] = !(_devExpanded[nodePath] !== false);
  _devRenderTree();
};

window.devExpandAll = function () {
  if (!_devData) return;
  function markExpanded(obj, path) {
    if (typeof obj !== 'object' || !obj) return;
    _devExpanded[path] = true;
    Object.keys(obj).forEach(function (k) { markExpanded(obj[k], path ? path + '.' + k : k); });
  }
  markExpanded(_devData, '');
  _devRenderTree();
};

window.devCollapseAll = function () {
  _devExpanded = {};
  _devRenderTree();
};

window.devSelectNode = function (nodePath) {
  _devSelPath = nodePath;
  var pathEl = document.getElementById('devEditorPath');
  var valEl  = document.getElementById('devEditorValue');
  if (pathEl) pathEl.textContent = (_devPath + '/' + nodePath.replace(/\./g, '/')).replace('//', '/');

  var val = _devGetAtPath(_devData, nodePath);
  if (valEl) {
    valEl.value = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val !== null && val !== undefined ? val : '');
  }
  _devRenderTree();
};

function _devGetAtPath(obj, dotPath) {
  if (!dotPath) return obj;
  var parts = dotPath.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function _devFirebasePath(dotPath) {
  // Convert dotted path relative to the loaded path into a full Firebase path
  var base = _devPath.replace(/^\//, '').replace(/\/$/, '');
  var rel  = (dotPath || '').replace(/\./g, '/');
  return base + (rel ? '/' + rel : '');
}

window.devSaveEdit = async function () {
  if (_devSelPath === null) { window.showNotif('Selecciona un nodo primero'); return; }
  var valEl = document.getElementById('devEditorValue');
  var rawVal = valEl ? valEl.value.trim() : '';
  var parsed;
  try { parsed = JSON.parse(rawVal); } catch (e) { parsed = rawVal; }

  var fbPath = _devFirebasePath(_devSelPath);
  try {
    await _devWritePath(fbPath, parsed);
    // Update local data tree
    _devSetAtPath(_devData, _devSelPath, parsed);
    window.showNotif('✅ Guardado en /' + fbPath);
    _devRenderTree();
  } catch (e) {
    window.showNotif('❌ Error: ' + e.message);
  }
};

window.devDeleteNode = async function () {
  if (_devSelPath === null) { window.showNotif('Selecciona un nodo primero'); return; }
  var fbPath = _devFirebasePath(_devSelPath);
  if (!confirm('¿Borrar /' + fbPath + '? Esta acción es irreversible.')) return;
  try {
    await _devDeletePath(fbPath);
    // Remove from local tree
    var parts = _devSelPath.split('.');
    var key = parts.pop();
    var parent = _devGetAtPath(_devData, parts.join('.'));
    if (parent && typeof parent === 'object') delete parent[key];
    _devSelPath = null;
    document.getElementById('devEditorPath').textContent = 'Selecciona un nodo del árbol';
    document.getElementById('devEditorValue').value = '';
    window.showNotif('✅ Borrado: /' + fbPath);
    _devRenderTree();
  } catch (e) {
    window.showNotif('❌ Error: ' + e.message);
  }
};

window.devAddField = async function () {
  var keyEl = document.getElementById('devNewKey');
  var valEl = document.getElementById('devNewValue');
  var key   = keyEl ? keyEl.value.trim() : '';
  var rawVal = valEl ? valEl.value.trim() : '';
  if (!key) { window.showNotif('Escribe una clave'); return; }

  var parsed;
  try { parsed = JSON.parse(rawVal); } catch (e) { parsed = rawVal; }

  var basePath = _devSelPath ? _devFirebasePath(_devSelPath) : _devPath.replace(/^\//, '').replace(/\/$/, '');
  var fbPath = basePath + '/' + key;
  try {
    await _devWritePath(fbPath, parsed);
    // Update local tree
    var target = _devSelPath ? _devGetAtPath(_devData, _devSelPath) : _devData;
    if (target && typeof target === 'object') target[key] = parsed;
    else if (!_devSelPath && _devData && typeof _devData === 'object') _devData[key] = parsed;
    if (keyEl) keyEl.value = '';
    if (valEl) valEl.value = '';
    window.showNotif('✅ Campo añadido: /' + fbPath);
    _devRenderTree();
  } catch (e) {
    window.showNotif('❌ Error: ' + e.message);
  }
};

window.devExportRaw = function () {
  if (!_devData) { window.showNotif('Sin datos cargados'); return; }
  var blob = new Blob([JSON.stringify(_devData, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'firebase-' + _devPath.replace(/\//g,'-').replace(/^-/,'') + '-' + Date.now() + '.json';
  a.click();
};

function _devSetAtPath(obj, dotPath, val) {
  if (!dotPath) return;
  var parts = dotPath.split('.');
  var key = parts.pop();
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return;
    cur = cur[parts[i]];
  }
  if (cur && typeof cur === 'object') cur[key] = val;
}

function _devWritePath(fbPath, value) {
  if (typeof window._fbSetPath === 'function') return window._fbSetPath(fbPath, value);
  return Promise.reject(new Error('_fbSetPath no disponible — añadir a index.html'));
}

function _devDeletePath(fbPath) {
  if (typeof window._fbDeletePath === 'function') return window._fbDeletePath(fbPath);
  return Promise.reject(new Error('_fbDeletePath no disponible — añadir a index.html'));
}

function _escDev(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────── */

function escH(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function smallBtnStyle(bg, border, color) {
  return 'padding:4px 10px;background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;color:' + color;
}

function inputStyle() {
  return 'width:100%;padding:11px 13px;border:1.5px solid #e5e0d8;border-radius:10px;font-family:\'IBM Plex Sans\',sans-serif;font-size:13px;margin-bottom:8px;background:#fff;display:block;box-sizing:border-box';
}
