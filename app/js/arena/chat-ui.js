// ─────────────────────────────────────────────────────────────────────────────
// chat-ui.js — chat panel rendering
// ─────────────────────────────────────────────────────────────────────────────

let _messagesEl = null;
let _inputEl    = null;
let _sendEl     = null;
let _onSubmit   = null;
let _busy       = false;

export function initChatUI({ onSubmit }) {
  _messagesEl = document.getElementById('chat-messages');
  _inputEl    = document.getElementById('chat-input');
  _sendEl     = document.getElementById('chat-send-btn');
  _onSubmit   = onSubmit;

  _sendEl.addEventListener('click', _submit);
  _inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _submit();
    }
  });
}

function _submit() {
  if (_busy) return;
  const text = _inputEl.value.trim();
  if (!text) return;
  _inputEl.value = '';
  _onSubmit?.(text);
}

export function setBusy(busy) {
  _busy = busy;
  _inputEl.disabled = busy;
  _sendEl.disabled  = busy;
}

export function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg--user';
  div.textContent = text;
  _messagesEl.appendChild(div);
  _scroll();
}

export function addAssistantMessage(text = '') {
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg--assistant';
  div.textContent = text;
  _messagesEl.appendChild(div);
  _scroll();
  return {
    append: (chunk) => { div.textContent += chunk; _scroll(); },
    set:    (val)   => { div.textContent  = val;   _scroll(); }
  };
}

export function addErrorMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg--error';
  div.textContent = text;
  _messagesEl.appendChild(div);
  _scroll();
}

export function addToolBubble({ name, args }) {
  const det = document.createElement('details');
  det.className = 'chat-tool';
  det.open = false;

  const sum = document.createElement('summary');
  sum.innerHTML = `
    <span>tool</span>
    <span class="chat-tool__name">${name}</span>
    <span class="chat-tool__status">…</span>
  `;
  det.appendChild(sum);

  const body = document.createElement('pre');
  body.textContent = `args: ${_fmt(args)}`;
  det.appendChild(body);

  _messagesEl.appendChild(det);
  _scroll();

  const statusEl = sum.querySelector('.chat-tool__status');

  return {
    resolve: (result) => {
      statusEl.textContent = 'ok';
      statusEl.classList.add('chat-tool__status--ok');
      body.textContent = `args:   ${_fmt(args)}\nresult: ${_fmt(result)}`;
    },
    reject: (err) => {
      statusEl.textContent = 'err';
      statusEl.classList.add('chat-tool__status--err');
      body.textContent = `args:  ${_fmt(args)}\nerror: ${err?.message || String(err)}`;
      det.open = true;
    }
  };
}

function _fmt(v) {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

function _scroll() {
  _messagesEl.scrollTop = _messagesEl.scrollHeight;
}

export function clearChat() {
  _messagesEl.innerHTML = '';
}
