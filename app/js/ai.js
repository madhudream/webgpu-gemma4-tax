// ─────────────────────────────────────────────────────────────────────────────
// ai.js — Gemma 4 WebGPU model loading and analysis generation
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const CDN      = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

// ── State ────────────────────────────────────────────────────────────────────
let aiModel       = null;
let aiProcessor   = null;
let TextStreamerCls = null;
let _state        = 'idle';   // idle | loading | ready | error
let _loadPromise  = null;

/** @returns {'idle'|'loading'|'ready'|'error'} */
export function getState() { return _state; }

// ── Progress callbacks (set by ui layer) ─────────────────────────────────────
let _onProgress = null;   // (pct: number) => void
let _onStateChange = null; // (state: string, detail?: string) => void

export function setProgressCallback(fn)    { _onProgress     = fn; }
export function setStateChangeCallback(fn) { _onStateChange  = fn; }

function emit(state, detail) {
  _state = state;
  _onStateChange?.(state, detail);
}

// ── Load ─────────────────────────────────────────────────────────────────────
export async function loadModel() {
  if (_state === 'ready')   return;
  if (_state === 'loading') { await _loadPromise; return; }

  emit('loading', 'Importing library…');

  _loadPromise = (async () => {
    try {
      const { AutoProcessor, Gemma4ForConditionalGeneration, TextStreamer } =
        await import(CDN);
      TextStreamerCls = TextStreamer;

      emit('loading', 'Loading processor…');
      aiProcessor = await AutoProcessor.from_pretrained(MODEL_ID);

      emit('loading', 'Downloading weights…');
      let lastPct = 0;

      aiModel = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: 'q4f16',
        device: 'webgpu',
        progress_callback: (info) => {
          if (info.status === 'progress' && info.progress != null) {
            const pct = Math.round(info.progress);
            if (pct > lastPct) {
              lastPct = pct;
              _onProgress?.(pct);
              emit('loading', `Downloading… ${pct}%`);
            }
          }
        },
      });

      emit('ready', 'Ready');
    } catch (err) {
      console.error('[ai.js] model load failed:', err);
      emit('error', err.message);
      throw err;
    }
  })();

  await _loadPromise;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Stream an AI risk summary into a DOM element.
 * @param {string}   formKey   e.g. '1099-MISC'
 * @param {Array}    issues    KNOWN_ISSUES[formKey]
 * @param {Element}  outputEl  DOM element to stream text into
 * @param {Function} onDone    called when generation finishes
 * @param {string}   guardKey  current form key — if it changes mid-run, abort
 */
