// ─────────────────────────────────────────────────────────────────────────────
// main.js — arena entry point
// ─────────────────────────────────────────────────────────────────────────────
//
// Wiring:
//   sidebar  → onSelect → workspace.activate → re-bind active example
//   chat     → handleUserMessage → runAgent(active example's tools)
//   model    → loaded once, reused across examples
//
// Per-example pending card UX:
//   The chart-based examples (chart-stitcher, auto-dashboard) inject
//   #canvas-grid into the workspace. We mount a <pending-card> there only
//   when the workspace exposes a canvas, so non-chart examples (form filler,
//   page q&a, code sandbox) don't get phantom cards.

import { initSidebar, setActive as setSidebarActive } from './sidebar.js';
import { initWorkspace, activate as activateExample, getActiveExample } from './workspace.js';
import { initChatUI, setBusy, addUserMessage, addAssistantMessage, addErrorMessage, addToolBubble, clearChat } from './chat-ui.js';
import { loadModel, setStateCallback, getState } from './model.js';
import { runAgent } from './agent.js';
import { mountComponent, updateMount, unmountSlot, getSlot } from './canvas.js';
import '../theme.js';   // auto-init
import './components/pending-card.js';   // eager so we can mount immediately

const DEFAULT_EXAMPLE_ID = 'chart-stitcher';

let _history    = [];
let _pendingId  = null;
let _toolCount  = 0;

export async function startArena() {
  if (!navigator.gpu) return;   // wall already shown

  // ── UI wiring ────────────────────────────────────────────────────────────
  initSidebar({
    container: document.getElementById('arena-sidebar'),
    activeId:  DEFAULT_EXAMPLE_ID,
    onSelect:  handleExampleSelect
  });

  initWorkspace({
    container:    document.getElementById('ex-workspace'),
    headerEl:     document.getElementById('ex-header'),
    presetsEl:    document.getElementById('ex-presets'),
    accentTarget: document.documentElement,
    onPreset:     handlePreset
  });

  initChatUI({ onSubmit: handleUserMessage });

  // ── Model status indicator ───────────────────────────────────────────────
  const dot = document.getElementById('ai-dot');
  const txt = document.getElementById('ai-status-text');
  setStateCallback((state, detail) => {
    dot.classList.remove('ready', 'error', 'busy');
    if (state === 'ready')   dot.classList.add('ready');
    if (state === 'error')   dot.classList.add('error');
    if (state === 'loading') dot.classList.add('busy');
    txt.textContent = detail || state;
  });

  document.getElementById('chat-clear-btn').addEventListener('click', () => {
    _history = [];
    _toolCount = 0;
    if (_pendingId) { unmountSlot(_pendingId); _pendingId = null; }
    clearChat();
    // Also re-setup the active example so its workspace is reset.
    const active = getActiveExample();
    if (active) activateExample(active.id);
  });

  // ── Activate default example before model finishes loading so the user
  //     sees something immediately. Chat is disabled until model ready.
  await activateExample(DEFAULT_EXAMPLE_ID).catch(err => {
    addErrorMessage(`Failed to load example: ${err.message}`);
  });

  setBusy(true);
  loadModel()
    .then(() => setBusy(false))
    .catch((err) => {
      setBusy(false);
      addErrorMessage(`Model load failed: ${err.message}`);
    });
}

// ── Example switching ────────────────────────────────────────────────────────
async function handleExampleSelect(id) {
  // Reset chat + history + any pending placeholder.
  _history = [];
  _toolCount = 0;
  if (_pendingId) { unmountSlot(_pendingId); _pendingId = null; }
  clearChat();
  setSidebarActive(id);
  try {
    await activateExample(id);
  } catch (err) {
    addErrorMessage(`Failed to load example: ${err.message}`);
  }
}

function handlePreset(text) {
  // Submit directly — don't leave the preset text sitting in the input.
  document.getElementById('chat-input').value = '';
  handleUserMessage(text);
}

// ── Chat → Agent ─────────────────────────────────────────────────────────────
async function handleUserMessage(text) {
  if (getState() !== 'ready') {
    addErrorMessage('Model is not ready yet — wait for the status to turn green.');
    return;
  }
  const ex = getActiveExample();
  if (!ex) {
    addErrorMessage('No example active.');
    return;
  }

  addUserMessage(text);
  setBusy(true);
  _toolCount = 0;

  // Mount a pending card if the workspace exposes a canvas grid.
  const hasCanvas = !!document.getElementById('canvas-grid');
  if (hasCanvas) {
    _pendingId = mountComponent(
      'pending-card',
      { label: 'Thinking…', progress: 5 },
      { col: 1, colspan: 6, rowspan: 4 }
    );
  } else {
    _pendingId = null;
  }

  try {
    await runAgent(text, _history, {
      tools:        ex.tools,
      runTool:      ex.runTool,
      systemPrompt: ex.systemPrompt
    }, {
      onToolStart:        onToolStart,
      onAssistantMessage: (msg) => addAssistantMessage(msg)
    });
  } catch (err) {
    console.error(err);
    addErrorMessage(`Agent error: ${err.message}`);
  } finally {
    setBusy(false);
    if (_pendingId) {
      unmountSlot(_pendingId);
      _pendingId = null;
    }
  }
}

function onToolStart(call) {
  _toolCount++;

  if (_pendingId) {
    // Both `render` and `render_html` claim the pending slot. Copy its
    // coords into the call args so the real component lands in the same
    // place, then drop the placeholder.
    if (call.name === 'render' || call.name === 'render_html') {
      if (!call.args.slot) call.args.slot = getSlot(_pendingId) || {};
      unmountSlot(_pendingId);
      _pendingId = null;
    } else {
      const labelMap = {
        list_components: 'Looking at available components…',
        list_datasets:   'Checking datasets…',
        get_dataset:     `Loading dataset (${call.args.id || ''})…`,
        load_component:  `Loading component (${call.args.name || ''})…`,
        unmount:         'Removing a component…',
        list_mounted:    'Checking canvas state…',
        finish:          'Wrapping up…'
      };
      const label = labelMap[call.name] || `Calling ${call.name}…`;
      const progress = Math.min(90, 10 + _toolCount * 12);
      updateMount(_pendingId, { label, progress });
    }
  }

  return addToolBubble({ name: call.name, args: call.args });
}
