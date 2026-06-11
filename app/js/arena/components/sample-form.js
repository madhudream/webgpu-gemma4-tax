// ─────────────────────────────────────────────────────────────────────────────
// <sample-form> — Lit component for the Form Filler example
// ─────────────────────────────────────────────────────────────────────────────
// Renders a synthetic W-2-style form. Exposes a state store via the static
// `state` import below, so tools can read/write fields and the form re-renders.

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

export const FIELDS = [
  { name: 'employer_name',    label: 'Employer name',                 type: 'text',   placeholder: 'Acme Corp',
    aliases: ['employer', 'company', 'companyname', 'employername'] },
  { name: 'employer_ein',     label: 'Employer EIN',                  type: 'text',   placeholder: '00-0000000',
    aliases: ['ein', 'employerid', 'employeridentificationnumber'] },
  { name: 'employee_ssn',     label: 'Employee SSN',                  type: 'text',   placeholder: '000-00-0000',
    aliases: ['ssn', 'employeessn', 'socialsecurity', 'socialsecuritynumber'] },
  { name: 'employee_name',    label: 'Employee name',                 type: 'text',   placeholder: 'Jane Doe',
    aliases: ['name', 'employee', 'employeename', 'fullname', 'firstandlastname'] },
  { name: 'wages_box1',       label: 'Box 1 — Wages',                 type: 'number', placeholder: '0.00',
    aliases: ['wages', 'wage', 'box1', 'grosswages', 'totalwages', 'income', 'salary'] },
  { name: 'federal_tax_box2', label: 'Box 2 — Federal income tax',    type: 'number', placeholder: '0.00',
    aliases: ['federaltax', 'fedtax', 'box2', 'federalincometax', 'federalwithholding'] },
  { name: 'ss_wages_box3',    label: 'Box 3 — Social security wages', type: 'number', placeholder: '0.00',
    aliases: ['sswages', 'box3', 'socialsecuritywages'] },
  { name: 'ss_tax_box4',      label: 'Box 4 — Social security tax',   type: 'number', placeholder: '0.00',
    aliases: ['sstax', 'box4', 'socialsecuritytax'] },
  { name: 'medicare_wages',   label: 'Box 5 — Medicare wages',        type: 'number', placeholder: '0.00',
    aliases: ['medicarewages', 'box5'] },
  { name: 'medicare_tax',     label: 'Box 6 — Medicare tax',          type: 'number', placeholder: '0.00',
    aliases: ['medicaretax', 'box6'] },
  { name: 'state',            label: 'State',                         type: 'text',   placeholder: 'CA',
    aliases: ['statecode', 'usstate', 'province'] },
  { name: 'state_wages',      label: 'State wages',                   type: 'number', placeholder: '0.00',
    aliases: ['statewages', 'statesalary'] },
];

const _norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Resolve any reasonable spelling of a field key to its canonical `name`.
 * Tries: exact name, aliases, name substring, label substring. Returns null
 * if no field matches.
 */
export function resolveFieldName(input) {
  const norm = _norm(input);
  if (!norm) return null;

  // 1. Exact normalized name
  for (const f of FIELDS) if (_norm(f.name) === norm) return f.name;
  // 2. Alias hit
  for (const f of FIELDS) if ((f.aliases || []).some(a => _norm(a) === norm)) return f.name;
  // 3. Name substring (declaration order = first wins, so "wages" → wages_box1)
  for (const f of FIELDS) if (_norm(f.name).includes(norm)) return f.name;
  // 4. Label substring
  for (const f of FIELDS) if (_norm(f.label).includes(norm)) return f.name;
  return null;
}

// Simple shared state — keys are field names, values are strings.
class FormStore extends EventTarget {
  constructor() {
    super();
    this._values = Object.fromEntries(FIELDS.map(f => [f.name, '']));
    this._submitted = null;
  }
  get(name)        { return this._values[name] ?? ''; }
  set(name, value) {
    if (!(name in this._values)) throw new Error(`unknown field: ${name}`);
    this._values[name] = String(value ?? '');
    this.dispatchEvent(new CustomEvent('change', { detail: { name } }));
  }
  setMany(map) {
    for (const [k, v] of Object.entries(map)) this.set(k, v);
  }
  reset() {
    for (const k of Object.keys(this._values)) this._values[k] = '';
    this._submitted = null;
    this.dispatchEvent(new CustomEvent('change', { detail: { name: '*' } }));
  }
  submit() {
    const missing = FIELDS.filter(f => f.name.includes('name') || f.name.includes('ssn') || f.name.includes('ein'))
      .filter(f => !this._values[f.name]);
    const result = {
      ok: missing.length === 0,
      missing: missing.map(f => f.name),
      values: { ...this._values }
    };
    this._submitted = result;
    this.dispatchEvent(new CustomEvent('submit', { detail: result }));
    return result;
  }
  lastSubmission() { return this._submitted; }
}

