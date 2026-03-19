/* ═══════════════════════════════════════════
   firebase.js — Firebase DB + Storage wrapper
   Bosques Urbanos — forestry engineering app

   Assumes window._db and window._storage are
   already set by the inline <script type="module">
   block in index.html, which also wires up:
     window._fbPush, window._fbOnValue, window._fbRemove
     window._fbPushCliente, window._fbOnClientes, window._fbRemoveCliente
     window._fbUpdateEval
     window._fbUploadPhoto, window._fbUploadDoc
═══════════════════════════════════════════ */

window.FB = (function () {
  'use strict';

  // ─────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────

  function requireFn(name) {
    if (typeof window[name] !== 'function') {
      return Promise.reject(new Error('Firebase no listo: ' + name + ' no está definido'));
    }
    return null;
  }

  /**
   * Read a file as a base64 data-URL.
   * @param {File} file
   * @param {number} maxBytes
   * @returns {Promise<string>}
   */
  function readAsDataURL(file, maxBytes) {
    return new Promise(function (resolve, reject) {
      if (file.size > maxBytes) {
        reject(new Error('Archivo muy grande (máx ' + Math.round(maxBytes / 1024 / 1024) + 'MB)'));
        return;
      }
      var reader = new FileReader();
      reader.onload  = function (e) { resolve(e.target.result); };
      reader.onerror = function ()  { reject(new Error('Error leyendo archivo')); };
      reader.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────
  return {

    // ══════════════════════════════════════
    // EVALUACIONES
    // ══════════════════════════════════════

    /**
     * Push a new evaluation record to Firebase Realtime DB.
     * @param {Object} data — evaluation payload
     * @returns {Promise<string>} — the new Firebase key
     */
    pushEval: function (data) {
      var err = requireFn('_fbPush');
      if (err) return err;
      return window._fbPush(data);
    },

    /**
     * Subscribe to all evaluations.
     * Calls callback(snapshot) whenever data changes.
     * @param {Function} callback
     */
    onEvals: function (callback) {
      if (typeof window._fbOnValue !== 'function') {
        console.warn('FB.onEvals: _fbOnValue no está disponible');
        return;
      }
      window._fbOnValue(callback);
    },

    /**
     * Remove an evaluation by its Firebase key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    removeEval: function (key) {
      if (!key) return Promise.reject(new Error('removeEval: key requerido'));
      var err = requireFn('_fbRemove');
      if (err) return err;
      return window._fbRemove(key);
    },

    /**
     * Update arbitrary fields on an existing evaluation.
     * @param {string} key
     * @param {Object} updates — partial object to merge
     * @returns {Promise<void>}
     */
    updateEval: function (key, updates) {
      if (!key) return Promise.reject(new Error('updateEval: key requerido'));
      var err = requireFn('_fbUpdateEval');
      if (err) return err;
      return window._fbUpdateEval(key, updates);
    },

    // ══════════════════════════════════════
    // CLIENTES
    // ══════════════════════════════════════

    /**
     * Push a new client record.
     * @param {Object} data — client payload
     * @returns {Promise<string>} — the new Firebase key
     */
    pushCliente: function (data) {
      var err = requireFn('_fbPushCliente');
      if (err) return err;
      return window._fbPushCliente(data);
    },

    updateCliente: function (key, updates) {
      if (!key) return Promise.reject(new Error('updateCliente: key requerido'));
      if (typeof window._fbUpdateCliente === 'function') {
        return window._fbUpdateCliente(key, updates);
      }
      // Local-only fallback
      if (window._clientesAll && window._clientesAll[key]) {
        Object.assign(window._clientesAll[key], updates);
      }
      return Promise.resolve();
    },

    /**
     * Subscribe to all clients.
     * @param {Function} callback
     */
    onClientes: function (callback) {
      if (typeof window._fbOnClientes !== 'function') {
        console.warn('FB.onClientes: _fbOnClientes no está disponible');
        return;
      }
      window._fbOnClientes(callback);
    },

    /**
     * Remove a client by Firebase key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    removeCliente: function (key) {
      if (!key) return Promise.reject(new Error('removeCliente: key requerido'));
      var err = requireFn('_fbRemoveCliente');
      if (err) return err;
      return window._fbRemoveCliente(key);
    },

    // ══════════════════════════════════════
    // NOTAS Y OVERRIDE DE RIESGO
    // ══════════════════════════════════════

    /**
     * Save a text note on an evaluation.
     * @param {string} evalKey
     * @param {string} note
     * @returns {Promise<void>}
     */
    saveNote: function (evalKey, note) {
      if (!evalKey) return Promise.reject(new Error('saveNote: evalKey requerido'));
      var err = requireFn('_fbUpdateEval');
      if (err) return err;
      return window._fbUpdateEval(evalKey, { notes: note });
    },

    /**
     * Save a manual risk override on an evaluation.
     * When active, also syncs isaLevel so the map badge reflects the override.
     * @param {string} evalKey
     * @param {{ active: boolean, level: string, reason?: string }} overrideData
     * @returns {Promise<void>}
     */
    saveOverride: function (evalKey, overrideData) {
      if (!evalKey) return Promise.reject(new Error('saveOverride: evalKey requerido'));
      var err = requireFn('_fbUpdateEval');
      if (err) return err;
      var updates = { riskOverride: overrideData };
      if (overrideData && overrideData.active && overrideData.level) {
        updates.isaLevel = overrideData.level;
      }
      return window._fbUpdateEval(evalKey, updates);
    },

    // ══════════════════════════════════════
    // CLOUDINARY — Almacenamiento gratuito (25 GB)
    // ══════════════════════════════════════

    /**
     * Upload a file directly to Cloudinary (free tier: 25 GB storage + 25 GB bandwidth/month).
     * Requires window.CLOUDINARY_CLOUD_NAME and window.CLOUDINARY_UPLOAD_PRESET to be set.
     * @param {File}   file
     * @param {string} folder — e.g. 'fotos/codegua' or 'docs/codegua'
     * @returns {Promise<{ url: string, name: string, ts: number, type: 'cloudinary' }>}
     */
    uploadToCloudinary: function (file, folder) {
      var cloudName = window.CLOUDINARY_CLOUD_NAME;
      var preset    = window.CLOUDINARY_UPLOAD_PRESET;
      if (!cloudName || !preset) {
        return Promise.reject(new Error('Cloudinary no configurado (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET)'));
      }
      var formData = new FormData();
      formData.append('file',           file);
      formData.append('upload_preset',  preset);
      formData.append('folder',         folder || 'bosques-urbanos');
      return fetch(
        'https://api.cloudinary.com/v1_1/' + cloudName + '/auto/upload',
        { method: 'POST', body: formData }
      ).then(function (res) {
        if (!res.ok) throw new Error('Cloudinary error ' + res.status);
        return res.json();
      }).then(function (data) {
        if (data.error) throw new Error(data.error.message);
        return { url: data.secure_url, name: file.name, ts: Date.now(), type: 'cloudinary', public_id: data.public_id };
      });
    },

    // ══════════════════════════════════════
    // STORAGE — FOTOS
    // ══════════════════════════════════════

    /**
     * Upload a photo. Tries Cloudinary first (free 25 GB), falls back to
     * Firebase Storage, then to base64 inline.
     * @param {string} clienteId
     * @param {string} arbolId
     * @param {File}   file
     * @returns {Promise<{ url: string, type: string }>}
     */
    uploadPhoto: function (clienteId, arbolId, file) {
      var self = this;
      var folder = 'fotos/' + (clienteId || 'sin_cliente') + '/' + (arbolId || 'sin_arbol');
      // Try Cloudinary first if configured
      if (window.CLOUDINARY_CLOUD_NAME && window.CLOUDINARY_UPLOAD_PRESET) {
        return self.uploadToCloudinary(file, folder).catch(function (e) {
          console.warn('Cloudinary failed, falling back to Firebase:', e.message);
          return self._uploadPhotoFirebase(clienteId, arbolId, file);
        });
      }
      return self._uploadPhotoFirebase(clienteId, arbolId, file);
    },

    _uploadPhotoFirebase: function (clienteId, arbolId, file) {
      if (typeof window._fbUploadPhoto !== 'function') {
        return readAsDataURL(file, 3 * 1024 * 1024)
          .then(function (dataUrl) { return { url: dataUrl, type: 'base64' }; });
      }
      return window._fbUploadPhoto(clienteId, arbolId, file);
    },

    /**
     * Append a photo URL to an evaluation's photoUrls array.
     * @param {string} evalKey
     * @param {string} photoUrl
     * @returns {Promise<void>}
     */
    addPhotoToEval: function (evalKey, photoUrl) {
      if (!evalKey) return Promise.reject(new Error('addPhotoToEval: evalKey requerido'));
      var evalData = (window._dbAll || {})[evalKey] || {};
      var photos   = (evalData.photoUrls || evalData.photos || []).slice();
      photos.push(photoUrl);

      if (typeof window._fbUpdateEval === 'function') {
        return window._fbUpdateEval(evalKey, { photoUrls: photos });
      }
      // Local-only fallback (offline / no Firebase)
      evalData.photoUrls = photos;
      if (window._dbAll) window._dbAll[evalKey] = evalData;
      return Promise.resolve();
    },

    /**
     * Delete a photo by index from an evaluation's photoUrls array.
     * @param {string} evalKey
     * @param {number} idx
     * @returns {Promise<void>}
     */
    deletePhoto: function (evalKey, idx) {
      if (!evalKey) return Promise.reject(new Error('deletePhoto: evalKey requerido'));
      var evalData = (window._dbAll || {})[evalKey] || {};
      var photos   = (evalData.photoUrls || evalData.photos || []).slice();
      if (idx < 0 || idx >= photos.length) {
        return Promise.reject(new Error('deletePhoto: índice fuera de rango'));
      }
      photos.splice(idx, 1);

      if (typeof window._fbUpdateEval === 'function') {
        return window._fbUpdateEval(evalKey, { photoUrls: photos });
      }
      evalData.photoUrls = photos;
      if (window._dbAll) window._dbAll[evalKey] = evalData;
      return Promise.resolve();
    },

    // ══════════════════════════════════════
    // STORAGE — DOCUMENTOS
    // ══════════════════════════════════════

    /**
     * Upload a document. Tries Cloudinary first (free 25 GB), falls back to
     * Firebase Storage, then to base64 inline.
     * @param {string} clienteId
     * @param {File}   file
     * @returns {Promise<{ url: string, name: string, type: string, ts: number }>}
     */
    uploadDoc: function (clienteId, file) {
      var self = this;
      var folder = 'docs/' + (clienteId || 'sin_cliente');
      if (window.CLOUDINARY_CLOUD_NAME && window.CLOUDINARY_UPLOAD_PRESET) {
        return self.uploadToCloudinary(file, folder).catch(function (e) {
          console.warn('Cloudinary failed, falling back to Firebase:', e.message);
          return self._uploadDocFirebase(clienteId, file);
        });
      }
      return self._uploadDocFirebase(clienteId, file);
    },

    _uploadDocFirebase: function (clienteId, file) {
      if (typeof window._fbUploadDoc !== 'function') {
        return readAsDataURL(file, 5 * 1024 * 1024)
          .then(function (dataUrl) { return { url: dataUrl, name: file.name, type: 'base64', ts: Date.now() }; });
      }
      return window._fbUploadDoc(clienteId, file);
    },

    // ══════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════

    /**
     * Return the photos array for an evaluation, supporting both legacy
     * base64 `photos` field and the current `photoUrls` field.
     * @param {Object} evalData
     * @returns {string[]}
     */
    getPhotoUrls: function (evalData) {
      if (!evalData) return [];
      return evalData.photoUrls || evalData.photos || [];
    },

    /**
     * Returns true if the Firebase layer is fully initialised.
     * Useful for feature-gating UI elements before Firebase resolves.
     * @returns {boolean}
     */
    isReady: function () {
      return (
        typeof window._fbPush       === 'function' &&
        typeof window._fbOnValue    === 'function' &&
        typeof window._fbUpdateEval === 'function'
      );
    }

  }; // end return
}());
