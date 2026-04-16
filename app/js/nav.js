// ─────────────────────────────────────────────────────────────────────────────
// nav.js — Sidebar navigation, known-issues panel, modal, and AI banner wiring
// ─────────────────────────────────────────────────────────────────────────────

import { FORMS, getIssues, getFormKeysWithIssues, replaceIssues, getQA } from './data.js';
import { renderForm }                      from './renderer.js';
import { getState, loadModel, analyseForm, detectAffectedForms, chatWithForm, setProgressCallback, setStateChangeCallback }
  from './ai.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const formTitleEl   = document.getElementById('form-title');
const formBody      = document.getElementById('form-body');
const formPlaceholder = document.getElementById('form-placeholder');

// AI model status (sidebar footer)
const aiDot         = document.getElementById('ai-dot');
const aiStatusText  = document.getElementById('ai-status-text');
const aiLoadBar     = document.getElementById('ai-load-bar');
const aiLoadFill    = document.getElementById('ai-load-fill');

// AI analysis banner
const aiBanner      = document.getElementById('ai-banner');
const aiBannerDot   = document.getElementById('ai-banner-dot');
const aiOutput      = document.getElementById('ai-output');
const rerunBtn      = document.getElementById('rerun-btn');

// Known-issues top strip
const kiTopStrip    = document.getElementById('ki-top-strip');

// Chat panel
const chatPanel     = document.getElementById('chat-panel');
const chatMessages  = document.getElementById('chat-messages');
const chatInput     = document.getElementById('chat-input');
const chatSendBtn   = document.getElementById('chat-send-btn');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatModeBtns  = document.querySelectorAll('.chat-mode-btn');

// Modal
const modalOverlay  = document.getElementById('modal-overlay');
const modalTitle    = document.getElementById('modal-title');
const modalList     = document.getElementById('modal-list');
const modalSaveBtn  = document.getElementById('modal-save-btn');

// Progress bar (page-load full-width)
const pageProgress  = document.getElementById('page-progress');
const pageProgressFill = document.getElementById('page-progress-fill');
const pageProgressLabel = document.getElementById('page-progress-label');

// ── Current form ──────────────────────────────────────────────────────────────
let _currentForm = null;
const getCurrentForm = () => _currentForm;

// ── AI sidebar status wiring ───────────────────────────────────────────────────
const STATE_CFG = {
  idle:    { color: 'var(--muted)',    blink: false, label: 'not loaded' },
  loading: { color: 'var(--warn)',     blink: true,  label: 'loading…'   },
  ready:   { color: 'var(--success)',  blink: false, label: 'ready ✓'    },
  error:   { color: 'var(--danger)',   blink: false, label: 'error — F12' },
};

function setSidebarAI(state, detail) {
  const cfg = STATE_CFG[state] || STATE_CFG.idle;
  aiDot.style.background = cfg.color;
  aiDot.classList.toggle('blink', cfg.blink);
  aiStatusText.textContent = detail || cfg.label;
  aiStatusText.style.color = cfg.color;
}

setStateChangeCallback((state, detail) => {
  setSidebarAI(state, detail);

  if (state === 'loading') {
    aiLoadBar.classList.remove('hidden');
    pageProgress.classList.remove('hidden');
  }
  if (state === 'ready' || state === 'error') {
    aiLoadBar.classList.add('hidden');
    // Slide page progress bar to 100 then hide
    aiLoadFill.style.width = '100%';
    pageProgressFill.style.width = '100%';
    pageProgressLabel.textContent = state === 'ready' ? 'AI model ready' : 'AI model error';
    setTimeout(() => {
      pageProgress.classList.add('hidden');
      pageProgressFill.style.width = '0%';
    }, 1200);
    // If a form with issues is waiting for analysis, run it now
    if (state === 'ready' && _currentForm) _maybeRunAnalysis(_currentForm);
  }
});

