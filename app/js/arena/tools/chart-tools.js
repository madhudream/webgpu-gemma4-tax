// ─────────────────────────────────────────────────────────────────────────────
// chart-tools.js — toolset shared by Chart Stitcher, Auto Dashboard, Voice Chart
// ─────────────────────────────────────────────────────────────────────────────

import { listCatalog, listCatalogNames, loadComponent, hasComponent, isLoaded, resolveName, CATALOG } from '../registry.js';
import { listDatasets, getDataset } from '../datasets.js';
import { mountComponent, mountHtml, unmountSlot, listMounted } from '../canvas.js';

// ── Fallback hint generator ─────────────────────────────────────────────────
// When the model asks to load a component we don't have (e.g. "pie-chart",
// "donut", "heatmap"), return a structured success-shaped result that gives
// it a ready-to-paste render_html template. Throwing an error makes q4 E2B
// freeze and emit prose; a structured hint nudges it to keep going.
const PIE_HTML_TEMPLATE =
  `<div class='flex h-full p-3 gap-4 items-center'>` +
    `<div class='w-36 h-36 rounded-full' style='background: conic-gradient(#6366f1 0 30%, #ec4899 30% 55%, #22c55e 55% 80%, #eab308 80% 100%);'></div>` +
    `<ul class='text-xs space-y-1'>` +
      `<li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#6366f1'></span>A 30%</li>` +
      `<li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#ec4899'></span>B 25%</li>` +
      `<li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#22c55e'></span>C 25%</li>` +
      `<li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#eab308'></span>D 20%</li>` +
    `</ul>` +
  `</div>`;

const HEATMAP_HTML_TEMPLATE =
  `<div class='p-3 h-full grid grid-cols-6 grid-rows-4 gap-1'>` +
    Array.from({ length: 24 }, (_, i) => {
      const intensity = ((i * 37 + 11) % 100);
      const op = (intensity / 100).toFixed(2);
      return `<div class='rounded-sm' style='background: rgba(99,102,241,${op})' title='${intensity}'></div>`;
    }).join('') +
  `</div>`;

const GENERIC_CARD_TEMPLATE =
  `<div class='flex flex-col h-full p-4 rounded-lg' style='background:linear-gradient(135deg,#6366f1,#ec4899);color:white'>` +
    `<div class='text-xs opacity-80 uppercase tracking-wide'>Sample</div>` +
    `<div class='text-2xl font-semibold mt-1'>Custom Card</div>` +
    `<div class='text-sm opacity-90 mt-2'>Replace this with your own Tailwind markup.</div>` +
  `</div>`;

