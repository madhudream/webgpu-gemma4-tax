// ─────────────────────────────────────────────────────────────────────────────
// agent.js — generic Gemma 4 tool-calling loop (example-agnostic)
// ─────────────────────────────────────────────────────────────────────────────
//
// Protocol (custom JSON-in-fenced-block — chosen over Gemma's native
// function-calling tokens because Transformers.js Gemma 4 template support
// for `role:"tool"` is unstable. Plain text is debuggable and version-stable.):
//
//   The model emits exactly one of:
//     ```tool_call
//     {"name": "...", "args": {...}}
//     ```
//   …or a final assistant message with no fenced tool_call block.
//
//   We append the result as a user-role message:
//     ```tool_result
//     <name> => {...}
//     ```
//
// Loop terminates when:
//   - model emits no tool_call block (treated as final answer), OR
//   - model calls the `finish` tool, OR
//   - max iterations reached, OR
//   - tool throws repeatedly past the parse-error retry budget

import { generate } from './model.js';

const DEFAULT_MAX_ITERATIONS    = 10;
const DEFAULT_PARSE_RETRY_BUDGET = 2;

// ── Parser ───────────────────────────────────────────────────────────────────
const TOOL_CALL_RE = /```tool_call\s*([\s\S]*?)```/i;

function parseToolCall(text) {
  const m = text.match(TOOL_CALL_RE);
  if (!m) return null;
  const raw = m[1].trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`tool_call block is not valid JSON: ${err.message}`);
  }
  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('tool_call missing "name"');
  }
  return { name: parsed.name, args: parsed.args || {} };
}

function formatToolResult(name, result) {
  let json;
  try { json = JSON.stringify(result, null, 2); }
  catch { json = String(result); }
  // Truncate huge results so we don't blow up the context window mid-loop.
  if (json.length > 4000) json = json.slice(0, 4000) + '\n…(truncated)';
  return `\`\`\`tool_result\n${name} => ${json}\n\`\`\``;
}

// ── System prompt builder ────────────────────────────────────────────────────
export function buildSystemPrompt(intro, tools, workflow = '', rules = '') {
  const argSig = (args) => Object.keys(args || {}).join(', ');
  const toolList = tools
    .map(t => `- ${t.name}(${argSig(t.args)}) — ${t.description}`)
    .join('\n');

  return `${intro}

You have these tools:
${toolList}

To call a tool, output exactly this format and STOP:

\`\`\`tool_call
{"name": "tool_name", "args": {"key": "value"}}
\`\`\`

The runtime will execute the tool and reply with:

\`\`\`tool_result
tool_name => <json result>
\`\`\`

Then you continue, calling more tools, until done.
${workflow ? `\nWorkflow:\n${workflow}\n` : ''}
Rules:
- Output ONLY the tool_call block when calling a tool. No prose, no markdown around it.
- Always call \`finish\` at the end so the user sees a confirmation.
- If the user just chats (no tools needed), reply in plain text instead of calling tools.
${rules ? `${rules}\n` : ''}`.trim();
}

// ── Loop ─────────────────────────────────────────────────────────────────────
/**
 * @param {string} userText
 * @param {Array}  history          Mutated. {role, content}[]
 * @param {Object} cfg              { tools, runTool, systemPrompt }
 * @param {Object} hooks            { onToolStart, onAssistantMessage, onIteration }
 * @param {Object} opts             { maxIterations, parseRetryBudget, maxNewTokens }
 */
export async function runAgent(userText, history, cfg, hooks = {}, opts = {}) {
  const { tools, runTool, systemPrompt } = cfg;
  if (!Array.isArray(tools) || typeof runTool !== 'function' || !systemPrompt) {
    throw new Error('runAgent: cfg must include tools, runTool, systemPrompt');
  }

  const maxIterations    = opts.maxIterations    ?? DEFAULT_MAX_ITERATIONS;
  const parseRetryBudget = opts.parseRetryBudget ?? DEFAULT_PARSE_RETRY_BUDGET;
  const maxNewTokens     = opts.maxNewTokens     ?? 384;

  if (history.length === 0 || history[0].role !== 'system') {
    history.unshift({ role: 'system', content: systemPrompt });
  } else if (history[0].content !== systemPrompt) {
    // Example switched mid-session — reset context.
    history.length = 0;
    history.push({ role: 'system', content: systemPrompt });
  }
  history.push({ role: 'user', content: userText });

  let parseRetries = 0;
  let pendingFollowup = null;   // structured hint from previous tool result that requires a follow-up tool_call

  for (let iter = 0; iter < maxIterations; iter++) {
    hooks.onIteration?.(iter);
    const raw = await generate(history, { maxNewTokens });
    history.push({ role: 'assistant', content: raw });

    let call;
    try {
      call = parseToolCall(raw);
    } catch (err) {
      if (parseRetries++ < parseRetryBudget) {
        history.push({
          role: 'user',
          content: `Your previous tool_call block was malformed: ${err.message}\nReply again using the exact format.`
        });
        continue;
      }
      hooks.onAssistantMessage?.(raw);
      return { ok: false, reason: 'parse_failed' };
    }

    if (!call) {
      // If the previous tool result told the model to do a follow-up
      // (e.g. unknown component → "next_step: render_html"), don't accept
      // prose as final — re-prompt once.
      if (pendingFollowup && parseRetries++ < parseRetryBudget) {
        history.push({
          role: 'user',
          content:
            `You replied with prose, but the previous tool result requires you to call \`${pendingFollowup}\` next. ` +
            `Emit the tool_call block now.`
        });
        continue;
      }
      hooks.onAssistantMessage?.(raw);
      return { ok: true, reason: 'final_message' };
    }
    pendingFollowup = null;

    const bubble = hooks.onToolStart?.(call);
    let result;
    try {
      result = await runTool(call.name, call.args);
      bubble?.resolve(result);
    } catch (err) {
      bubble?.reject(err);
      history.push({
        role: 'user',
        content: `\`\`\`tool_result\n${call.name} => ERROR: ${err.message}\n\`\`\``
      });
      continue;
    }

    if (call.name === 'finish') {
      const msg = (typeof result?.message === 'string' && result.message) || 'Done.';
      hooks.onAssistantMessage?.(msg);
      return { ok: true, reason: 'finish' };
    }

    // If the tool result includes a `next_step` directive (fallback hints
    // from chart-tools.js), remember it so we can re-prompt if the model
    // tries to terminate with prose instead of following up.
    if (result && typeof result === 'object' && typeof result.next_step === 'string') {
      pendingFollowup = result.next_step;
    }

    history.push({ role: 'user', content: formatToolResult(call.name, result) });
  }

  hooks.onAssistantMessage?.('Stopped after max iterations.');
  return { ok: false, reason: 'max_iterations' };
}
