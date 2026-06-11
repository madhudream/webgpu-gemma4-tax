// ─────────────────────────────────────────────────────────────────────────────
// examples/index.js — registry of arena examples
// ─────────────────────────────────────────────────────────────────────────────
// Metadata is statically declared for the sidebar; the example module itself
// is lazy-loaded on activation, so we only download Lit/Chart.js/etc. for
// examples the user actually picks.

export const EXAMPLES = [
  {
    id:      'chart-stitcher',
    name:    'Chart Stitcher',
    icon:    '📊',
    accent:  '#6366f1',
    tagline: 'Ask. Model picks chart + dataset. Mounts on grid.',
    loader:  () => import('./chart-stitcher.js').then(m => m.chartStitcher)
  },
  {
    id:      'auto-dashboard',
    name:    'Auto Dashboard',
    icon:    '🧱',
    accent:  '#22c55e',
    tagline: 'One click. Full dashboard from every dataset.',
    loader:  () => import('./auto-dashboard.js').then(m => m.autoDashboard)
  },
  {
    id:      'voice-chart',
    name:    'Voice Chart',
    icon:    '🎙',
    accent:  '#ec4899',
    tagline: 'Speak a prompt. STT → Gemma → chart.',
    loader:  () => import('./voice-chart.js').then(m => m.voiceChart)
  },
  {
    id:      'form-filler',
    name:    'Form Filler',
    icon:    '📝',
    accent:  '#eab308',
    tagline: 'Describe a scenario. Model fills a W-2 form.',
    loader:  () => import('./form-filler.js').then(m => m.formFiller)
  },
  {
    id:      'page-qa',
    name:    'Page Q&A',
    icon:    '📖',
    accent:  '#06b6d4',
    tagline: 'Ask about a doc. Model reads and cites sections.',
    loader:  () => import('./page-qa.js').then(m => m.pageQA)
  },
  {
    id:      'code-sandbox',
    name:    'Code Sandbox',
    icon:    '⚙️',
    accent:  '#a855f7',
    tagline: 'Model writes JS in a worker, sees output, iterates.',
    loader:  () => import('./code-sandbox.js').then(m => m.codeSandbox)
  }
];

const _cache = new Map();

export async function loadExample(id) {
  if (_cache.has(id)) return _cache.get(id);
  const meta = EXAMPLES.find(e => e.id === id);
  if (!meta) throw new Error(`unknown example: ${id}`);
  const ex = await meta.loader();
  // Attach metadata for convenience
  ex.meta = meta;
  _cache.set(id, ex);
  return ex;
}

export function getExampleMeta(id) {
  return EXAMPLES.find(e => e.id === id) || null;
}