function buildFallbackHint(requestedName) {
  const norm = String(requestedName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let html, kind;
  if (/(pie|donut|doughnut|ring)/.test(norm))   { html = PIE_HTML_TEMPLATE;     kind = 'pie chart'; }
  else if (/(heat|matrix)/.test(norm))           { html = HEATMAP_HTML_TEMPLATE; kind = 'heatmap'; }
  else                                           { html = GENERIC_CARD_TEMPLATE; kind = requestedName; }

  return {
    ok: false,
    component_loaded: false,
    next_step: 'render_html',
    notice: `Fallback: no ${kind} component, drawn with Tailwind.`,
    suggested_html: html,
    suggested_slot: { col: 1, colspan: 6, rowspan: 4 },
    available: Object.keys(CATALOG),
    instruction:
      `The component "${requestedName}" is not registered. ` +
      `Call render_html next, passing { "html": <suggested_html above>, "notice": <notice above>, "slot": <suggested_slot above> }. ` +
      `Then call finish.`
  };
}

export const CHART_TOOLS = [
  {
    name: 'list_components',
    description: 'List every available web-component with its props schema. Call this first to see what can be rendered.',
    args: {}
  },
  {
    name: 'load_component',
    description: 'Lazy-load a component module so it can be rendered. Use the EXACT kebab-case name from list_components (e.g. "bar-chart").',
    args: { name: 'string — exact kebab-case component name (bar-chart, line-chart, kpi-card, table-card)' }
  },
  {
    name: 'list_datasets',
    description: 'List the pre-seeded mock datasets you can ask for.',
    args: {}
  },
  {
    name: 'get_dataset',
    description: 'Fetch the actual data for a dataset by id.',
    args: { id: 'string — dataset id from list_datasets' }
  },
  {
    name: 'render',
    description: 'Mount a loaded component on the canvas. Returns a mountId for later unmount.',
    args: {
      component: 'string — kebab-case component name (must be loaded first)',
      props:     'object — props matching the component schema',
      slot:      'object — { col: 1-12, colspan: 1-12, rowspan: 1-N } grid placement'
    }
  },
  {
    name: 'render_html',
    description: 'FALLBACK ONLY — when no registered web-component fits, OR no dataset matches the user request, mount custom HTML on the canvas. Tailwind CSS is loaded globally; use any Tailwind utility class. ALWAYS pass a one-sentence "notice" explaining why you fell back (e.g. "Fallback: no pie-chart component, drawn with Tailwind." or "Sample data: no dataset for revenue by region was available.") so the user sees it on the rendered card.',
    args: {
      html:   'string — raw HTML markup; use Tailwind classes for layout/colour. Self-contained, a single root div is fine.',
      notice: 'string — one short sentence shown as a banner on top of the rendered card, telling the user this is a fallback or sample.',
      slot:   'object — { col: 1-12, colspan: 1-12, rowspan: 1-N }'
    }
  },
  {
    name: 'unmount',
    description: 'Remove a mounted component from the canvas.',
    args: { mountId: 'string — id returned by render or render_html' }
  },
  {
    name: 'list_mounted',
    description: 'List currently mounted components on the canvas.',
    args: {}
  },
  {
    name: 'finish',
    description: 'Call when the user request is fully satisfied. Pass a short message for the user.',
    args: { message: 'string — final message to user' }
  }
];

export async function runChartTool(name, args = {}) {
  switch (name) {
    case 'list_components': return listCatalog();

    case 'load_component': {
      if (typeof args.name !== 'string') throw new Error('load_component: args.name is required');
      const canonical = resolveName(args.name);
      if (canonical) return await loadComponent(canonical);
      // Unknown component — return a structured hint instead of throwing so
      // the model has a clear path forward (call render_html with template).
      return buildFallbackHint(args.name);
    }

    case 'list_datasets': return listDatasets();

    case 'get_dataset': {
      if (typeof args.id !== 'string') throw new Error('get_dataset: args.id is required');
      return getDataset(args.id);
    }

    case 'render': {
      if (!args.component) throw new Error('render: args.component required');
      const canonical = resolveName(args.component);
      if (!canonical) {
        // Same fallback hint pattern as load_component — keep the model moving.
        return buildFallbackHint(args.component);
      }
      if (!isLoaded(canonical)) {
        throw new Error(`render: component "${canonical}" not loaded — call load_component first`);
      }
      if (!args.props) throw new Error('render: args.props required');
      const mountId = mountComponent(canonical, args.props, args.slot || {});
      return { mountId, component: canonical, ok: true };
    }

    case 'render_html': {
      if (typeof args.html !== 'string' || !args.html.trim()) {
        throw new Error('render_html: args.html must be a non-empty string of HTML');
      }
      const notice = typeof args.notice === 'string' ? args.notice : '';
      const mountId = mountHtml(args.html, args.slot || {}, notice);
      return { mountId, ok: true, notice };
    }

    case 'unmount': {
      if (!args.mountId) throw new Error('unmount: mountId required');
      const ok = unmountSlot(args.mountId);
      return { ok };
    }

    case 'list_mounted': return listMounted();

    case 'finish':
      return { done: true, message: args.message || '' };

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
