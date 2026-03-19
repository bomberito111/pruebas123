/* ═══════════════════════════════════════════
   state.js — Global application state
   Bosques Urbanos — forestry engineering app

   Simple pub/sub event bus + shared state
   containers. Loaded as a plain <script> tag —
   all exports live on window globals.
═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ══════════════════════════════════════════
  // FIREBASE MIRROR CACHES
  // ══════════════════════════════════════════

  /** All evaluation records keyed by Firebase push key. */
  window._dbAll = {};

  /** All client records keyed by Firebase push key. */
  window._clientesAll = {};

  /**
   * Client documents stored in the current browser session only.
   * Structure: { [clienteName]: [{ url, name, type, ts }, …] }
   */
  window._clientDocs = {};

  // ══════════════════════════════════════════
  // ACTIVE APPLICATION STATE
  // ══════════════════════════════════════════

  window.APP = {
    /** Currently selected client name (string | null). */
    activeClient: null,

    /** Currently active engineer / evaluator name (string | null). */
    activeEngineer: null,

    /** Risk filter applied to the home panel. Empty string = show all. */
    homeRiskFilter: '',

    /** Risk filter applied to the records (DB) view. Empty string = show all. */
    dbRiskFilter: '',

    /**
     * Navigation level inside the records view:
     *   1 = client list
     *   2 = trees for a client
     *   3 = detail for a specific tree
     */
    dbLevel: 1,

    /** Client name currently open at level 2 of records. */
    dbClient: null,

    /** Tree arbolId currently open at level 3 of records. */
    dbTreeId: null,

    /** Snapshot of an existing evaluation used as base for re-evaluation. */
    dbRevalBase: null,

    /** Set of Firebase keys selected for PDF batch export. */
    selectedTrees: new Set(),

    /** Array of evaluation entries currently visible after filtering. */
    currentFiltered: [],

    /** Firebase key of the evaluation open in the detail modal. */
    detailKey: null,

    /** Firebase key of the evaluation for which a photo is being added. */
    homePhotoKey: null,

    /** Client name whose documents modal is currently open. */
    docsClient: null,
  };

  // ══════════════════════════════════════════
  // SIMPLE EVENT BUS
  // ══════════════════════════════════════════

  /** @type {{ [event: string]: Function[] }} */
  window._listeners = {};

  /**
   * Register a callback for a named event.
   * Returns an unsubscribe function for convenience.
   *
   * @param {string}   event
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  window.on = function (event, callback) {
    if (typeof callback !== 'function') {
      console.warn('on(): callback must be a function (event: ' + event + ')');
      return function () {};
    }
    if (!window._listeners[event]) window._listeners[event] = [];
    window._listeners[event].push(callback);

    // Return unsubscribe handle
    return function () {
      var list = window._listeners[event];
      if (!list) return;
      var idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  };

  /**
   * Emit a named event, calling all registered listeners with `data`.
   * Errors thrown inside listeners are caught and logged so that one
   * bad listener cannot break the rest.
   *
   * @param {string} event
   * @param {*}      [data]
   */
  window.emit = function (event, data) {
    var list = window._listeners[event];
    if (!list || list.length === 0) return;
    // Iterate over a snapshot so mid-emit unsubscribes are safe
    list.slice().forEach(function (cb) {
      try {
        cb(data);
      } catch (e) {
        console.error('[EventBus] Error in listener for "' + event + '":', e);
      }
    });
  };

  /**
   * Remove all listeners for a specific event, or every listener if no
   * event is provided. Useful in unit tests or full page resets.
   *
   * @param {string} [event]
   */
  window.offAll = function (event) {
    if (event) {
      window._listeners[event] = [];
    } else {
      window._listeners = {};
    }
  };

  // ══════════════════════════════════════════
  // STATE HELPERS — DISPLAY
  // ══════════════════════════════════════════

  /**
   * Extract a display-ready client name from an evaluation record.
   * Handles both flat and nested (answers-wrapped) structures.
   *
   * @param {Object} evalData
   * @returns {string}
   */
  window.getClientName = function (evalData) {
    if (!evalData) return '(Sin cliente)';
    return evalData.cliente ||
           (evalData.answers && evalData.answers.cliente) ||
           '(Sin cliente)';
  };

  /**
   * Return the hex colour for a risk level key.
   * Falls back to neutral grey when the key is unknown.
   *
   * @param {string} lvl — 'bajo' | 'moderado' | 'alto' | 'extremo'
   * @returns {string}
   */
  window.getRiskColor = function (lvl) {
    return (window.RISK_COLORS && window.RISK_COLORS[lvl]) || '#6b7280';
  };

  /**
   * Return the title-case risk label.
   * @param {string} lvl
   * @returns {string}
   */
  window.getRiskLabel = function (lvl) {
    return (window.RISK_LABELS && window.RISK_LABELS[lvl]) || '—';
  };

  /**
   * Return the upper-case risk label.
   * @param {string} lvl
   * @returns {string}
   */
  window.getRiskLabelUpper = function (lvl) {
    return (window.RISK_LABELS_UP && window.RISK_LABELS_UP[lvl]) || '—';
  };

  /**
   * Return the CSS class for a risk type-pill element.
   * @param {string} lvl
   * @returns {string}
   */
  window.getRiskTpClass = function (lvl) {
    return 'tp-' + (lvl || 'bajo');
  };

  /**
   * Return the CSS class for a risk dot/badge element.
   * @param {string} lvl
   * @returns {string}
   */
  window.getRiskDotClass = function (lvl) {
    return 'trd-' + (lvl || 'bajo');
  };

  /**
   * Resolve the effective risk level for an evaluation, honouring
   * any active manual override set by the engineer.
   *
   * @param {Object} evalData
   * @returns {string} — 'bajo' | 'moderado' | 'alto' | 'extremo'
   */
  window.getEffectiveRisk = function (evalData) {
    if (!evalData) return 'bajo';
    if (evalData.riskOverride &&
        evalData.riskOverride.active &&
        evalData.riskOverride.level) {
      return evalData.riskOverride.level;
    }
    return evalData.isaLevel || 'bajo';
  };

  // ══════════════════════════════════════════
  // ENGINEER PERSISTENCE (localStorage)
  // ══════════════════════════════════════════

  var ENGINEER_KEY = 'bu_engineer';

  /**
   * Restore the previously saved engineer name from localStorage into APP.
   * Call once on app startup.
   */
  window.loadEngineer = function () {
    try {
      var saved = localStorage.getItem(ENGINEER_KEY);
      if (saved && saved.trim()) {
        window.APP.activeEngineer = saved.trim();
      }
    } catch (e) {
      // localStorage unavailable (private mode / storage blocked)
      console.warn('loadEngineer: localStorage no disponible', e);
    }
  };

  /**
   * Persist the engineer name, update APP state and notify listeners.
   * @param {string} name
   */
  window.saveEngineer = function (name) {
    var clean = (name || '').trim();
    window.APP.activeEngineer = clean;
    try {
      if (clean) {
        localStorage.setItem(ENGINEER_KEY, clean);
      } else {
        localStorage.removeItem(ENGINEER_KEY);
      }
    } catch (e) {
      console.warn('saveEngineer: localStorage no disponible', e);
    }
    window.emit('engineer:changed', clean);
  };

  // ══════════════════════════════════════════
  // SELECTION HELPERS (batch PDF export)
  // ══════════════════════════════════════════

  /**
   * Toggle a tree key in the selectedTrees Set and emit a change event.
   * @param {string} key
   */
  window.toggleTreeSelection = function (key) {
    if (window.APP.selectedTrees.has(key)) {
      window.APP.selectedTrees.delete(key);
    } else {
      window.APP.selectedTrees.add(key);
    }
    window.emit('selection:changed', Array.from(window.APP.selectedTrees));
  };

  /**
   * Clear all selected trees and emit a change event.
   */
  window.clearTreeSelection = function () {
    window.APP.selectedTrees.clear();
    window.emit('selection:changed', []);
  };

  /**
   * Replace the selection with every key in the provided array.
   * @param {string[]} keys
   */
  window.selectAllTrees = function (keys) {
    window.APP.selectedTrees = new Set(keys || []);
    window.emit('selection:changed', Array.from(window.APP.selectedTrees));
  };

  // ══════════════════════════════════════════
  // FILTER HELPERS
  // ══════════════════════════════════════════

  /**
   * Apply a risk filter to an array of [key, evalData] pairs.
   * Pass an empty string or null to return all entries.
   *
   * @param {Array<[string, Object]>} entries
   * @param {string} riskFilter — 'bajo' | 'moderado' | 'alto' | 'extremo' | ''
   * @returns {Array<[string, Object]>}
   */
  window.applyRiskFilter = function (entries, riskFilter) {
    if (!riskFilter) return entries;
    return entries.filter(function (pair) {
      return window.getEffectiveRisk(pair[1]) === riskFilter;
    });
  };

  // ══════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════

  // Automatically restore the engineer name when this script loads.
  window.loadEngineer();

}());
