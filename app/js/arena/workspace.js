// ─────────────────────────────────────────────────────────────────────────────
// workspace.js — manages the active example's workspace area
// ─────────────────────────────────────────────────────────────────────────────

import { loadExample } from './examples/index.js';

let _container    = null;
let _headerEl     = null;
let _presetsEl    = null;
let _accentTarget = null;
let _activeEx     = null;
let _cleanup      = null;
let _onPreset     = null;

export function initWorkspace({ container, headerEl, presetsEl, accentTarget, onPreset }) {
  _container    = container;
  _headerEl     = headerEl;
  _presetsEl    = presetsEl;
  _accentTarget = accentTarget;
  _onPreset     = onPreset;
}

/**
 * Activate an example by id. Tears down the previous example's workspace,
 * sets the per-example accent, renders presets, and calls the example's
 * own setupWorkspace().
 *
 * @returns the loaded example object
 */
export async function activate(exampleId) {
  // Tear down previous example
  try { _cleanup?.(); } catch (e) { console.warn('workspace cleanup threw:', e); }
  _cleanup = null;
  _activeEx = null;
  _container.innerHTML = '<div class="ws-loading">Loading example…</div>';
  if (_presetsEl) _presetsEl.innerHTML = '';
  if (_headerEl)  _headerEl.textContent = '';

  const ex = await loadExample(exampleId);

  // Apply per-example accent and header
  if (_accentTarget) _accentTarget.style.setProperty('--accent', ex.accent || '#6366f1');
  if (_headerEl) {
    _headerEl.innerHTML = `
      <span class="ex-icon">${ex.meta?.icon || '·'}</span>
      <div class="ex-meta">
        <div class="ex-name">${ex.name}</div>
        <div class="ex-desc">${ex.description}</div>
      </div>
    `;
  }

  // Render preset chips
  if (_presetsEl && Array.isArray(ex.presets)) {
    _presetsEl.innerHTML = ex.presets.map((p, i) => `
      <button class="preset-chip${p.primary ? ' preset-chip--primary' : ''}" data-preset-i="${i}">
        ${p.label}
      </button>
    `).join('');
    for (const btn of _presetsEl.querySelectorAll('.preset-chip')) {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.presetI);
        const p = ex.presets[i];
        if (p && _onPreset) _onPreset(p.text);
      });
    }
  }

  // Hand off to the example to populate the workspace itself.
  // The host gives the example a `submitPrompt` callback so workspace UI
  // (dataset cards, mic, etc.) can drop text directly into the chat agent.
  _container.innerHTML = '';
  const cleanup = await ex.setupWorkspace(_container, {
    submitPrompt: (text) => _onPreset?.(text)
  });
  _cleanup = (typeof cleanup === 'function') ? cleanup : null;
  _activeEx = ex;

  // Re-trigger fade-in so swaps feel responsive even though innerHTML changed.
  _container.style.animation = 'none';
  void _container.offsetWidth;   // force reflow
  _container.style.animation = '';

  return ex;
}

export function getActiveExample() { return _activeEx; }
