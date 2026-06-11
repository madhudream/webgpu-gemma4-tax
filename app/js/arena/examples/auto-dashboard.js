// ─────────────────────────────────────────────────────────────────────────────
// auto-dashboard example — single click, model fetches every dataset and
// stitches a multi-component dashboard. Reuses the chart toolset.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_TOOLS, runChartTool } from '../tools/chart-tools.js';
import { initCanvas, clearCanvas } from '../canvas.js';
import { buildSystemPrompt } from '../agent.js';

const INTRO = 'You are an agent that builds a dashboard on a 12-column grid by calling tools.';

const WORKFLOW = `  1. Call list_components to see UI options.
  2. Call list_datasets to see ALL available datasets.
  3. For each dataset, call get_dataset and pick the best matching component.
  4. Call load_component for each unique component you plan to use — use the EXACT kebab-case name from list_components (bar-chart, line-chart, kpi-card, table-card).
  5. Call render once per component, packing them into the 12-column grid:
       - KPIs: colspan 3, rowspan 2 (across the top)
       - Charts: colspan 6, rowspan 4
       - Tables: colspan 6, rowspan 4
  6. Call finish.

Aim for 4–5 mounted components covering every dataset.

Available components are exactly: bar-chart, line-chart, kpi-card, table-card.

Fallback: If you want a section the registered components can't express (e.g. a header banner, a legend, a pie chart, a custom callout), call render_html instead with Tailwind utility classes. Tailwind is preloaded globally.

ALWAYS pass a "notice" string to render_html stating why you fell back (no pie-chart component / no dataset for X / using sample values). The notice shows as a banner on the card.

PIE CHART RECIPE (use exactly this structure, swap colours/percentages):
\`\`\`tool_call
{"name":"render_html","args":{
  "html":"<div class='flex h-full p-3 gap-4 items-center'><div class='w-36 h-36 rounded-full' style='background: conic-gradient(#6366f1 0 30%, #ec4899 30% 55%, #22c55e 55% 80%, #eab308 80% 100%);'></div><ul class='text-xs space-y-1'><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#6366f1'></span>A 30%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#ec4899'></span>B 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#22c55e'></span>C 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#eab308'></span>D 20%</li></ul></div>",
  "notice":"Fallback: pie-chart drawn with Tailwind (no pie-chart component registered).",
  "slot":{"col":1,"colspan":6,"rowspan":4}
}}
\`\`\``;

const RULES = `- Use the FULL grid: stagger col=1 and col=7 so rows fill nicely.
- KPIs go on the top row. Charts and tables fill the rest.
- Don't repeat the same dataset twice.
- Component names are kebab-case ONLY (bar-chart, not "BarChart" or "Bar").
- render_html calls MUST include a "notice" arg.`;

const PRESET_PROMPT = 'Build a complete dashboard using every available dataset. Use KPIs at the top and charts and a table below.';

export const autoDashboard = {
  id:          'auto-dashboard',
  name:        'Auto Dashboard',
  description: 'One click. Gemma reads every dataset and renders a packed dashboard.',
  icon:        '🧱',
  accent:      '#22c55e',
  presets: [
    { label: 'Build full dashboard', text: PRESET_PROMPT, primary: true }
  ],
  tools:    CHART_TOOLS,
  runTool:  runChartTool,
  systemPrompt: buildSystemPrompt(INTRO, CHART_TOOLS, WORKFLOW, RULES),

  async setupWorkspace(workspaceEl, { submitPrompt } = {}) {
    await Promise.all([
      import('../components/dataset-list.js'),
      import('../components/component-list.js')
    ]);

    workspaceEl.innerHTML = `
      <div class="ws-canvas-split">
        <div class="ws-canvas">
          <div id="canvas-empty" class="canvas-empty">
            <div class="canvas-empty-icon">🧱</div>
            <div class="canvas-empty-title">Auto Dashboard</div>
            <div class="canvas-empty-sub">
              Click the preset to ask Gemma to fetch every dataset and stitch a dashboard.
              Expect ~6–10 tool calls.
            </div>
          </div>
          <div id="canvas-grid" class="canvas-grid"></div>
        </div>
        <div class="ws-side">
          <dataset-list></dataset-list>
          <component-list></component-list>
        </div>
      </div>
    `;
    initCanvas();

    const dsList = workspaceEl.querySelector('dataset-list');
    const cList  = workspaceEl.querySelector('component-list');
    const onDs = (e) => {
      const id = e.detail?.id;
      if (id && submitPrompt) submitPrompt(`render the most appropriate chart for the "${id}" dataset`);
    };
    const onComp = (e) => {
      const name = e.detail?.name;
      if (name && submitPrompt) submitPrompt(`render a ${name} using the most relevant dataset`);
    };
    dsList.addEventListener('use-dataset', onDs);
    cList .addEventListener('use-component', onComp);

    return () => {
      dsList.removeEventListener('use-dataset', onDs);
      cList .removeEventListener('use-component', onComp);
      clearCanvas();
    };
  }
};