export async function analyseForm(formKey, issues, outputEl, onDone, guardKey) {
  if (_state !== 'ready') throw new Error('Model not ready');

  const issueLines = issues.map((iss, i) =>
    `${i + 1}. [${iss.sev.toUpperCase()}] ${iss.title}: ${iss.body}`
  ).join('\n');

  const systemPrompt = 'You are a concise IRS tax expert. Answer in 2–3 sentences maximum. Be direct and practical.';
  const userPrompt =
    `I am a tax preparer reviewing IRS Form ${formKey}. ` +
    `It has ${issues.length} documented known issues:\n\n${issueLines}\n\n` +
    `What is the single most critical risk a preparer must watch for on this form? Be direct.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt  },
  ];

  console.group(`[AI] analyseForm — Form ${formKey}`);
  console.log('Issues passed to AI (%d):', issues.length, issues);
  console.log('System prompt:', systemPrompt);
  console.log('User prompt:', userPrompt);
  console.groupEnd();

  const inputs = aiProcessor.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_dict: true,
  });

  let fullResponse = '';

  const streamer = new TextStreamerCls(aiProcessor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      if (guardKey() !== formKey) return; // form switched — discard
      fullResponse += chunk;
      outputEl.textContent += chunk;
    },
  });

  await aiModel.generate({
    ...inputs,
    max_new_tokens: 160,
    do_sample: false,
    streamer,
  });

  if (guardKey() === formKey) {
    console.log(`[AI] Response for Form ${formKey}:`, fullResponse);
    onDone?.();
  }
}

/**
 * Ask the AI which forms from a given list are affected by a free-text issue.
 * @param {string}   issueText  Free-form description of the issue
 * @param {string[]} formKeys   Array of all form keys to test against
 * @param {Element}  outputEl   DOM element to stream raw AI text into (can be null)
 * @param {Function} onDone     called with (rawResponse, formKeys) when done
 */
export async function detectAffectedForms(issueText, formKeys, outputEl, onDone) {
  if (_state !== 'ready') throw new Error('Model not ready');

  const systemPrompt =
    'You are an IRS tax expert. Given a known compliance issue and a list of IRS tax form keys, ' +
    'respond with ONLY the form keys that are affected by this issue, comma-separated ' +
    '(e.g. "W-2, 1099-MISC"). Use the exact keys provided. If none apply, respond with "NONE". ' +
    'No explanation — just the keys.';

  const userPrompt =
    `Known issue:\n"${issueText}"\n\n` +
    `Available form keys: ${formKeys.join(', ')}\n\n` +
    `Which of these form keys are affected? Reply with only the affected keys, comma-separated.`;

  console.group('[AI] detectAffectedForms');
  console.log('Issue:', issueText);
  console.log('Forms checked:', formKeys);
  console.groupEnd();

  const inputs = aiProcessor.apply_chat_template(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { tokenize: true, add_generation_prompt: true, return_dict: true },
  );

  let fullResponse = '';
  const streamer = new TextStreamerCls(aiProcessor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      fullResponse += chunk;
      if (outputEl) outputEl.textContent = fullResponse;
    },
  });

  await aiModel.generate({ ...inputs, max_new_tokens: 60, do_sample: false, streamer });
  console.log('[AI] detectAffectedForms response:', fullResponse);
  onDone?.(fullResponse.trim(), formKeys);
}

/**
 * Answer a user chat message in the context of a specific tax form.
 *
 * Strategy:
 *   1. Inject the form's Q&A pairs as grounding context in the system prompt.
 *   2. Ask the model to answer and explicitly state whether the answer
 *      came from the provided Q&A ("Source: Q&A") or general knowledge
 *      ("Source: Model").
 *
 * @param {string}   formKey     e.g. 'W-2'
 * @param {Array}    qa          [{ question, answer }, …] from data.json
 * @param {string}   userMessage The user's chat message
 * @param {Element}  outputEl    DOM element to stream the response into
 * @param {Function} onDone      called with (fullResponse) when streaming ends
 */
export async function chatWithForm(formKey, qa, userMessage, outputEl, onDone, mode = 'mixed') {
  if (_state !== 'ready') throw new Error('Model not ready');

  let systemPrompt, fewShot = [];

  if (mode === 'model') {
    // ── Model-only: no Q&A injected, free general IRS knowledge ──────────────
    systemPrompt =
      `You are a knowledgeable IRS tax assistant. ` +
      `Answer questions about US tax forms, deadlines, regulations, and tax preparation using your general training knowledge. ` +
      `Be concise — 2–4 sentences. If you genuinely do not know, say so briefly.`;

  } else {
    // ── Grounded or Mixed: inject Q&A reference ───────────────────────────────
    const qaPairs = qa.slice(0, 20).map((item, i) =>
      `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}`
    ).join('\n\n');

    if (mode === 'grounded') {
      // Strictly: only answer from the Q&A; refuse if not found
      systemPrompt =
        `You are an IRS tax assistant for Form ${formKey}. ` +
        `You ONLY answer using the verified Q&A reference below — do not use outside knowledge.\n\n` +
        `--- REFERENCE Q&A ---\n${qaPairs}\n--- END REFERENCE ---\n\n` +
        `Rules:\n` +
        `1. If the answer is clearly in the reference, answer concisely (2–4 sentences) and end with "Source: Q&A".\n` +
        `2. If the answer is NOT in the reference, respond ONLY with: "I don't have information on that for Form ${formKey}."\n` +
        `3. NEVER use outside knowledge. NEVER guess.`;

      fewShot = [
        { role: 'user',      content: 'What goes in Box 99?' },
        { role: 'assistant', content: `I don't have information on that for Form ${formKey}.` },
      ];

    } else {
      // Mixed (default): Q&A preferred, model knowledge allowed as supplement
      systemPrompt =
        `You are a helpful IRS tax assistant specialising in Form ${formKey}. ` +
        `You have access to verified Q&A reference data below, and you may also use your general tax knowledge.\n\n` +
        `--- REFERENCE Q&A ---\n${qaPairs}\n--- END REFERENCE ---\n\n` +
        `Rules:\n` +
        `1. Prefer the reference Q&A. You may supplement with general tax knowledge.\n` +
        `2. If the answer comes from the reference, end with "Source: Q&A".\n` +
        `3. If the answer comes from your general knowledge (not the reference), end with "Source: Model".\n` +
        `4. If you truly cannot answer (neither the reference nor your knowledge covers it), respond ONLY with: "I don't have information on that."\n` +
        `5. Be concise — 2–4 sentences.`;

      fewShot = [
        { role: 'user',      content: 'What is the standard tax filing deadline?' },
        { role: 'assistant', content: 'The standard federal income tax filing deadline is April 15th for most individual taxpayers. Extensions to October 15 are available by filing Form 4868 before the deadline. Source: Model' },
        { role: 'user',      content: 'What goes in Box 99 of this form?' },
        { role: 'assistant', content: "I don't have information on that." },
      ];
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...fewShot,
    { role: 'user',   content: userMessage  },
  ];

  console.group(`[AI] chatWithForm — Form ${formKey} — mode: ${mode}`);
  console.log('User message:', userMessage);
  console.log('Q&A pairs injected:', mode === 'model' ? 0 : qa.length);
  console.groupEnd();

  const inputs = aiProcessor.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_dict: true,
  });

  let fullResponse = '';
  const streamer = new TextStreamerCls(aiProcessor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      fullResponse += chunk;
      if (outputEl) outputEl.textContent = fullResponse;
    },
  });

  await aiModel.generate({ ...inputs, max_new_tokens: 200, do_sample: false, streamer });
  console.log(`[AI] Chat response for ${formKey}:`, fullResponse);
  onDone?.(fullResponse.trim());
}
