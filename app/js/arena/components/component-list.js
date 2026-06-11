// ─────────────────────────────────────────────────────────────────────────────
// <component-list> — names-only list of registered web-components.
// Click → emits "use-component" with { name }.
// Mirrors <dataset-list> but for the chart component catalog.
// ─────────────────────────────────────────────────────────────────────────────
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';
import { CATALOG } from '../registry.js';

class ComponentList extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column;
      min-height: 0;
      background: var(--panel, #161616);
      border-top: 1px solid var(--border, #2a2a2a);
      overflow: hidden;
    }
    .head {
      padding: 0.6rem 1rem 0.4rem;
      font-size: 0.7rem; color: var(--muted, #888);
      letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600;
      border-bottom: 1px solid var(--border-soft, #1f1f1f);
    }
    .list { flex: 1; min-height: 0; overflow-y: auto; padding: 0.5rem 0.6rem; }
    .c {
      display: block; width: 100%; text-align: left;
      background: transparent; border: 1px solid var(--border, #2a2a2a);
      color: var(--text, #e8e8e8);
      border-radius: 6px; padding: 0.4rem 0.65rem;
      cursor: pointer; font-family: ui-monospace, monospace; font-size: 0.78rem;
      margin-bottom: 0.3rem;
      transition: border-color .15s, background .15s, transform .1s;
    }
    .c:hover {
      border-color: var(--accent, #6366f1);
      background: var(--panel-2, #1d1d1d);
      transform: translateY(-1px);
    }
  `;

  _onPick(name) {
    this.dispatchEvent(new CustomEvent('use-component', {
      detail: { name }, bubbles: true, composed: true
    }));
  }

  render() {
    const names = Object.keys(CATALOG);
    return html`
      <div class="head">Components · ${names.length}</div>
      <div class="list">
        ${names.map(n => html`
          <button class="c" @click=${() => this._onPick(n)}>${n}</button>
        `)}
      </div>
    `;
  }
}

customElements.define('component-list', ComponentList);
