// ─────────────────────────────────────────────────────────────────────────────
// voice-chart example — same chart toolset as Chart Stitcher, but the user
// dictates the prompt with their voice (Web Speech API). Falls back to chat
// input if speech recognition is not available.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_TOOLS, runChartTool } from '../tools/chart-tools.js';
import { initCanvas, clearCanvas } from '../canvas.js';
import { buildSystemPrompt } from '../agent.js';

const INTRO =
  'You are an agent that renders charts and KPIs on a 12-column grid canvas, by calling tools. The user is speaking, so transcripts may be informal — interpret intent generously.';

const WORKFLOW = `  1. Call list_components to see what UI is available.
  2. Call list_datasets to see what data exists; match the user's words to a dataset id.
  3. Call get_dataset to fetch it.
  4. Call load_component using the EXACT kebab-case name (bar-chart, line-chart, kpi-card, table-card).
  5. Call render with that same kebab-case name and props matching the schema.
  6. Call finish with a one-line confirmation.

Available components are exactly: bar-chart, line-chart, kpi-card, table-card.

Fallback: For requests outside these four (pie chart, heatmap, custom layout), call render_html with Tailwind classes instead. Tailwind is preloaded.

ALWAYS pass a "notice" string to render_html stating why you fell back (no component / no dataset / sample values).

PIE CHART RECIPE (use exactly this structure, swap colours/percentages):
\`\`\`tool_call
{"name":"render_html","args":{
  "html":"<div class='flex h-full p-3 gap-4 items-center'><div class='w-36 h-36 rounded-full' style='background: conic-gradient(#6366f1 0 30%, #ec4899 30% 55%, #22c55e 55% 80%, #eab308 80% 100%);'></div><ul class='text-xs space-y-1'><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#6366f1'></span>A 30%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#ec4899'></span>B 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#22c55e'></span>C 25%</li><li><span class='inline-block w-2 h-2 rounded-full mr-2 align-middle' style='background:#eab308'></span>D 20%</li></ul></div>",
  "notice":"Fallback: pie-chart drawn with Tailwind.",
  "slot":{"col":1,"colspan":6,"rowspan":4}
}}
\`\`\``;

const RULES = `- Spoken phrases like "show me sales" → pick the closest dataset id (monthly-sales-2024).
- Default chart: bar for categorical month/week labels, line for time-series, kpi for headline numbers.
- If the request is ambiguous, pick a reasonable default and proceed.
- Component names are kebab-case ONLY ("bar-chart", not "BarChart").
- render_html calls MUST include a "notice" arg.`;

export const voiceChart = {
  id:          'voice-chart',
  name:        'Voice Chart',
  description: 'Speak a prompt; Gemma renders the chart. Web Speech API transcribes your voice into text.',
  icon:        '🎙',
  accent:      '#ec4899',
  presets: [
    { label: 'Sample — sales',   text: 'Show me a bar chart of monthly sales for 2024.' },
    { label: 'Sample — signups', text: 'Plot weekly signups as a line chart.' },
    { label: 'Sample — MRR',     text: 'Show the MRR headline KPI in the top-left.' }
  ],
  tools:    CHART_TOOLS,
  runTool:  runChartTool,
  systemPrompt: buildSystemPrompt(INTRO, CHART_TOOLS, WORKFLOW, RULES),

  async setupWorkspace(workspaceEl, { submitPrompt } = {}) {
    await Promise.all([
      import('../components/dataset-list.js'),
      import('../components/component-list.js'),
      import('../components/voice-controls.js')
    ]);

    workspaceEl.innerHTML = `
      <div class="ws-voice">
        <voice-controls></voice-controls>
        <div class="ws-canvas-split">
          <div class="ws-canvas">
            <div id="canvas-empty" class="canvas-empty">
              <div class="canvas-empty-icon">🎙</div>
              <div class="canvas-empty-title">Voice Chart</div>
              <div class="canvas-empty-sub">
                Tap the mic and say what you want to see. Note: in Chrome, the audio is sent to Google's speech service for transcription before being passed to the local Gemma 4 model.
              </div>
            </div>
            <div id="canvas-grid" class="canvas-grid"></div>
          </div>
          <div class="ws-side">
            <dataset-list></dataset-list>
            <component-list></component-list>
          </div>
        </div>
      </div>
    `;
    initCanvas();

    const voiceEl = workspaceEl.querySelector('voice-controls');
    const dsList  = workspaceEl.querySelector('dataset-list');
    const cList   = workspaceEl.querySelector('component-list');

    const onVoiceFinal = (e) => {
      const t = e.detail?.text?.trim();
      if (t && submitPrompt) submitPrompt(t);
    };
    const onDs = (e) => {
      const id = e.detail?.id;
      if (id && submitPrompt) submitPrompt(`render the most appropriate chart for the "${id}" dataset`);
    };
    const onComp = (e) => {
      const name = e.detail?.name;
      if (name && submitPrompt) submitPrompt(`render a ${name} using the most relevant dataset`);
    };

    voiceEl.addEventListener('voice-final', onVoiceFinal);
    dsList .addEventListener('use-dataset', onDs);
    cList  .addEventListener('use-component', onComp);

    return () => {
      voiceEl.removeEventListener('voice-final', onVoiceFinal);
      dsList .removeEventListener('use-dataset', onDs);
      cList  .removeEventListener('use-component', onComp);
      clearCanvas();
    };
  }
};
