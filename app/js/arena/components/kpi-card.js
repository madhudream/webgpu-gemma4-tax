// ─────────────────────────────────────────────────────────────────────────────
// <kpi-card> — Lit component, single big KPI number
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

class KpiCard extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    delta: { type: String },
    tone:  { type: String }
  };

  static styles = css`
    :host {
      display: flex; flex-direction: column; justify-content: space-between;
      height: 100%; min-height: 0; gap: 0.6rem;
    }
    .label { font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
    .value { font-size: 1.6rem; color: #fff; font-weight: 600; line-height: 1.1; word-break: break-word; }
    .delta {
      font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px;
      align-self: flex-start;
      background: #1d1d1d; color: #aaa; border: 1px solid #2a2a2a;
    }
    .delta.good { color: #22c55e; border-color: #22c55e44; }
    .delta.bad  { color: #ef4444; border-color: #ef444444; }
  `;

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.delta = '';
    this.tone  = 'neutral';
  }

  render() {
    const toneCls = this.tone === 'good' ? 'good' : this.tone === 'bad' ? 'bad' : '';
    return html`
      <div class="label">${this.label}</div>
      <div class="value">${this.value}</div>
      ${this.delta ? html`<div class="delta ${toneCls}">${this.delta}</div>` : null}
    `;
  }
}

customElements.define('kpi-card', KpiCard);
