// ─────────────────────────────────────────────────────────────────────────────
// theme.js — light/dark theme persistence and toggle
// ─────────────────────────────────────────────────────────────────────────────
// Reads `theme` from localStorage; falls back to OS preference.
// Applies as `<html data-theme="light|dark">`.
// Wires up any element with `[data-theme-toggle]` to flip and persist.

const KEY = 'webgpu-gemma-tax-theme';

function getInitial() {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update colour-scheme so form controls follow suit.
  document.documentElement.style.colorScheme = theme;
  // Update any toggle button labels.
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    btn.textContent = theme === 'light' ? '☾' : '☀';
    btn.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
  }
}

export function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
  localStorage.setItem(KEY, next);
  applyTheme(next);
}

export function initTheme() {
  applyTheme(getInitial());
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    if (btn.dataset.themeBound === '1') continue;   // idempotent
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', toggleTheme);
  }
}

// Auto-init on import — pages that import this module can just `import './theme.js'`
// and the theme is applied + toggle wired up. Pages can also call initTheme() again
// after dynamic DOM updates.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme, { once: true });
} else {
  initTheme();
}
