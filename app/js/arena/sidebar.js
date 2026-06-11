// ─────────────────────────────────────────────────────────────────────────────
// sidebar.js — examples list on the left of the arena
// ─────────────────────────────────────────────────────────────────────────────

import { EXAMPLES } from './examples/index.js';

let _container = null;
let _onSelect  = null;
let _activeId  = null;

export function initSidebar({ container, onSelect, activeId }) {
  _container = container;
  _onSelect  = onSelect;
  _activeId  = activeId;
  _render();
}

export function setActive(id) {
  _activeId = id;
  _render();
}

function _render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="sidebar-header">Examples</div>
    <div class="sidebar-list">
      ${EXAMPLES.map(ex => `
        <button class="ex-card${ex.id === _activeId ? ' ex-card--active' : ''}"
                data-id="${ex.id}"
                style="--ex-accent: ${ex.accent}">
          <div class="ex-card__head">
            <span class="ex-card__icon">${ex.icon}</span>
            <span class="ex-card__name">${ex.name}</span>
          </div>
          <div class="ex-card__tag">${ex.tagline}</div>
        </button>
      `).join('')}
    </div>
    <div class="sidebar-footer">
      <a href="./index.html" class="sidebar-back">← Home</a>
      <button class="theme-toggle" data-theme-toggle title="Toggle theme">☀</button>
    </div>
  `;
  for (const btn of _container.querySelectorAll('.ex-card')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id === _activeId) return;
      _onSelect?.(id);
    });
  }
  // Re-bind theme toggle since we just reset innerHTML.
  import('../theme.js').then(({ initTheme }) => initTheme());
}
