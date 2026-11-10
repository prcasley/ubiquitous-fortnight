(function (global) {
  'use strict';

  const STORAGE_KEY = 'radar_ui_mode';
  const SIMPLE_DEFAULT_PX = 19;
  const ADVANCED_DEFAULT_PX = 17;

  function getInitialMode() {
    try {
      const urlParams = new URLSearchParams(global.location?.search || '');
      const qMode = urlParams.get('mode');
      if (qMode === 'simple' || qMode === 'advanced') return qMode;
      const saved = global.localStorage?.getItem(STORAGE_KEY);
      if (saved === 'simple' || saved === 'advanced') return saved;
    } catch (_e) {
      // Ignore storage access errors
    }
    return 'simple';
  }

  function applyMode(mode, options = {}) {
    const cleanMode = mode === 'advanced' ? 'advanced' : 'simple';
    const doc = global.document;
    if (!doc || !doc.body) return cleanMode;

    doc.body.dataset.radarMode = cleanMode;
    doc.documentElement.dataset.radarMode = cleanMode;

    try {
      global.localStorage?.setItem(STORAGE_KEY, cleanMode);
    } catch (_e) {
      // Ignore storage errors
    }

    // If switching to Simple Mode, ensure Tab 1 (Scan & Results) is active so cards & search are visible
    if (cleanMode === 'simple') {
      const scanTab = doc.querySelector('#workspace-tab-scan');
      if (scanTab && scanTab.getAttribute('aria-selected') !== 'true' && typeof scanTab.click === 'function') {
        scanTab.click();
      }
    }

    // Readable default: Simple Mode is at least 19px; a larger size chosen with A+ is kept.
    if (options.adjustFont !== false && doc.documentElement) {
      let saved = 0;
      try { saved = Number(global.localStorage?.getItem('capital-radar-font-size')) || 0; } catch (_e) {}
      const targetPx = cleanMode === 'simple' ? Math.max(SIMPLE_DEFAULT_PX, saved) : (saved || ADVANCED_DEFAULT_PX);
      doc.documentElement.style.setProperty('--radar-font-size', targetPx + 'px');
      const label = doc.getElementById('textSizeStatus');
      if (label) label.textContent = targetPx + 'px';
    }

    updateToggleButton(cleanMode);

    // Trigger Leaflet map resize in case left panel width changed
    setTimeout(() => global.PublicRadarBridge?.getMap()?.invalidateSize({ pan: false }), 60);
    return cleanMode;
  }

  function toggleMode() {
    const current = global.document?.body?.dataset?.radarMode || 'simple';
    const next = current === 'simple' ? 'advanced' : 'simple';
    return applyMode(next, { adjustFont: true });
  }

  function updateToggleButton(mode) {
    const btn = global.document?.getElementById('radarModeToggleBtn');
    if (!btn) return;
    const isSimple = mode === 'simple';
    btn.dataset.mode = mode;
    btn.setAttribute('aria-pressed', isSimple ? 'true' : 'false');
    btn.textContent = isSimple
      ? '🟢 Simple view · tap for all tools'
      : '⚙️ All tools · tap for simple view';
    btn.title = isSimple
      ? 'Simple Mode hides technical GIS menus and enlarges Owner, Call, and Speak buttons. Click to show all Advanced tools.'
      : 'Advanced Mode shows all 3 tabs, GIS filters, and export tools. Click to return to Simple Mode.';
  }

  function mountModeToggleButton(headerSelector = '.top') {
    const doc = global.document;
    if (!doc) return null;
    const header = doc.querySelector(headerSelector) || doc.querySelector('header');
    if (!header) return null;

    let btn = doc.getElementById('radarModeToggleBtn');
    if (!btn) {
      btn = doc.createElement('button');
      btn.id = 'radarModeToggleBtn';
      btn.type = 'button';
      btn.className = 'radar-mode-toggle-btn';
      btn.addEventListener('click', () => {
        toggleMode();
      });

      const rightControls = header.querySelector('.text-size-controls') || header.lastElementChild;
      if (rightControls && rightControls.parentNode === header) {
        header.insertBefore(btn, rightControls);
      } else {
        header.appendChild(btn);
      }
    }

    const mode = doc.body?.dataset?.radarMode || getInitialMode();
    updateToggleButton(mode);
    return btn;
  }

  function initSimpleMode() {
    const initial = getInitialMode();
    mountModeToggleButton('.top');
    applyMode(initial, { adjustFont: initial === 'simple' });
    // Re-apply after the workspace tabs and the text-size control finish loading.
    for (const ms of [400, 1500]) setTimeout(() => { if (global.document.body.dataset.radarMode === 'simple') applyMode('simple', { adjustFont: true }); }, ms);
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initSimpleMode);
    } else {
      initSimpleMode();
    }
  }

  const api = {
    getInitialMode,
    applyMode,
    toggleMode,
    mountModeToggleButton
  };

  global.RadarSimpleMode = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);