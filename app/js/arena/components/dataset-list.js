// ─────────────────────────────────────────────────────────────────────────────
// <dataset-list> — list of available mock datasets shown alongside the canvas.
// Click a dataset → emits a "use-dataset" custom event with { id, label } so
// the active example can drop a starter prompt into the chat.
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';
import { DATASETS } from '../datasets.js';

class DatasetList extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column;
      height: 100%; min-height: 0;
      background: var(--panel, #161616);
      border-left: 1px solid var(--border, #2a2a2a);
      overflow: hidden;
    }
    .head {
      padding: 0.75rem 1rem 0.5rem;
      font-size: 0.7rem; color: var(--muted, #888);
      letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600;
      border-bottom: 1px solid var(--border-soft, #1f1f1f);
    }
    .list { flex: 1; min-height: 0; overflow-y: auto; padding: 0.6rem; }
    .ds {
      display: block; width: 100%; text-align: left;
      background: transparent; border: 1px solid var(--border, #2a2a2a);
      color: var(--text, #e8e8e8);
      border-radius: 8px; padding: 0.6rem 0.7rem;
      cursor: pointer; font-family: inherit;
      margin-bottom: 0.4rem;
      transition: border-color .15s, background .15s, transform .1s;
    }
    .ds:hover { border-color: var(--accent, #6366f1); background: var(--panel-2, #1d1d1d); transform: translateY(-1px); }
    .ds__id {
      font-size: 0.78rem; font-weight: 600; color: var(--text-strong, #fff);
      margin-bottom: 0.2rem;
    }
    .ds__desc { font-size: 0.7rem; color: var(--muted, #888); line-height: 1.45; }
    .ds__meta { font-size: 0.65rem; color: var(--accent, #6366f1); margin-top: 0.3rem; font-family: ui-monospace, monospace; }
  `;

  _onPick(id) {
    this.dispatchEvent(new CustomEvent('use-dataset', {
      detail: { id }, bubbles: true, composed: true
    }));
  }

  render() {
    const entries = Object.entries(DATASETS);
    return html`
      <div class="head">Datasets · ${entries.length}</div>
      <div class="list">
        ${entries.map(([id, meta]) => html`
          <button class="ds" @click=${() => this._onPick(id)}>
            <div class="ds__id">${id}</div>
            <div class="ds__desc">${meta.description}</div>
            <div class="ds__meta">${Object.keys(meta.schema).join(' · ')}</div>
          </button>
        `)}
      </div>
    `;
  }
}

customElements.define('dataset-list', DatasetList);
