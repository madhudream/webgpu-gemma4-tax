// ─────────────────────────────────────────────────────────────────────────────
// code-sandbox example — Gemma writes JS, sandbox runs it, model iterates
// ─────────────────────────────────────────────────────────────────────────────

import { buildSystemPrompt } from '../agent.js';

const TOOLS = [
  {
    name: 'run_js',
    description: 'Execute JavaScript in a sandboxed worker (no DOM, no fetch). The last expression is returned. Use console.log to emit debug output. 3-second timeout.',
    args: { code: 'string — JavaScript source. The final expression\'s value is returned.' }
  },
  {
    name: 'finish',
    description: 'Provide the final answer to the user.',
    args: { message: 'string — the answer or summary' }
  }
];

const INTRO =
  'You are an agent that solves user requests by writing JavaScript and running it in a sandbox. Use small steps and iterate when needed.';

const WORKFLOW = `  1. Read the user's request and write JS that computes the answer.
  2. Call run_js with the code. Inspect the result and console output.
  3. If the result is wrong or the code errored, fix the code and call run_js again. Limit yourself to 3 attempts.
  4. Call finish with the final answer.`;

const RULES = `- Worker has no DOM, no network, no Date.now manipulation. Pure compute only.
- The last expression of the code is the return value — don't forget to leave it bare (no \`const result = …;\` at the very end).
- Prefer concise code. Use console.log only for intermediate debugging.
- Don't define top-level \`var x = …\` and then expect to use \`x\` again across calls — each run_js is a fresh worker.`;

export const codeSandbox = {
  id:          'code-sandbox',
  name:        'Code Sandbox',
  description: 'Gemma writes and runs JavaScript in a sandboxed worker to solve compute tasks.',
  icon:        '⚙️',
  accent:      '#a855f7',
  presets: [
    { label: 'Fibonacci(20)',          text: 'Compute the 20th Fibonacci number.' },
    { label: 'Sum primes < 100',       text: 'Find the sum of all prime numbers below 100.' },
    { label: 'Reverse words',          text: 'Reverse the order of words in: "the quick brown fox jumps". Return the result.' },
    { label: 'JSON shape',             text: 'Given this object {"a":1,"b":{"c":2,"d":[3,4,5]}}, return the depth of the nested structure.' }
  ],
  tools:    TOOLS,
  systemPrompt: buildSystemPrompt(INTRO, TOOLS, WORKFLOW, RULES),

  async setupWorkspace(workspaceEl) {
    await import('../components/code-sandbox.js');

    workspaceEl.innerHTML = `<div class="ws-code"><code-sandbox></code-sandbox></div>`;
    const sandboxEl = workspaceEl.querySelector('code-sandbox');

    this.runTool = async (name, args = {}) => {
      switch (name) {
        case 'run_js': {
          if (typeof args.code !== 'string' || !args.code.trim()) {
            throw new Error('run_js: args.code must be a non-empty string');
          }
          const r = await sandboxEl.runCode(args.code);
          // Trim long results before returning to the model.
          return {
            ok:     r.ok,
            result: r.ok ? r.result : undefined,
            error:  r.ok ? undefined : r.error,
            logs:   (r.logs || []).slice(-10)
          };
        }

        case 'finish':
          return { done: true, message: args.message || '' };

        default:
          throw new Error(`unknown tool: ${name}`);
      }
    };

    return () => { sandboxEl?.reset(); };
  },

  runTool: () => { throw new Error('code-sandbox: runTool not initialised — setupWorkspace first'); }
};
