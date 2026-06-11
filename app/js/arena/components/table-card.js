// ─────────────────────────────────────────────────────────────────────────────
// <table-card> — Lit table for dashboards (categorical breakdowns)
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

class TableCard extends LitElement {
  static properties = {
    title:   { type: String },
    columns: { type: Array  },     // ["Label", "Value"]
    rows:    { type: Array  }      // [[ "Salaries", "$320k" ], ...]
  };

  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 0.5rem; color: var(--text, #e8e8e8); }
    h3 { margin: 0; font-size: 0.85rem; color: var(--text, #fff); font-weight: 600; }
    .scroll { flex: 1; min-height: 0; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    th, td { padding: 0.4rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border, #2a2a2a); }
    th { color: var(--muted, #888); font-weight: 600; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.06em; position: sticky; top: 0; background: var(--panel, #161616); }
    tr:last-child td { border-bottom: none; }
    td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--accent, #6366f1); font-weight: 600; }
  `;

  constructor() {
    super();
    this.title   = '';
    this.columns = [];
    this.rows    = [];
  }

  render() {
    return html`
      ${this.title ? html`<h3>${this.title}</h3>` : null}
      <div class="scroll">
        <table>
          <thead><tr>${this.columns.map(c => html`<th>${c}</th>`)}</tr></thead>
          <tbody>
            ${this.rows.map(r => html`<tr>${r.map(c => html`<td>${c}</td>`)}</tr>`)}
          </tbody>
        </table>
      </div>
    `;
  }
}

customElements.define('table-card', TableCard);
