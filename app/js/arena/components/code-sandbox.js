// ─────────────────────────────────────────────────────────────────────────────
// <code-sandbox> — Lit component with code editor + worker-based JS sandbox.
// Code is executed in a Web Worker (no DOM, no fetch by default), and the
// result + console.log output are returned via postMessage.
// ─────────────────────────────────────────────────────────────────────────────

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

// Build the worker script as a Blob URL so we don't need a separate file.
// The worker captures console.log/info/warn/error into a `logs` array, runs
// the user's code via `(0, eval)(code)`, and returns the last expression
// alongside the captured logs. A 3s timeout aborts runaway loops.
const WORKER_SOURCE = `
self.addEventListener('message', (e) => {
  const { code, id } = e.data;
  const logs = [];
  const fmt = (args) => args.map(a => {
    try { return typeof a === 'string' ? a : JSON.stringify(a); }
    catch { return String(a); }
  }).join(' ');
  const origConsole = self.console;
  self.console = {
    log:   (...a) => logs.push({ level: 'log',   text: fmt(a) }),
    info:  (...a) => logs.push({ level: 'info',  text: fmt(a) }),
    warn:  (...a) => logs.push({ level: 'warn',  text: fmt(a) }),
    error: (...a) => logs.push({ level: 'error', text: fmt(a) }),
  };
  try {
    const result = (0, eval)(code);
    Promise.resolve(result).then((r) => {
      let serialized;
      try { serialized = JSON.parse(JSON.stringify(r)); }
      catch { serialized = String(r); }
      self.postMessage({ id, ok: true, result: serialized, logs });
    }).catch((err) => {
      self.postMessage({ id, ok: false, error: String(err?.message || err), logs });
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err), logs });
  } finally {
    self.console = origConsole;
  }
});
`;

const _workerBlobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'application/javascript' }));

export function runInSandbox(code, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const w = new Worker(_workerBlobUrl);
    const id = String(Math.random());
    let done = false;

    const finish = (payload) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.terminate();
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: `timeout after ${timeoutMs}ms`, logs: [] });
    }, timeoutMs);

    w.addEventListener('message', (e) => {
      if (e.data?.id !== id) return;
      finish(e.data);
    });
    w.addEventListener('error', (e) => {
      finish({ ok: false, error: e.message || 'worker error', logs: [] });
    });

    w.postMessage({ code, id });
  });
}

class CodeSandbox extends LitElement {
  static properties = {
    code:   { type: String },
    result: { type: Object, state: true },
    busy:   { type: Boolean, state: true }
  };

  static styles = css`
    :host {
      display: flex; flex-direction: column; height: 100%; min-height: 0;
      gap: 0.75rem; color: var(--text, #e8e8e8);
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 0.7rem; color: var(--muted, #888);
      letter-spacing: 0.06em; text-transform: uppercase;
    }
    .header-tag { color: var(--accent, #6366f1); font-weight: 600; }
    .panel {
      background: var(--panel, #161616);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 8px;
      flex: 1; min-height: 0;
      display: flex; flex-direction: column;
    }
    .panel--code {
      flex: 1.2;
    }
    .panel-title {
      padding: 0.4rem 0.75rem; font-size: 0.7rem; color: var(--muted, #888);
      border-bottom: 1px solid var(--border, #2a2a2a);
      letter-spacing: 0.04em;
    }
    pre {
      margin: 0; padding: 0.75rem 0.9rem; flex: 1; min-height: 0;
      overflow: auto; font-size: 0.78rem; line-height: 1.55;
      color: var(--text, #ddd);
    }
    .placeholder {
      color: var(--muted, #888); font-style: italic; padding: 1rem; font-size: 0.8rem;
    }
    .out-result {
      padding: 0.6rem 0.9rem; font-size: 0.82rem;
      border-top: 1px solid var(--border, #2a2a2a);
      color: var(--accent, #6366f1); font-weight: 600;
      font-variant-numeric: tabular-nums;
      overflow: auto; max-height: 5rem;
    }
    .out-result.err { color: var(--err, #ef4444); }
    .log {
      font-size: 0.74rem; padding: 0.15rem 0.9rem; line-height: 1.5;
      border-bottom: 1px solid color-mix(in srgb, var(--border, #2a2a2a) 60%, transparent);
    }
    .log:last-child { border-bottom: none; }
    .log--warn  { color: var(--warn, #eab308); }
    .log--error { color: var(--err, #ef4444); }
    .log-prefix { color: var(--muted, #888); margin-right: 0.5rem; }
  `;

  constructor() {
    super();
    this.code = '';
    this.result = null;
    this.busy = false;
  }

  async runCode(code) {
    this.code = code;
    this.busy = true;
    this.result = null;
    this.requestUpdate();
    const r = await runInSandbox(code);
    this.busy = false;
    this.result = r;
    return r;
  }

  reset() {
    this.code = '';
    this.result = null;
  }

  render() {
    return html`
      <div class="header">
        <div>JavaScript Sandbox</div>
        <div class="header-tag">${this.busy ? 'Running…' : (this.result ? (this.result.ok ? 'OK' : 'Error') : 'Idle')}</div>
      </div>

      <div class="panel panel--code">
        <div class="panel-title">code</div>
        ${this.code
          ? html`<pre>${this.code}</pre>`
          : html`<div class="placeholder">No code yet — Gemma will write some when you ask.</div>`}
      </div>

      <div class="panel">
        <div class="panel-title">output</div>
        ${(this.result?.logs?.length ?? 0) > 0
          ? html`<div>${this.result.logs.map(l => html`
              <div class="log log--${l.level}"><span class="log-prefix">${l.level}</span>${l.text}</div>
            `)}</div>`
          : html`<div class="placeholder">No console output.</div>`}
        ${this.result
          ? html`<div class="out-result ${this.result.ok ? '' : 'err'}">
              ${this.result.ok
                ? `→ ${typeof this.result.result === 'object' ? JSON.stringify(this.result.result) : String(this.result.result)}`
                : `Error: ${this.result.error}`}
            </div>`
          : null}
      </div>
    `;
  }
}

customElements.define('code-sandbox', CodeSandbox);
