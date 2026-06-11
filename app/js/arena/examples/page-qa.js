// ─────────────────────────────────────────────────────────────────────────────
// page-qa example — model answers questions by reading sections of a doc.
// ─────────────────────────────────────────────────────────────────────────────

import { buildSystemPrompt } from '../agent.js';

const TOOLS = [
  {
    name: 'list_sections',
    description: 'List every section of the document with id and title (no body).',
    args: {}
  },
  {
    name: 'read_section',
    description: 'Return the body text of one section.',
    args: { id: 'string — section id from list_sections' }
  },
  {
    name: 'search_text',
    description: 'Search for a substring across all sections. Returns matching section ids and the surrounding context.',
    args: { query: 'string — text to search for (case-insensitive)' }
  },
  {
    name: 'highlight_text',
    description: 'Visually highlight a section in the workspace and optionally a substring within it.',
    args: {
      id:      'string — section id to highlight',
      snippet: 'string — optional substring within the section body to mark'
    }
  },
  {
    name: 'finish',
    description: 'Provide the final answer. Pass `message` (the answer text) and `cited` (array of section ids referenced).',
    args: {
      message: 'string — final answer for the user',
      cited:   'string[] — section ids you read to answer'
    }
  }
];

const INTRO =
  'You are an agent that answers user questions by reading sections of a sample document. Cite the sections you read.';

const WORKFLOW = `  1. Call list_sections to see what is available.
  2. Pick the most relevant section(s); call read_section for each (do not call read_section more than 3 times).
  3. Optionally call search_text first if the query is keyword-driven.
  4. Call highlight_text on the section that best supports your answer.
  5. Call finish with the answer and the cited section ids.`;

const RULES = `- Answer only from the document content. If the answer isn't there, say so in the finish message.
- Keep answers under 3 sentences.
- Always call highlight_text before finish so the user can see the source.`;

export const pageQA = {
  id:          'page-qa',
  name:        'Page Q&A',
  description: 'Ask Gemma about a sample tax-help article. Model reads sections, highlights the source, and cites them.',
  icon:        '📖',
  accent:      '#06b6d4',
  presets: [
    { label: 'Who gets a W-2?',           text: 'Who is required to issue a Form W-2 to an employee?' },
    { label: 'When does it arrive?',      text: 'By what date must employers send W-2s?' },
    { label: 'No income tax states?',     text: 'Which states have no state income tax on wages?' },
    { label: 'What if mine is wrong?',    text: 'What should I do if my W-2 has the wrong Social Security number?' }
  ],
  tools:    TOOLS,
  systemPrompt: buildSystemPrompt(INTRO, TOOLS, WORKFLOW, RULES),

  async setupWorkspace(workspaceEl) {
    const { SECTIONS } = await import('../components/sample-doc.js');

    workspaceEl.innerHTML = `<div class="ws-doc"><sample-doc></sample-doc></div>`;
    const docEl = workspaceEl.querySelector('sample-doc');

    this.runTool = async (name, args = {}) => {
      switch (name) {
        case 'list_sections':
          return SECTIONS.map(s => ({ id: s.id, title: s.title }));

        case 'read_section': {
          const sec = SECTIONS.find(s => s.id === args.id);
          if (!sec) throw new Error(`unknown section: ${args.id}`);
          return { id: sec.id, title: sec.title, body: sec.body };
        }

        case 'search_text': {
          if (typeof args.query !== 'string' || !args.query.trim()) {
            throw new Error('search_text: args.query required');
          }
          const q = args.query.toLowerCase();
          const hits = [];
          for (const sec of SECTIONS) {
            const idx = sec.body.toLowerCase().indexOf(q);
            if (idx >= 0) {
              hits.push({
                id: sec.id,
                title: sec.title,
                excerpt: sec.body.slice(Math.max(0, idx - 30), idx + args.query.length + 60)
              });
            }
          }
          return { query: args.query, hits };
        }

        case 'highlight_text': {
          if (!args.id) throw new Error('highlight_text: args.id required');
          docEl.highlight(args.id, args.snippet || '');
          return { ok: true, id: args.id };
        }

        case 'finish':
          return { done: true, message: args.message || '', cited: args.cited || [] };

        default:
          throw new Error(`unknown tool: ${name}`);
      }
    };

    return () => { docEl?.highlight(null, null); };
  },

  runTool: () => { throw new Error('page-qa: runTool not initialised — setupWorkspace first'); }
};