setProgressCallback((pct) => {
  aiLoadFill.style.width = pct + '%';
  pageProgressFill.style.width = pct + '%';
  pageProgressLabel.textContent = `Loading AI model… ${pct}%`;
});

// ── Build sidebar nav from FORMS data ─────────────────────────────────────────
const CATEGORIES = [
  { label: 'W Forms',      keys: ['W-2'] },
  { label: '1099 Series',  keys: ['1099-MISC', '1099-NEC', '1099-INT', '1099-DIV'] },
  { label: '1040 Series',  keys: ['1040', 'Schedule-A', 'Schedule-B'] },
];

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const catLabel = document.createElement('p');
    catLabel.className = 'nav-cat-label';
    catLabel.textContent = cat.label;
    nav.appendChild(catLabel);

    cat.keys.forEach(key => {
      const def = FORMS[key];
      if (!def) return;
      const shortName = def.title.split('—')[0].trim();

      const btn = document.createElement('button');
      btn.className = 'nav-btn';
      btn.dataset.form = key;
      btn.onclick = () => selectForm(key);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = shortName;
      btn.appendChild(nameSpan);

      nav.appendChild(btn);
    });
  });

  refreshNavBadges();
}

// ── Refresh all sidebar nav badges from live store ────────────────────────────
export function refreshNavBadges() {
  const keysWithIssues = new Set(getFormKeysWithIssues());
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const key = btn.dataset.form;
    const existing = btn.querySelector('.nav-issue-badge');
    if (keysWithIssues.has(key) && !existing) {
      const badge = document.createElement('span');
      badge.className = 'nav-issue-badge';
      badge.textContent = '⚠ Issues';
      btn.appendChild(badge);
    } else if (!keysWithIssues.has(key) && existing) {
      existing.remove();
    }
  });
}

