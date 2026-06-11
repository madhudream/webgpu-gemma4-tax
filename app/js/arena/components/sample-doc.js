// ─────────────────────────────────────────────────────────────────────────────
// <sample-doc> — Lit component rendering a sample tax-help article.
// Page Q&A example uses this as its workspace; tools read/highlight sections.
// ─────────────────────────────────────────────────────────────────────────────

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm';

export const SECTIONS = [
  {
    id: 'overview',
    title: 'What is Form W-2?',
    body: 'Form W-2, the Wage and Tax Statement, is issued by employers to report an employee\'s annual wages and the amount of taxes withheld from their paycheck. Employers must send a copy to both the employee and the Social Security Administration. Employees use the W-2 when filing their federal and state tax returns.'
  },
  {
    id: 'who-issues',
    title: 'Who issues a W-2?',
    body: 'Any employer who paid an employee at least $600 in wages, or withheld any federal income, social security, or Medicare tax, must issue a W-2. This applies even if the employee no longer works there. Independent contractors do not receive a W-2 — they receive Form 1099-NEC instead.'
  },
  {
    id: 'when',
    title: 'When do W-2s arrive?',
    body: 'Employers must furnish W-2s to employees by January 31st of the following tax year. They must also file copies with the Social Security Administration by January 31st. If you have not received your W-2 by mid-February, contact your employer first; if that fails, contact the IRS at 1-800-829-1040.'
  },
  {
    id: 'errors',
    title: 'Common W-2 errors',
    body: 'The most frequent errors are: incorrect Social Security number, misspelled employee name, wrong wages in Box 1, missing state ID, and an EIN that does not match payroll filings. If you spot an error, contact your employer to issue a corrected Form W-2c. Do not file your return with a known incorrect W-2.'
  },
  {
    id: 'deadlines',
    title: 'Filing deadlines',
    body: 'The standard filing deadline for individual federal income tax returns is April 15. If April 15 falls on a weekend or legal holiday, the deadline shifts to the next business day. Taxpayers can request an automatic six-month extension by filing Form 4868, moving the deadline to October 15. The extension covers filing only — taxes owed are still due April 15.'
  },
  {
    id: 'state',
    title: 'State considerations',
    body: 'Most states tax wages but rules vary. California, New York, and Oregon have high state income tax rates. Texas, Florida, Washington, Nevada, South Dakota, Wyoming, Alaska, and Tennessee have no state income tax on wages. Some states like New Hampshire only tax dividends and interest. Always check your state revenue department for the current year\'s rates and brackets.'
  }
];

class SampleDoc extends LitElement {
  static properties = {
    highlightId:      { state: true },
    highlightSnippet: { state: true }
  };

  static styles = css`
    :host {
      display: block; height: 100%; min-height: 0; overflow: auto;
      color: var(--text, #e8e8e8);
    }
    .doc {
      max-width: 720px; margin: 0 auto;
      background: var(--panel, #161616);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 12px;
      padding: 1.5rem 1.75rem;
    }
    .doc-meta {
      color: var(--muted, #888); font-size: 0.7rem;
      letter-spacing: 0.06em; text-transform: uppercase;
      margin-bottom: 0.4rem;
    }
    .doc-title { margin: 0 0 1.25rem; font-size: 1.15rem; font-weight: 600; color: var(--text, #fff); }

    .section { padding: 0.6rem 0.8rem; border-radius: 6px; transition: background 0.3s; margin: 0 -0.8rem; }
    .section.highlighted { background: rgba(99,102,241,0.10); border-left: 2px solid var(--accent, #6366f1); }
    .section h3 {
      font-size: 0.78rem; font-weight: 600; color: var(--accent, #6366f1);
      margin: 0 0 0.4rem; letter-spacing: 0.04em; text-transform: uppercase;
    }
    .section p {
      margin: 0; font-size: 0.85rem; line-height: 1.65; color: var(--text, #ddd);
    }
    .section + .section { margin-top: 0.6rem; }

    mark {
      background: rgba(234,179,8,0.35);
      color: inherit;
      padding: 0 2px; border-radius: 2px;
    }
  `;

  constructor() {
    super();
    this.highlightId      = null;
    this.highlightSnippet = null;
  }

  highlight(sectionId, snippet) {
    this.highlightId      = sectionId;
    this.highlightSnippet = snippet || null;
    if (sectionId) {
      const el = this.renderRoot.querySelector(`#sec-${sectionId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  _renderBody(sec) {
    if (this.highlightId === sec.id && this.highlightSnippet) {
      const idx = sec.body.toLowerCase().indexOf(this.highlightSnippet.toLowerCase());
      if (idx >= 0) {
        const before = sec.body.slice(0, idx);
        const match  = sec.body.slice(idx, idx + this.highlightSnippet.length);
        const after  = sec.body.slice(idx + this.highlightSnippet.length);
        return html`${before}<mark>${match}</mark>${after}`;
      }
    }
    return sec.body;
  }

  render() {
    return html`
      <div class="doc">
        <div class="doc-meta">Tax help · sample article</div>
        <h2 class="doc-title">Form W-2 — A Quick Guide</h2>
        ${SECTIONS.map(sec => html`
          <div id="sec-${sec.id}" class="section ${this.highlightId === sec.id ? 'highlighted' : ''}">
            <h3>${sec.title}</h3>
            <p>${this._renderBody(sec)}</p>
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('sample-doc', SampleDoc);
