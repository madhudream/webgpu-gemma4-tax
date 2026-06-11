// ─────────────────────────────────────────────────────────────────────────────
// <voice-controls> — mic toggle + interim transcript display.
// Emits "voice-final" with { text } when the speech session ends with a
// non-empty transcript. Emits "voice-error" with { error } on STT errors.
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';
import { isSupported, createSession } from '../voice.js';

class VoiceControls extends LitElement {
  static properties = {
    state:    { state: true },   // 'idle' | 'listening' | 'unsupported'
    interim:  { state: true },
    error:    { state: true }
  };

  static styles = css`
    :host {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.85rem 1rem;
      background: var(--panel, #161616);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 12px;
      box-shadow: var(--shadow, none);
      color: var(--text, #e8e8e8);
    }
    .mic {
      width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid var(--border, #2a2a2a);
      background: var(--input-bg, #0d0d0d);
      cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.25rem;
      transition: background .15s, border-color .15s, transform .15s;
    }
    .mic:hover { border-color: var(--accent, #6366f1); }
    .mic.listening {
      background: var(--accent, #6366f1); color: var(--accent-text, #fff);
      border-color: var(--accent, #6366f1);
      animation: rec-pulse 1.2s infinite;
    }
    @keyframes rec-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); }
      50%      { box-shadow: 0 0 0 10px rgba(99,102,241,0);   }
    }
    .mic:disabled { opacity: 0.4; cursor: not-allowed; }

    .info { flex: 1; min-width: 0; }
    .label { font-size: 0.7rem; color: var(--muted, #888); letter-spacing: 0.04em; }
    .transcript {
      font-size: 0.85rem; color: var(--text-strong, #fff);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-top: 0.15rem;
    }
    .transcript.placeholder { color: var(--muted-2, #666); font-style: italic; }
    .err { color: var(--err, #ef4444); font-size: 0.75rem; }
  `;

  constructor() {
    super();
    this.state    = isSupported() ? 'idle' : 'unsupported';
    this.interim  = '';
    this.error    = '';
    this._session = null;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!isSupported()) this.state = 'unsupported';
  }
  disconnectedCallback() {
    this._session?.abort();
    this._session = null;
    super.disconnectedCallback();
  }

  toggle() {
    if (this.state === 'unsupported') return;
    if (this.state === 'listening') {
      this._session?.stop();
      return;
    }
    this.error   = '';
    this.interim = '';
    this.state   = 'listening';
    this._session = createSession({
      onInterim: (t) => { this.interim = t; this.requestUpdate(); },
      onFinal:   (t) => {
        this.dispatchEvent(new CustomEvent('voice-final', {
          detail: { text: t }, bubbles: true, composed: true
        }));
      },
      onError: (err) => {
        this.error = err;
        this.state = 'idle';
        this.dispatchEvent(new CustomEvent('voice-error', {
          detail: { error: err }, bubbles: true, composed: true
        }));
      },
      onEnd: () => {
        this.state = 'idle';
        this._session = null;
      }
    });
    this._session.start();
  }

  render() {
    const listening = this.state === 'listening';
    const unsupported = this.state === 'unsupported';
    const showInterim = !!this.interim;

    return html`
      <button class="mic ${listening ? 'listening' : ''}"
              ?disabled=${unsupported}
              title=${unsupported ? 'Speech recognition not available' : (listening ? 'Stop' : 'Tap to speak')}
              @click=${() => this.toggle()}>
        ${listening ? '◼' : '🎙'}
      </button>
      <div class="info">
        <div class="label">
          ${unsupported
            ? 'Speech recognition unavailable in this browser'
            : (listening ? 'Listening… click ◼ to stop' : 'Tap mic, then describe a chart')}
        </div>
        ${this.error
          ? html`<div class="err">Error: ${this.error}</div>`
          : html`<div class="transcript ${showInterim ? '' : 'placeholder'}">
              ${showInterim ? this.interim : 'Try: "render a bar chart of monthly sales or fill 10,000 in wages"'}
            </div>`}
      </div>
    `;
  }
}

customElements.define('voice-controls', VoiceControls);