export const formStore = new FormStore();

class SampleForm extends LitElement {
  static styles = css`
    :host {
      display: block; height: 100%; min-height: 0; overflow: auto;
      color: var(--text, #e8e8e8);
    }
    .form-card {
      background: var(--panel, #161616);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 12px;
      padding: 1.25rem;
      max-width: 720px; margin: 0 auto;
    }
    .form-head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 1rem; padding-bottom: 0.6rem;
      border-bottom: 1px solid var(--border, #2a2a2a);
    }
    .form-title { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text, #fff); }
    .form-meta  { color: var(--muted, #888); font-size: 0.7rem; }

    .grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem;
    }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field--wide { grid-column: span 2; }
    .label { font-size: 0.7rem; color: var(--muted, #888); }
    .input {
      background: var(--input-bg, #0d0d0d); color: var(--text, #e8e8e8);
      border: 1px solid var(--border, #2a2a2a); border-radius: 5px;
      padding: 0.4rem 0.6rem; font-family: inherit; font-size: 0.82rem; outline: none;
    }
    .input:focus { border-color: var(--accent, #6366f1); }
    .input.flash { animation: flash 0.6s ease; }
    @keyframes flash {
      0%   { background: rgba(99,102,241,0.3); }
      100% { background: var(--input-bg, #0d0d0d); }
    }

    .actions { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
    button.btn {
      background: var(--accent, #6366f1); color: var(--accent-text, #fff); border: none;
      padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;
      font-family: inherit; font-size: 0.85rem;
    }
    button.btn--ghost {
      background: transparent; color: var(--muted, #888);
      border: 1px solid var(--border, #2a2a2a);
    }
    button.btn--ghost:hover { color: var(--text, #fff); border-color: var(--accent, #6366f1); }

    .submission {
      margin-top: 1rem; padding: 0.7rem 0.9rem;
      border-radius: 6px; font-size: 0.78rem; line-height: 1.5;
      border: 1px solid var(--border, #2a2a2a);
    }
    .submission--ok  { border-color: var(--ok, #22c55e); color: var(--ok, #22c55e); }
    .submission--err { border-color: var(--err, #ef4444); color: var(--err, #ef4444); }
  `;

  constructor() {
    super();
    this._flash = new Set();
    this._onChange = (e) => {
      this._flash.add(e.detail.name);
      this.requestUpdate();
      setTimeout(() => { this._flash.delete(e.detail.name); this.requestUpdate(); }, 600);
    };
    this._onSubmit = () => this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    formStore.addEventListener('change', this._onChange);
    formStore.addEventListener('submit', this._onSubmit);
  }
  disconnectedCallback() {
    formStore.removeEventListener('change', this._onChange);
    formStore.removeEventListener('submit', this._onSubmit);
    super.disconnectedCallback();
  }

  _onInput(name, e) {
    formStore._values[name] = e.target.value;
    // No event dispatch — user typing shouldn't flash itself.
  }

  _renderField(f) {
    const wide = f.name === 'employer_name' || f.name === 'employee_name';
    const flashCls = this._flash.has(f.name) ? 'flash' : '';
    return html`
      <div class="field ${wide ? 'field--wide' : ''}">
        <label class="label" for="f-${f.name}">${f.label}</label>
        <input
          id="f-${f.name}"
          class="input ${flashCls}"
          type="${f.type}"
          placeholder="${f.placeholder}"
          .value=${formStore.get(f.name)}
          @input=${(e) => this._onInput(f.name, e)}
        />
      </div>
    `;
  }

  render() {
    const sub = formStore.lastSubmission();
    return html`
      <div class="form-card">
        <div class="form-head">
          <h2 class="form-title">Form W-2 — Wage and Tax Statement</h2>
          <span class="form-meta">Sample · Tax Year 2024</span>
        </div>
        <div class="grid">
          ${FIELDS.map(f => this._renderField(f))}
        </div>
        <div class="actions">
          <button class="btn btn--ghost" @click=${() => formStore.reset()}>Reset</button>
          <button class="btn" @click=${() => formStore.submit()}>Submit</button>
        </div>
        ${sub ? html`
          <div class="submission ${sub.ok ? 'submission--ok' : 'submission--err'}">
            ${sub.ok
              ? `Submitted. ${Object.values(sub.values).filter(Boolean).length} of ${FIELDS.length} fields filled.`
              : `Missing required: ${sub.missing.join(', ')}`}
          </div>
        ` : null}
      </div>
    `;
  }
}

customElements.define('sample-form', SampleForm);
