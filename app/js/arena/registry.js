// ─────────────────────────────────────────────────────────────────────────────
// registry.js — component catalog + lazy loader
// ─────────────────────────────────────────────────────────────────────────────
//
// Catalog is the model-facing description of every renderable component.
// Components are loaded on demand via dynamic import() so the initial page
// stays light (Lit + Chart.js arrive only when first chart is requested).
//
// Quantized Gemma 4 E2B occasionally writes "BarChart", "Bar", or "bar_chart"
// instead of the literal "bar-chart" component name. We normalize lookups
// (alphanumerics only, lowercase) and also accept short aliases like "bar".

export const CATALOG = {
  'bar-chart': {
    description: 'Vertical bar chart. Good for comparing discrete categories.',
    module: './components/bar-chart.js',
    aliases: ['bar', 'bars', 'barchart', 'barcomponent', 'barplot'],
    propsSchema: {
      title:  { type: 'string', required: false },
      labels: { type: 'string[]', required: true,  description: 'X-axis category labels' },
      values: { type: 'number[]', required: true,  description: 'Bar heights, same length as labels' },
      yLabel: { type: 'string', required: false }
    }
  },

  'line-chart': {
    description: 'Line chart. Good for time series or trends.',
    module: './components/line-chart.js',
    aliases: ['line', 'lines', 'linechart', 'lineplot', 'trend', 'timeseries'],
    propsSchema: {
      title:  { type: 'string', required: false },
      labels: { type: 'string[]', required: true,  description: 'X-axis labels (e.g. months)' },
      values: { type: 'number[]', required: true,  description: 'Y values, same length as labels' },
      yLabel: { type: 'string', required: false }
    }
  },

  'kpi-card': {
    description: 'Single big number with a label and optional delta. Good for headline metrics.',
    module: './components/kpi-card.js',
    aliases: ['kpi', 'metric', 'metriccard', 'stat', 'statcard', 'numbercard', 'headline'],
    propsSchema: {
      label: { type: 'string', required: true },
      value: { type: 'string|number', required: true },
      delta: { type: 'string', required: false, description: 'e.g. "+12% vs last month"' },
      tone:  { type: 'string', required: false, description: '"good" | "bad" | "neutral"' }
    }
  },

  'table-card': {
    description: 'Two-column table. Good for category breakdowns alongside a chart.',
    module: './components/table-card.js',
    aliases: ['table', 'tablechart', 'breakdown', 'list'],
    propsSchema: {
      title:   { type: 'string', required: false },
      columns: { type: 'string[]', required: true,  description: 'header labels, e.g. ["Category", "Amount"]' },
      rows:    { type: 'string[][]', required: true, description: '[["Salaries", "$320k"], ...]' }
    }
  }
};

const _loaded = new Set();

// Build a normalized-key → canonical-name lookup for fuzzy matching.
const _alias = new Map();
for (const [canonical, meta] of Object.entries(CATALOG)) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  _alias.set(norm(canonical), canonical);
  for (const a of (meta.aliases || [])) _alias.set(norm(a), canonical);
}

/**
 * Resolve any reasonable spelling of a component name to its canonical id.
 * Returns null if no match. Examples:
 *   resolveName("BarChart")  → "bar-chart"
 *   resolveName("bar_chart") → "bar-chart"
 *   resolveName("Bar")       → "bar-chart"
 *   resolveName("PieChart")  → null
 */
export function resolveName(name) {
  if (typeof name !== 'string') return null;
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return _alias.get(norm) || null;
}

export function listCatalog() {
  return Object.entries(CATALOG).map(([name, meta]) => ({
    name,
    description: meta.description,
    propsSchema: meta.propsSchema,
    loaded: _loaded.has(name)
  }));
}

export function listCatalogNames() {
  return Object.keys(CATALOG);
}

export function hasComponent(name) {
  return resolveName(name) !== null;
}

export function isLoaded(name) {
  const canonical = resolveName(name);
  return canonical ? _loaded.has(canonical) : false;
}

export async function loadComponent(name) {
  const canonical = resolveName(name);
  if (!canonical) {
    throw new Error(
      `unknown component "${name}". Available: ${listCatalogNames().join(', ')}. ` +
      `If none of these fit, call render_html with Tailwind CSS classes instead.`
    );
  }
  if (_loaded.has(canonical)) return { name: canonical, alreadyLoaded: true };

  const meta = CATALOG[canonical];
  await import(meta.module);
  if (!customElements.get(canonical)) {
    throw new Error(`module ${meta.module} did not register custom element <${canonical}>`);
  }
  _loaded.add(canonical);
  return { name: canonical, alreadyLoaded: false };
}
