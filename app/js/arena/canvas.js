// ─────────────────────────────────────────────────────────────────────────────
// canvas.js — 12-column grid mounting surface
// ─────────────────────────────────────────────────────────────────────────────

let _grid     = null;
let _empty    = null;
let _counter  = 0;
const _mounts = new Map();   // mountId → { tagName, slot, el }

export function initCanvas() {
  _grid  = document.getElementById('canvas-grid');
  _empty = document.getElementById('canvas-empty');
  _refreshEmpty();
}

function _refreshEmpty() {
  if (!_empty) return;
  _empty.classList.toggle('hidden', _mounts.size > 0);
}

/**
 * Mount a custom element on the grid.
 *
 * @param {string} tagName  registered custom element name (e.g. "bar-chart")
 * @param {object} props    properties to assign
 * @param {object} slot     { col, row, colspan, rowspan }
 * @returns {string} mountId
 */
/**
 * Mount arbitrary HTML in a slot. Used by the `render_html` tool when the
 * model needs to fall back to Tailwind-styled markup because no registered
 * component fits its need.
 *
 * @param {string} htmlString  raw HTML markup (Tailwind classes welcome)
 * @param {object} slot        { col, colspan, rowspan }
 * @param {string} [notice]    optional fallback notice rendered as a small
 *                             banner above the body — e.g. "Fallback: no
 *                             pie-chart component, drawn with Tailwind."
 *
 * Security note: this trusts the HTML string. For a local POC where the only
 * source is our own Gemma instance running on the user's machine, that is
 * fine. Do NOT expose this to untrusted input.
 */
export function mountHtml(htmlString, slot = {}, notice = '') {
  if (!_grid) throw new Error('canvas not initialised');

  const wrap = document.createElement('div');
  wrap.className = 'canvas-slot canvas-slot--html';

  const col      = clamp(slot.col      ?? 1, 1, 12);
  const colspan  = clamp(slot.colspan  ?? 6, 1, 12);
  const row      = slot.row     ?? 'auto';
  const rowspan  = clamp(slot.rowspan  ?? 4, 1, 20);

  wrap.style.gridColumn = `${col} / span ${colspan}`;
  wrap.style.gridRow    = row === 'auto' ? `span ${rowspan}` : `${row} / span ${rowspan}`;

  const closeBtn = document.createElement('button');
  closeBtn.className   = 'canvas-slot__close';
  closeBtn.title       = 'Remove';
  closeBtn.textContent = '×';
  wrap.appendChild(closeBtn);

  if (notice && typeof notice === 'string') {
    const banner = document.createElement('div');
    banner.className   = 'canvas-slot__notice';
    banner.textContent = notice;
    wrap.appendChild(banner);
  }

  const body = document.createElement('div');
  body.className = 'canvas-slot__body canvas-slot__body--html';
  body.innerHTML = htmlString;
  wrap.appendChild(body);

  const mountId = `m${++_counter}`;
  closeBtn.addEventListener('click', () => unmountSlot(mountId));

  _grid.appendChild(wrap);
  _mounts.set(mountId, { tagName: 'html', slot: { col, colspan, row, rowspan }, el: wrap });
  _refreshEmpty();
  return mountId;
}

export function mountComponent(tagName, props, slot = {}) {
  if (!_grid) throw new Error('canvas not initialised');

  const wrap = document.createElement('div');
  wrap.className = 'canvas-slot';

  const col      = clamp(slot.col      ?? 1, 1, 12);
  const colspan  = clamp(slot.colspan  ?? 6, 1, 12);
  const row      = slot.row     ?? 'auto';
  const rowspan  = clamp(slot.rowspan  ?? 4, 1, 20);

  wrap.style.gridColumn = `${col} / span ${colspan}`;
  wrap.style.gridRow    = row === 'auto' ? `span ${rowspan}` : `${row} / span ${rowspan}`;

  const closeBtn = document.createElement('button');
  closeBtn.className   = 'canvas-slot__close';
  closeBtn.title       = 'Remove';
  closeBtn.textContent = '×';
  wrap.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'canvas-slot__body';
  wrap.appendChild(body);

  const el = document.createElement(tagName);
  for (const [k, v] of Object.entries(props || {})) el[k] = v;
  body.appendChild(el);

  const mountId = `m${++_counter}`;
  closeBtn.addEventListener('click', () => unmountSlot(mountId));

  _grid.appendChild(wrap);
  _mounts.set(mountId, { tagName, slot: { col, colspan, row, rowspan }, el: wrap, props });
  _refreshEmpty();
  return mountId;
}

export function unmountSlot(mountId) {
  const rec = _mounts.get(mountId);
  if (!rec) return false;
  rec.el.remove();
  _mounts.delete(mountId);
  _refreshEmpty();
  return true;
}

/**
 * Update properties on a mounted component in place.
 * Used to advance the pending-card progress without rebuilding the slot.
 */
export function updateMount(mountId, props) {
  const rec = _mounts.get(mountId);
  if (!rec) return false;
  const el = rec.el.querySelector('.canvas-slot__body > *');
  if (!el) return false;
  for (const [k, v] of Object.entries(props || {})) el[k] = v;
  return true;
}

/**
 * Read the slot coords of a mount — used to swap a pending card with a real
 * component while preserving the same grid placement.
 */
export function getSlot(mountId) {
  const rec = _mounts.get(mountId);
  return rec ? { ...rec.slot } : null;
}

export function listMounted() {
  return [..._mounts.entries()].map(([mountId, rec]) => ({
    mountId,
    component: rec.tagName,
    slot: rec.slot
  }));
}

export function clearCanvas() {
  for (const id of [..._mounts.keys()]) unmountSlot(id);
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
