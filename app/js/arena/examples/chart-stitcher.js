// ─────────────────────────────────────────────────────────────────────────────
// chart-stitcher example — chat → model picks chart + dataset → mounts on grid
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_TOOLS, runChartTool } from '../tools/chart-tools.js';
import { initCanvas, clearCanvas } from '../canvas.js';
import { buildSystemPrompt } from '../agent.js';

const INTRO =
  'You are an agent that renders charts and KPIs on a 12-column grid canvas, by calling tools.';

const WORKFLOW = `  1. Call list_components to see what UI is available.
  2. Call list_datasets to see what data exists. Pick the most relevant one.
  3. Call get_dataset to fetch it.
  4. Call load_component for the component you want to render — use the EXACT kebab-case name (bar-chart, line-chart, kpi-card, table-card). Not "BarChart", not "Bar".
  5. Call render with that same kebab-case name, props that match its schema, and a slot {col, colspan, rowspan}.
  6. Call finish with a short message to the user.

Available components are exactly: bar-chart, line-chart, kpi-card, table-card.

Fallback: If the user asks for something none of these can express (a pie chart, a heatmap, a custom layout), DO NOT make up a component name. Skip load_component and call render_html instead, passing self-contained HTML with Tailwind utility classes. Tailwind is preloaded globally.

When you call render_html, ALWAYS pass a "notice" string saying why you fell back, e.g. "Fallback: no pie-chart component, drawn with Tailwind." or "Sample data: no dataset for X was available — using sample values."

If no dataset matches the user's request (e.g. they ask for revenue-by-region but no such dataset exists), still render a representative sample with realistic placeholder numbers, and mention that in the notice.

PIE CHART RECIPE (use exactly this structure, swap colours/percentages):
\`\`\`tool_call
{"name":"render_html","args":{
  "html":"<div class='flex h-full p-3 gap-4 items-center'><div class='w-36 h-36 rounded-full' style='background: conic-gradient(#6366f1 0 30%, #ec4899 30% 55%, #22c55e 55% 80%, #eab308 80% 100%);'></div><ul class='text-xs space-y-1'><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#6366f1'></span>Salaries 30%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#ec4899'></span>Cloud 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#22c55e'></span>Marketing 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#eab308'></span>Other 20%</li></ul></div>",
  "notice":"Fallback: no pie-chart component — drawn with a Tailwind conic-gradient.",
  "slot":{"col":1,"colspan":6,"rowspan":4}
}}
\`\`\``;

const RULES = `- Slot grid is 12 columns wide. Default size: colspan 6, rowspan 4. Stack components by leaving col=1 and letting rows auto-flow.
- Match dataset shape to component schema. For a bar/line chart, use the dataset's labels + values arrays directly.
- Component names are kebab-case ONLY. "BarChart" / "Bar" / "bar_chart" are wrong; the correct name is "bar-chart".
- Prefer registered web-components. Only use render_html when none fit OR no dataset matches.
- render_html MUST include a "notice" arg explaining the fallback. The user sees this banner on the rendered card.`;

export const chartStitcher = {
  id:          'chart-stitcher',
  name:        'Chart Stitcher',
  description: 'Ask Gemma to render charts. Model picks a component, fetches a dataset, and mounts it on the grid.',
  icon:        '📊',
  accent:      '#6366f1',
  presets: [
    { label: 'Bar — monthly sales',  text: 'render a bar chart of monthly sales' },
    { label: 'Line — weekly signups', text: 'show me weekly signups as a line chart' },
    { label: 'KPI — MRR headline',    text: 'show the MRR headline KPI in the top-left' },
    { label: 'Table — expenses',      text: 'render an expense breakdown as a two-column table' }
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
            <div class="canvas-empty-icon">📊</div>
            <div class="canvas-empty-title">Empty canvas</div>
            <div class="canvas-empty-sub">
              Try a preset above, click a dataset or component on the right, or describe what you want — Gemma will pick.
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
