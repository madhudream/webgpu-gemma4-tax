// ─────────────────────────────────────────────────────────────────────────────
// <bar-chart> — Lit component wrapping Chart.js bar
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/auto/+esm';

class BarChart extends LitElement {
  static properties = {
    title:  { type: String },
    labels: { type: Array  },
    values: { type: Array  },
    yLabel: { type: String }
  };

  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 0.5rem; }
    h3 { margin: 0; font-size: 0.85rem; color: #fff; font-weight: 600; }
    .wrap { flex: 1; min-height: 0; position: relative; }
    canvas { width: 100% !important; height: 100% !important; }
  `;

  constructor() {
    super();
    this.title  = '';
    this.labels = [];
    this.values = [];
    this.yLabel = '';
    this._chart = null;
  }

  firstUpdated() { this._draw(); }
  updated()      { this._draw(); }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._chart?.destroy();
    this._chart = null;
  }

  _draw() {
    const cv = this.renderRoot.querySelector('canvas');
    if (!cv) return;
    this._chart?.destroy();
    const cs = getComputedStyle(document.documentElement);
    const tick   = cs.getPropertyValue('--muted').trim()  || '#888';
    const grid   = cs.getPropertyValue('--border').trim() || '#222';
    const accent = cs.getPropertyValue('--accent').trim() || '#6366f1';
    this._chart = new Chart(cv, {
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: [{
          label: this.yLabel || 'value',
          data: this.values,
          backgroundColor: accent,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: !!this.yLabel, labels: { color: tick } } },
        scales: {
          x: { ticks: { color: tick }, grid: { color: grid } },
          y: { ticks: { color: tick }, grid: { color: grid } }
        }
      }
    });
  }

  render() {
    return html`
      ${this.title ? html`<h3>${this.title}</h3>` : null}
      <div class="wrap"><canvas></canvas></div>
    `;
  }
}

customElements.define('bar-chart', BarChart);