// ── Select form ───────────────────────────────────────────────────────────────
export function selectForm(formKey) {
  _currentForm = formKey;
  const def = FORMS[formKey];

  // Active nav state
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-form="${formKey}"]`);
  activeBtn?.classList.add('active');

  // Header title
  formTitleEl.textContent = def.title.split('—')[0].trim();

  // Render form
  formPlaceholder.classList.add('hidden');
  formBody.classList.remove('hidden');
  renderForm(def, formBody);

  // Known issues top strip
  _renderTopStrip(formKey);

  // AI analysis banner
  _maybeRunAnalysis(formKey);

  // Chat panel
  _openChat(formKey);
}

// ── Field AI ask (dispatched from renderer) ──────────────────────────────────
document.addEventListener('field-ai-ask', ({ detail }) => {
  const question = `Tell me everything about ${detail.box} — ${detail.label} on Form ${_currentForm}. What goes in this field, common mistakes, and how it flows to other forms.`;
  _triggerChatMessage(question);
});

async function _triggerChatMessage(text) {
  // Open chat if not already open for this form
  if (!_chatFormKey && _currentForm) await _openChat(_currentForm);
  // Fill input and submit
  chatInput.value = text;
  chatPanel.classList.remove('hidden');
  chatInput.focus();
  _sendChat();
}

// ── Chat ─────────────────────────────────────────────────────────────────
let _chatFormKey = null;
let _chatQA      = [];
let _chatBusy    = false;
let _chatMode    = 'mixed'; // 'grounded' | 'mixed' | 'model'

// Wire mode button clicks
chatModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    _chatMode = btn.dataset.mode;
    chatModeBtns.forEach(b => b.classList.remove('chat-mode-btn--active'));
    btn.classList.add('chat-mode-btn--active');
  });
});

async function _openChat(formKey) {
  _chatFormKey = formKey;
  _chatQA      = await getQA(formKey);
  _chatBusy    = false;

  chatHeaderTitle.textContent = `Ask about Form ${formKey}`;
  chatMessages.innerHTML = '';

  // Welcome message
  _appendBubble('assistant',
    `I have ${_chatQA.length} Q&A pairs loaded for Form ${formKey}. Ask me anything about this form.`,
    null);

  chatPanel.classList.remove('hidden');
  chatInput.value = '';
  chatInput.focus();
}

function _appendBubble(role, text, sourceTag) {
  const wrap = document.createElement('div');
  wrap.className = `chat-bubble chat-bubble--${role}`;

  const textEl = document.createElement('div');
  textEl.className = 'chat-bubble-text';
  textEl.textContent = text;
  wrap.appendChild(textEl);

  if (sourceTag) {
    const src = document.createElement('span');
    src.className = `chat-source chat-source--${sourceTag === 'Q&A' ? 'qa' : 'model'}`;
    src.textContent = `Source: ${sourceTag}`;
    wrap.appendChild(src);
  }

  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return textEl; // return for streaming updates
}

async function _sendChat() {
  if (_chatBusy || !_chatFormKey) return;
  const text = chatInput.value.trim();
  if (!text) return;

  if (getState() !== 'ready') {
    _appendBubble('assistant', '⚠ AI model is still loading — please wait a moment.', null);
    return;
  }

  chatInput.value = '';
  _appendBubble('user', text, null);
  _chatBusy = true;
  chatSendBtn.disabled = true;

  // Streaming assistant bubble
  const assistantWrap = document.createElement('div');
  assistantWrap.className = 'chat-bubble chat-bubble--assistant';
  const streamEl = document.createElement('div');
  streamEl.className = 'chat-bubble-text chat-bubble-text--streaming';
  streamEl.textContent = '…';
  assistantWrap.appendChild(streamEl);
  chatMessages.appendChild(assistantWrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    await chatWithForm(_chatFormKey, _chatQA, text, streamEl, (fullResponse) => {
      // Parse out source tag (not emitted in model-only mode, but harmless)
      const qaMatch    = /Source:\s*Q&A\s*$/i.test(fullResponse);
      const modelMatch = /Source:\s*Model\s*$/i.test(fullResponse);
      const sourceTag  = qaMatch ? 'Q&A' : modelMatch ? 'Model' : null;

      // Strip the source line from displayed text
      const displayText = fullResponse
        .replace(/\s*Source:\s*(Q&A|Model)\s*$/i, '').trim();

      streamEl.textContent = displayText;
      streamEl.classList.remove('chat-bubble-text--streaming');

      if (sourceTag) {
        const src = document.createElement('span');
        src.className = `chat-source chat-source--${sourceTag === 'Q&A' ? 'qa' : 'model'}`;
        src.textContent = `Source: ${sourceTag}`;
        assistantWrap.appendChild(src);
      }

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, _chatMode);
  } catch (err) {
    streamEl.textContent = `⚠ ${err.message}`;
    streamEl.classList.remove('chat-bubble-text--streaming');
  }

  _chatBusy = false;
  chatSendBtn.disabled = false;
  chatInput.focus();
}

// Wire send button + Enter (Shift+Enter = newline)
chatSendBtn.addEventListener('click', _sendChat);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendChat(); }
});

// ── Known-issues panel (always visible) ───────────────────────────────────────
const SEV_CFG = {
  high:   { cls: 'ki-card--high',   badge: 'ki-badge--high',   label: 'HIGH' },
  medium: { cls: 'ki-card--medium', badge: 'ki-badge--medium', label: 'MEDIUM' },
  low:    { cls: 'ki-card--low',    badge: 'ki-badge--low',    label: 'LOW' },
};

// ── Known-issues top strip (shown above form when form is loaded) ─────────────
function _renderTopStrip(formKey) {
  if (!kiTopStrip) return;
  const issues = getIssues(formKey);
  const kiBtn  = document.getElementById('ki-detail-btn');

  if (!issues.length) {
    kiTopStrip.className = 'ki-top-strip ki-strip--clean';
    kiTopStrip.innerHTML = `
      <span class="ki-strip-icon ki-strip-icon--ok">✓</span>
      <span class="ki-strip-label">No known issues for this form</span>
    `;
    if (kiBtn) { kiBtn.textContent = '✓ Known Issues'; kiBtn.className = 'ki-btn-ok'; }
  } else {
    kiTopStrip.className = 'ki-top-strip ki-strip--warn';
    const chips = issues.map(iss => {
      const cfg = SEV_CFG[iss.sev] || SEV_CFG.low;
      return `<span class="ki-strip-chip ki-strip-chip--${iss.sev}"><span class="ki-badge ${cfg.badge}">${cfg.label}</span> ${iss.title}</span>`;
    }).join('');
    kiTopStrip.innerHTML = `
      <div class="ki-strip-header" id="ki-strip-toggle-row">
        <span class="ki-strip-icon ki-strip-icon--warn">⚠</span>
        <span class="ki-strip-label">${issues.length} known issue${issues.length !== 1 ? 's' : ''}</span>
        <button class="ki-strip-toggle" id="ki-strip-toggle" title="Collapse">▲</button>
      </div>
      <div class="ki-strip-chips" id="ki-strip-chips">${chips}</div>
    `;
    // Wire collapse toggle
    document.getElementById('ki-strip-toggle').addEventListener('click', () => {
      const chipsEl = document.getElementById('ki-strip-chips');
      const btn     = document.getElementById('ki-strip-toggle');
      const collapsed = kiTopStrip.classList.toggle('ki-strip--collapsed');
      btn.textContent = collapsed ? '▼' : '▲';
      btn.title       = collapsed ? 'Expand' : 'Collapse';
    });
    if (kiBtn) { kiBtn.textContent = `⚠ Known Issues (${issues.length})`; kiBtn.className = 'ki-btn-warn'; }
  }
  kiTopStrip.style.display = '';
}

// ── AI banner ─────────────────────────────────────────────────────────────────
async function _maybeRunAnalysis(formKey, forceRerun = false) {
  const issues = getIssues(formKey);

  // Show banner for ALL forms — indicate no issues when empty
  aiBanner.classList.remove('hidden');
  rerunBtn.classList.add('hidden');
  aiBannerDot.classList.add('blink');
  aiOutput.textContent = '';

  if (!issues.length) {
    aiOutput.innerHTML = '<span class="ai-waiting">No known issues for this form — nothing to analyse.</span>';
    aiBannerDot.classList.remove('blink');
    return;
  }

  const state = getState();

  if (state === 'loading') {
    aiOutput.innerHTML = '<span class="ai-waiting">AI model loading — analysis will start automatically once ready…</span>';
    return; // stateChange callback will call _maybeRunAnalysis again when ready
  }

  if (state === 'error') {
    aiOutput.innerHTML = '<span class="ai-error">⚠ AI model failed to load. WebGPU required (Chrome/Edge 113+).</span>';
    aiBannerDot.classList.remove('blink');
    return;
  }

  if (state !== 'ready') return;

  try {
    await analyseForm(
      formKey,
      issues,
      aiOutput,
      () => {
        aiBannerDot.classList.remove('blink');
        rerunBtn.classList.remove('hidden');
      },
      getCurrentForm,
    );
  } catch (err) {
    if (getCurrentForm() === formKey) {
      aiOutput.innerHTML = `<span class="ai-error">⚠ ${err.message}</span>`;
      aiBannerDot.classList.remove('blink');
    }
  }
}

// Rerun button
rerunBtn.addEventListener('click', () => {
  if (_currentForm) _maybeRunAnalysis(_currentForm, true);
});

// ── Modal — Global Known Issues Manager ──────────────────────────────────────
export function openModal() {
  modalTitle.textContent = 'Known Issues Manager — All Forms';
  modalList.innerHTML = '';

  // ── New issue textarea (no form dropdown — AI assigns on Save) ──
  const addSection = document.createElement('div');
  addSection.className = 'mgr-add-section';
  addSection.innerHTML = `
    <div class="mgr-add-header">
      New Issue
      <span class="mgr-add-hint">AI will detect which forms are affected when you save</span>
    </div>
    <div class="mgr-add-row-top">
      <select id="mgr-add-sev" class="mgr-input mgr-sev-inline">
        <option value="high">High</option>
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
    <textarea id="mgr-add-body" class="mgr-input mgr-textarea" rows="3"
      placeholder="Describe the issue — AI will assign it to the right forms on Save…"></textarea>
  `;
  modalList.appendChild(addSection);
  addSection.querySelector('#mgr-add-body').addEventListener('input', _markChanged);

  // ── Issue list grouped by form ──
  const listSection = document.createElement('div');
  listSection.id = 'mgr-issue-groups';
  modalList.appendChild(listSection);
  _renderAllGroups(listSection);

  // Show Save button
  if (modalSaveBtn) { modalSaveBtn.classList.remove('hidden'); modalSaveBtn.disabled = true; }

  modalOverlay.classList.remove('hidden');
  modalOverlay.classList.add('flex');
}

function _renderAllGroups(container) {
  container.innerHTML = '';
  Object.keys(FORMS).forEach(formKey => {
    const issues = getIssues(formKey);
    const group  = document.createElement('div');
    group.className = 'mgr-group';
    group.dataset.group = formKey;

    const hdr = document.createElement('div');
    hdr.className = 'mgr-group-header';
    hdr.innerHTML = `
      <span class="mgr-group-name">${FORMS[formKey].title.split('—')[0].trim()}</span>
      <span class="mgr-group-form-tag">${formKey}</span>
      <span class="mgr-group-count ${issues.length ? 'mgr-count--warn' : 'mgr-count--none'}" data-count="${formKey}">
        ${issues.length} issue${issues.length !== 1 ? 's' : ''}
      </span>
    `;
    group.appendChild(hdr);

    const rows = document.createElement('div');
    rows.className = 'mgr-rows';
    issues.forEach((iss, idx) => _addIssueRow(rows, formKey, iss, idx));
    if (!issues.length) rows.innerHTML = '<div class="mgr-empty-row">No issues — form is clean ✓</div>';
    group.appendChild(rows);
    container.appendChild(group);
  });
}

function _addIssueRow(container, formKey, iss, idx) {
  // Remove empty-state placeholder if present
  const empty = container.querySelector('.mgr-empty-row');
  if (empty) empty.remove();

  const cfg = SEV_CFG[iss.sev] || SEV_CFG.low;
  const row = document.createElement('div');
  row.className = `mgr-row mgr-row--${iss.sev}`;
  row.dataset.sev = iss.sev;
  row.innerHTML = `
    <div class="mgr-row-top">
      <select class="mgr-sev-select">
        <option value="high" ${iss.sev === 'high' ? 'selected' : ''}>High</option>
        <option value="medium" ${iss.sev === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low" ${iss.sev === 'low' ? 'selected' : ''}>Low</option>
      </select>
      <span class="mgr-row-title" contenteditable="true" spellcheck="false">${iss.title}</span>
      <button class="mgr-delete-btn" title="Delete">×</button>
    </div>
    <div class="mgr-row-body" contenteditable="true" spellcheck="false">${iss.body}</div>
    ${iss.ref ? `<div class="mgr-row-ref">${iss.ref}</div>` : ''}
  `;

  row.querySelector('.mgr-delete-btn').addEventListener('click', () => {
    row.remove();
    const parent = container.closest('.mgr-group');
    if (!container.querySelector('.mgr-row')) {
      container.innerHTML = '<div class="mgr-empty-row">No issues — form is clean ✓</div>';
    }
    if (parent) _updateGroupCount(parent.closest('#mgr-issue-groups'), parent.dataset.group);
    _markChanged();
  });

  row.querySelector('.mgr-sev-select').addEventListener('change', e => {
    row.dataset.sev = e.target.value;
    row.className = `mgr-row mgr-row--${e.target.value}`;
    _markChanged();
  });

  row.querySelector('.mgr-row-title').addEventListener('input', _markChanged);
  row.querySelector('.mgr-row-body').addEventListener('input', _markChanged);

  container.appendChild(row);
}

function _updateGroupCount(listSection, formKey) {
  const group = listSection?.querySelector(`[data-group="${formKey}"]`);
  if (!group) return;
  const n = group.querySelectorAll('.mgr-row').length;
  const countEl = group.querySelector(`[data-count="${formKey}"]`);
  if (countEl) {
    countEl.textContent = `${n} issue${n !== 1 ? 's' : ''}`;
    countEl.className = `mgr-group-count ${n ? 'mgr-count--warn' : 'mgr-count--none'}`;
  }
}

function _markChanged() {
  if (modalSaveBtn) { modalSaveBtn.disabled = false; }
}

export async function saveModal() {
  const pendingBody = document.querySelector('#mgr-add-body')?.value.trim();
  const pendingSev  = document.querySelector('#mgr-add-sev')?.value || 'medium';

  // If there's a pending issue and AI is ready, detect which forms it belongs to
  if (pendingBody) {
    if (getState() !== 'ready') {
      alert('AI model is still loading — please wait before saving a new issue.');
      return;
    }

    if (modalSaveBtn) { modalSaveBtn.textContent = 'Detecting…'; modalSaveBtn.disabled = true; }

    const formKeys   = Object.keys(FORMS);
    const listSection = document.getElementById('mgr-issue-groups');
    const title       = pendingBody.split('\n')[0].trim().slice(0, 80) || pendingBody.slice(0, 80);

    await detectAffectedForms(pendingBody, formKeys, null, (rawResponse) => {
      const matched = formKeys.filter(k => {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${esc}\\b`, 'i').test(rawResponse);
      });
      matched.forEach(formKey => {
        const group = listSection?.querySelector(`[data-group="${formKey}"]`);
        if (group) _addIssueRow(group.querySelector('.mgr-rows'), formKey, { sev: pendingSev, title, body: pendingBody, ref: '' }, -1);
        _updateGroupCount(listSection, formKey);
      });
    });

    if (modalSaveBtn) { modalSaveBtn.textContent = 'Save Changes'; }
  }

  // Commit all grouped rows to the store
  const groups = document.querySelectorAll('#mgr-issue-groups .mgr-group');
  groups.forEach(group => {
    const formKey = group.dataset.group;
    const rows    = group.querySelectorAll('.mgr-row');
    const issues  = Array.from(rows).map(row => ({
      sev:   row.dataset.sev || 'medium',
      title: row.querySelector('.mgr-row-title')?.textContent.trim() || '',
      body:  row.querySelector('.mgr-row-body')?.textContent.trim()  || '',
      ref:   row.querySelector('.mgr-row-ref')?.textContent.trim()   || '',
    })).filter(i => i.title);
    replaceIssues(formKey, issues);
  });

  refreshNavBadges();
  if (_currentForm) {
    _renderTopStrip(_currentForm);
    _maybeRunAnalysis(_currentForm, true);
  }

  if (modalSaveBtn) modalSaveBtn.disabled = true;
  closeModal();
}
window.saveModal = saveModal;

export function closeModal() {
  modalOverlay.classList.add('hidden');
  modalOverlay.classList.remove('flex');
}

// Expose to inline HTML onclick attributes
window.openModal  = openModal;
window.closeModal = closeModal;
window.saveModal  = saveModal;

// Close on click-outside
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Boot ──────────────────────────────────────────────────────────────────────
export async function init() {
  // Check WebGPU
  if (!navigator.gpu) {
    setSidebarAI('error', 'No WebGPU');
  }

  // Build sidebar nav from data
  buildSidebar();

  // Start loading AI model immediately on page load
  try {
    await loadModel();
  } catch {
    // error state already emitted via callback
  }
}
