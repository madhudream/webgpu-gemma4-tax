// ─────────────────────────────────────────────────────────────────────────────
// form-filler example — Gemma fills a synthetic W-2 form via tools
// ─────────────────────────────────────────────────────────────────────────────

import { buildSystemPrompt } from '../agent.js';

const TOOLS = [
  {
    name: 'list_fields',
    description: 'List every field on the form with its current value.',
    args: {}
  },
  {
    name: 'read_field',
    description: 'Read the current value of a single field.',
    args: { name: 'string — field name from list_fields' }
  },
  {
    name: 'set_field',
    description: 'Set a field to a string value. The form re-renders and the field flashes.',
    args: {
      name:  'string — field name',
      value: 'string — value to set (numbers as strings)'
    }
  },
  {
    name: 'set_fields',
    description: 'Set multiple fields at once. Pass an object map { field_name: value, ... }. Faster than calling set_field repeatedly.',
    args: { values: 'object — { field_name: value, ... }' }
  },
  {
    name: 'submit_form',
    description: 'Submit the form. Returns { ok, missing[] }. Required fields are *_name, *_ssn, employer_ein.',
    args: {}
  },
  {
    name: 'finish',
    description: 'Done. Pass a short message to the user.',
    args: { message: 'string' }
  }
];

const INTRO =
  'You are an agent that fills a W-2 tax form on the user\'s behalf, by calling tools. The user will describe a scenario; you fill the form to match.';

const WORKFLOW = `  1. Call list_fields once to see the schema and current values.
  2. Use set_fields (preferred) or set_field to populate fields.
  3. Call submit_form. If anything is missing, fill it in and submit again.
  4. Call finish with a short summary.`;

const RULES = `- Field names are snake_case canonical ids from list_fields (e.g. "wages_box1", "employer_name", "employee_ssn"). NOT "Wages", NOT "EmployerName".
- Aliases also work: "wages" → wages_box1, "ssn" → employee_ssn, "name" → employee_name. Prefer the canonical name when known.
- set_fields accepts either { "values": { "wages_box1": "10000.00" } } OR a flat { "wages_box1": "10000.00" }. Both work.
- For numeric fields, send the number as a plain string ("75000.00", not "$75,000").
- If the user gives partial info, fill what you can. Make reasonable defaults for derived numbers (e.g. SS tax = 6.2% of wages).
- Never invent SSN/EIN — leave them as "000-00-0000" / "00-0000000" placeholders if not provided.
- After set_field/set_fields, check the returned \`set\` and \`ignored\` arrays. If anything is ignored, retry with the canonical name from list_fields.`;

export const formFiller = {
  id:          'form-filler',
  name:        'Form Filler',
  description: 'Describe a scenario; Gemma fills a synthetic W-2 form by calling field tools.',
  icon:        '📝',
  accent:      '#eab308',
  presets: [
    { label: 'Senior eng @ Acme — $180k', text: 'Fill the form for Jane Doe, senior engineer at Acme Corp, total wages $180,000 in California. Use placeholder SSN/EIN.' },
    { label: 'Simple — $75k retail',       text: 'Fill it for John Smith working at Widgets LLC, $75,000 wages, Texas, no state tax.' },
    { label: 'Reset and retry',            text: 'Reset every field to empty and submit to see which are required.' }
  ],
  tools:    TOOLS,
  systemPrompt: buildSystemPrompt(INTRO, TOOLS, WORKFLOW, RULES),

  // Lazy-imported in setupWorkspace so the form module/component aren't
  // downloaded until the user actually picks this example.
  async setupWorkspace(workspaceEl, { submitPrompt } = {}) {
    const [{ FIELDS, formStore, resolveFieldName }] = await Promise.all([
      import('../components/sample-form.js'),
      import('../components/voice-controls.js')
    ]);

    // Build runTool with closure over the freshly-loaded form store.
    this.runTool = async (name, args = {}) => {
      switch (name) {
        case 'list_fields':
          return FIELDS.map(f => ({
            name: f.name, label: f.label, type: f.type,
            aliases: f.aliases || [],
            value: formStore.get(f.name)
          }));

        case 'read_field': {
          if (typeof args.name !== 'string') throw new Error('read_field: args.name required');
          const canonical = resolveFieldName(args.name);
          if (!canonical) {
            return { ok: false, error: `unknown field "${args.name}"`, available: FIELDS.map(f => f.name) };
          }
          return { ok: true, name: canonical, value: formStore.get(canonical) };
        }

        case 'set_field': {
          if (!args.name) throw new Error('set_field: args.name required');
          const canonical = resolveFieldName(args.name);
          if (!canonical) {
            return {
              ok: false,
              error: `unknown field "${args.name}"`,
              available: FIELDS.map(f => f.name),
              hint: 'Use one of the canonical names from list_fields. Aliases like "wages" or "ssn" also work.'
            };
          }
          formStore.set(canonical, args.value);
          return { ok: true, name: canonical, value: formStore.get(canonical) };
        }

        case 'set_fields': {
          // Accept both { values: {...} } and a flat object as args.
          const raw = (args.values && typeof args.values === 'object') ? args.values : args;
          if (!raw || typeof raw !== 'object') throw new Error('set_fields: pass a key/value object');
          const set = [], ignored = [];
          for (const [k, v] of Object.entries(raw)) {
            if (k === 'values') continue;
            const canonical = resolveFieldName(k);
            if (!canonical) { ignored.push(k); continue; }
            formStore.set(canonical, v);
            set.push({ name: canonical, value: formStore.get(canonical) });
          }
          return {
            ok: set.length > 0,
            set,
            ignored,
            ...(ignored.length > 0
              ? { hint: 'Some keys did not match any field. Use exact names from list_fields.' }
              : {})
          };
        }

        case 'submit_form':
          return formStore.submit();

        case 'finish':
          return { done: true, message: args.message || '' };

        default:
          throw new Error(`unknown tool: ${name}`);
      }
    };

    workspaceEl.innerHTML = `
      <div class="ws-form ws-form--with-voice">
        <voice-controls></voice-controls>
        <sample-form></sample-form>
      </div>
    `;

    const voiceEl = workspaceEl.querySelector('voice-controls');
    const onVoiceFinal = (e) => {
      const t = e.detail?.text?.trim();
      if (t && submitPrompt) submitPrompt(t);
    };
    voiceEl?.addEventListener('voice-final', onVoiceFinal);

    return () => {
      voiceEl?.removeEventListener('voice-final', onVoiceFinal);
      formStore.reset();
    };
  },

  // Placeholder until setupWorkspace runs and replaces it.
  runTool: () => { throw new Error('form-filler: runTool not initialised — setupWorkspace first'); }
};
