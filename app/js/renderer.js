// ─────────────────────────────────────────────────────────────────────────────
// renderer.js — Tax form HTML renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a form definition into the given container element.
 * @param {Object} formDef  Entry from FORMS
 * @param {Element} container
 */
export function renderForm(formDef, container) {
  container.innerHTML = '';

  // ── Form header ────────────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.className = 'form-header';

  const hasIssues = !!formDef.hasIssues;
  const indicatorCls  = hasIssues ? 'form-issues-indicator--warn' : 'form-issues-indicator--ok';
  const indicatorIcon = hasIssues ? '⚠' : '✓';
  const indicatorText = hasIssues ? 'Known issues found' : 'No known issues';

  hdr.innerHTML = `
    <div class="form-header-top">
      <div>
        <div class="form-agency">Internal Revenue Service</div>
        <h2 class="form-title">${formDef.title}</h2>
        <div class="form-meta">${formDef.meta}</div>
      </div>
      <div class="form-issues-indicator ${indicatorCls}">
        <span class="form-issues-indicator__icon">${indicatorIcon}</span>
        <span class="form-issues-indicator__text">${indicatorText}</span>
      </div>
    </div>
  `;
  container.appendChild(hdr);

  // ── Sections ───────────────────────────────────────────────────────────────
  formDef.sections.forEach(sec => {
    const secEl = document.createElement('div');
    secEl.className = 'form-section';

    // Section divider label
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.innerHTML = `
      <span class="divider-line"></span>
      <span class="divider-label">${sec.label}</span>
      <span class="divider-line"></span>
    `;
    secEl.appendChild(divider);

    // Field grid
    const grid = document.createElement('div');
    grid.className = 'field-grid';
    sec.fields.forEach(f => grid.appendChild(buildField(f)));
    secEl.appendChild(grid);

    container.appendChild(secEl);
  });
}

// ── Field builder ─────────────────────────────────────────────────────────────
function buildField(f) {
  const wrap = document.createElement('div');
  wrap.className = 'field-wrap' + (f.span2 ? ' field-span2' : '');

  // Label row: box badge + field name + AI icon
  const lblRow = document.createElement('div');
  lblRow.className = 'field-label-row';

  const lbl = document.createElement('label');
  lbl.className = 'field-label';
  lbl.innerHTML = `<span class="box-badge">${f.box}</span>${f.label}`;
  lblRow.appendChild(lbl);

  const aiBtn = document.createElement('button');
  aiBtn.className = 'field-ai-btn';
  aiBtn.title = `Ask AI about ${f.box}`;
  aiBtn.setAttribute('aria-label', `Ask AI about ${f.box}: ${f.label}`);
  aiBtn.textContent = '✦';
  aiBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('field-ai-ask', {
      detail: { box: f.box, label: f.label }
    }));
  });
  lblRow.appendChild(aiBtn);

  wrap.appendChild(lblRow);

  // Input element
  let el;
  if (f.type === 'area') {
    el = document.createElement('textarea');
    el.className = 'field-input field-textarea';
    el.placeholder = f.ph || '';
    el.rows = 3;
  } else if (f.type === 'select') {
    el = document.createElement('select');
    el.className = 'field-input field-select';
    (f.opts || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      el.appendChild(o);
    });
  } else {
    el = document.createElement('input');
    el.type = f.type === 'number' ? 'number' : 'text';
    el.className = 'field-input';
    el.placeholder = f.ph || '';
    if (f.type === 'number') el.step = '0.01';
  }

  wrap.appendChild(el);
  return wrap;
}
