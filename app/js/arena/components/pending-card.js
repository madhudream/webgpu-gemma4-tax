// ─────────────────────────────────────────────────────────────────────────────
// <pending-card> — Lit placeholder shown while the agent is preparing a render
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

class PendingCard extends LitElement {
  static properties = {
    label:    { type: String },
    progress: { type: Number }
  };

  static styles = css`
    :host {
      display: flex; flex-direction: column; justify-content: center;
      height: 100%; min-height: 0; gap: 0.8rem;
      color: var(--text, #e8e8e8);
    }
    .label {
      font-size: 0.78rem; color: var(--muted, #888);
      display: flex; align-items: center; gap: 0.5rem;
    }
    .spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid var(--border, #2a2a2a);
      border-top-color: var(--accent, #6366f1);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .bar {
      height: 4px; background: var(--border, #2a2a2a);
      border-radius: 2px; overflow: hidden;
    }
    .fill {
      height: 100%; background: var(--accent, #6366f1);
      width: 0%; transition: width 0.3s ease;
    }
    .pct {
      font-size: 0.7rem; color: var(--muted, #888);
      align-self: flex-end;
    }
  `;

  constructor() {
    super();
    this.label    = 'Thinking…';
    this.progress = 0;
  }

  render() {
    const pct = Math.max(0, Math.min(100, this.progress));
    return html`
      <div class="label"><span class="spinner"></span><span>${this.label}</span></div>
      <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      <div class="pct">${Math.round(pct)}%</div>
    `;
  }
}

customElements.define('pending-card', PendingCard);
