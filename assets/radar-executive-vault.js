/**
 * assets/radar-executive-vault.js (from Argon's executiveVaultAuth.js)
 * Zero-Backend AES-256-GCM Client-Side Executive Vault Authentication & Decryption Module
 * for Capital Radar (`https://prcasley.github.io/ubiquitous-fortnight/?v=owner1`).
 *
 * Reference Blueprint:
 *   https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899
 *
 * Replaces the hardcoded client-side welcome gate (`WP123`) with native browser
 * Web Crypto API key derivation (PBKDF2-HMAC-SHA256, 600,000 iterations) and
 * in-memory AES-256-GCM decryption of `assets/data/executive-vault.enc`.
 *
 * Zero plaintext passphrases, keys, or unredacted executive contact records are
 * ever stored in the public repository, DOM source, or localStorage.
 */
(function (global) {
  'use strict';

  const DEFAULT_VAULT_URL = 'assets/data/executive-vault.enc';
  const SESSION_FLAG_KEY = 'radar_exec_unlocked';

  // Held strictly in closure RAM for the active page lifecycle
  let unlockedVaultData = null;
  const listeners = new Set();

  function base64ToBytes(b64) {
    const clean = String(b64 || '').trim();
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Decrypts an encrypted payload object ({ salt, iv, ct, iter }) in browser RAM
   * using Web Crypto API (PBKDF2-SHA256 -> AES-256-GCM).
   */
  async function decryptVaultPayload(payload, passphrase) {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error('Web Crypto API is unavailable. Serve Capital Radar over HTTPS or localhost.');
    }
    if (!passphrase || !String(passphrase).trim()) {
      throw new Error('Enter a valid executive passphrase.');
    }
    if (!payload || !payload.salt || !payload.iv || !payload.ct) {
      throw new Error('Malformed executive vault payload.');
    }

    const encoder = new TextEncoder();
    const keyMaterial = await global.crypto.subtle.importKey(
      'raw',
      encoder.encode(String(passphrase)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const aesKey = await global.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: base64ToBytes(payload.salt),
        iterations: Number(payload.iter) || 600000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    let decryptedBuffer;
    try {
      decryptedBuffer = await global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
        aesKey,
        base64ToBytes(payload.ct)
      );
    } catch (_err) {
      throw new Error('Invalid executive passphrase or corrupted vault file.');
    }

    const decodedJson = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decodedJson);
  }

  /**
   * Fetches `assets/data/executive-vault.enc` and unlocks executive contacts into RAM.
   */
  async function unlockExecutiveContactVault(passphrase, vaultUrl = DEFAULT_VAULT_URL) {
    const response = await fetch(vaultUrl, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) {
      throw new Error('Encrypted executive vault file not found (' + response.status + ').');
    }
    const payload = await response.json();
    const data = await decryptVaultPayload(payload, passphrase);
    unlockedVaultData = data;

    try {
      global.sessionStorage?.setItem(SESSION_FLAG_KEY, 'true');
    } catch (_e) {
      // Ignore storage quota / private mode restrictions
    }

    notifyListeners();
    return unlockedVaultData;
  }

  /**
   * Clears decrypted contacts from memory immediately.
   */
  function lockExecutiveContactVault() {
    unlockedVaultData = null;
    try {
      global.sessionStorage?.removeItem(SESSION_FLAG_KEY);
    } catch (_e) {
      // Ignore
    }
    notifyListeners();
  }

  /**
   * Looks up an unlocked executive contact record by normalized PAMS_PIN or FL PCN.
   */
  // Florida PCNs are compared without dashes/spaces and without leading zeros, so
  // "424332150010010" and "00424332150010010" match the same parcel.
  function keyOf(id) {
    const raw = String(id || '').trim();
    return raw.includes('_') ? raw.toUpperCase() : raw.replace(/[-\s]/g, '').replace(/^0+/, '');
  }

  function getExecutiveRecordForParcel(parcelId) {
    if (!unlockedVaultData || !parcelId) return null;
    const map = unlockedVaultData.recordsByPin || unlockedVaultData;
    const raw = String(parcelId).trim();
    if (map[raw]) return map[raw];
    const want = keyOf(raw);
    for (const k of Object.keys(map)) if (keyOf(k) === want) return map[k];
    return null;
  }

  function isVaultUnlocked() {
    return unlockedVaultData !== null;
  }

  function onVaultStateChange(callback) {
    if (typeof callback === 'function') {
      listeners.add(callback);
    }
    return () => listeners.delete(callback);
  }

  function notifyListeners() {
    const state = { unlocked: isVaultUnlocked(), data: unlockedVaultData };
    listeners.forEach(fn => {
      try {
        fn(state);
      } catch (_e) {
        // Prevent listener error from breaking auth flow
      }
    });
    if (typeof global.CustomEvent === 'function' && global.document?.dispatchEvent) {
      global.document.dispatchEvent(new CustomEvent('radar:vault-state', { detail: state }));
    }
  }

  /**
   * Mounts an "Unlock Executive Contacts" control button and modal dialog into the top header.
   */
  function mountExecutiveVaultHeaderControl(containerSelector = '.top') {
    if (!global.document) return;
    const header = global.document.querySelector(containerSelector);
    if (!header || global.document.getElementById('radarExecVaultBtn')) return;

    const btn = global.document.createElement('button');
    btn.id = 'radarExecVaultBtn';
    btn.type = 'button';
    btn.className = 'exec-vault-btn';
    btn.textContent = '🔒 Unlock Executive Contacts';
    btn.setAttribute('aria-label', 'Unlock encrypted executive contacts vault');

    btn.addEventListener('click', () => {
      if (isVaultUnlocked()) {
        lockExecutiveContactVault();
        btn.textContent = '🔒 Unlock Executive Contacts';
        btn.dataset.unlocked = 'false';
        return;
      }
      openPassphraseModal(btn);
    });

    const controls = header.querySelector('.text-size-controls') || header;
    controls.parentNode.insertBefore(btn, controls);
  }

  function openPassphraseModal(triggerBtn) {
    const existing = global.document.getElementById('radarExecVaultModal');
    if (existing) existing.remove();

    const dialog = global.document.createElement('div');
    dialog.id = 'radarExecVaultModal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.72);display:flex;align-items:center;justify-content:center;z-index:2000;padding:16px;';

    dialog.innerHTML = [
      '<form id="radarExecVaultForm" style="background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:20px;max-width:400px;width:100%;box-shadow:0 12px 32px rgba(0,0,0,0.45);">',
      '  <h3 style="margin:0 0 8px;font-size:1.05rem;">Unlock Executive Contact Vault</h3>',
      '  <p style="margin:0 0 12px;font-size:0.88rem;color:#cbd5e1;">Decrypts AES-256-GCM owner, officer, phone, and email records in browser memory only.</p>',
      '  <input id="radarExecVaultInput" type="password" autocomplete="current-password" placeholder="Enter Executive Passphrase" required style="width:100%;box-sizing:border-box;padding:9px 11px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;margin-bottom:10px;" />',
      '  <div id="radarExecVaultError" role="alert" style="color:#f87171;font-size:0.84rem;min-height:1.2em;margin-bottom:8px;"></div>',
      '  <div style="display:flex;gap:8px;justify-content:flex-end;">',
      '    <button type="button" id="radarExecVaultCancel" style="padding:7px 12px;border-radius:6px;border:1px solid #475569;background:transparent;color:#cbd5e1;cursor:pointer;">Cancel</button>',
      '    <button type="submit" id="radarExecVaultSubmit" style="padding:7px 14px;border-radius:6px;border:none;background:#0284c7;color:#fff;font-weight:600;cursor:pointer;">Unlock</button>',
      '  </div>',
      '</form>'
    ].join('');

    global.document.body.appendChild(dialog);
    const input = dialog.querySelector('#radarExecVaultInput');
    const errorEl = dialog.querySelector('#radarExecVaultError');
    const submitBtn = dialog.querySelector('#radarExecVaultSubmit');
    input?.focus();

    dialog.querySelector('#radarExecVaultCancel')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#radarExecVaultForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Decrypting…';
      try {
        await unlockExecutiveContactVault(input.value);
        if (triggerBtn) {
          triggerBtn.textContent = '🔓 Executive Vault Unlocked (Lock)';
          triggerBtn.dataset.unlocked = 'true';
        }
        dialog.remove();
      } catch (err) {
        errorEl.textContent = err?.message || 'Decryption failed.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Unlock';
      }
    });
  }

  const api = {
    decryptVaultPayload,
    unlockExecutiveContactVault,
    lockExecutiveContactVault,
    getExecutiveRecordForParcel,
    isVaultUnlocked,
    onVaultStateChange,
    mountExecutiveVaultHeaderControl
  };

  global.RadarExecutiveVault = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
/* No separate vault button: the site password (radar-entry.js) opens the vault. */
