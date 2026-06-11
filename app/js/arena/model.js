// ─────────────────────────────────────────────────────────────────────────────
// model.js — Gemma 4 loader and generation wrapper for the arena
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the proven pattern in app/js/ai.js (same model, same Transformers.js
// pin) but exposes a Promise<string> interface that returns the full assistant
// response — the agent loop needs the complete text to parse tool calls before
// deciding the next step.

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const CDN      = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

let _processor   = null;
let _model       = null;
let _StreamerCls = null;
let _state       = 'idle';   // idle | loading | ready | error
let _loadPromise = null;
let _onState     = null;

export function setStateCallback(fn) { _onState = fn; }
export function getState() { return _state; }

function emit(state, detail) {
  _state = state;
  _onState?.(state, detail);
}

export async function loadModel() {
  if (_state === 'ready')   return;
  if (_state === 'loading') return _loadPromise;

  emit('loading', 'Importing Transformers.js…');

  _loadPromise = (async () => {
    try {
      const { AutoProcessor, Gemma4ForConditionalGeneration, TextStreamer } = await import(CDN);
      _StreamerCls = TextStreamer;

      emit('loading', 'Loading processor…');
      _processor = await AutoProcessor.from_pretrained(MODEL_ID);

      emit('loading', 'Downloading weights…');
      _model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: 'q4f16',
        device: 'webgpu',
        progress_callback: (info) => {
          if (info.status === 'progress' && info.progress != null) {
            emit('loading', `Downloading… ${Math.round(info.progress)}%`);
          }
        }
      });

      emit('ready', 'Model ready');
    } catch (err) {
      emit('error', err?.message || 'load failed');
      throw err;
    }
  })();

  return _loadPromise;
}

/**
 * Run a single generation pass on the message list.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {{maxNewTokens?: number, onChunk?: (chunk:string)=>void}} opts
 * @returns {Promise<string>} full assistant response text
 */
export async function generate(messages, { maxNewTokens = 512, onChunk } = {}) {
  if (_state !== 'ready') throw new Error(`model not ready (state=${_state})`);

  const inputs = _processor.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_dict: true
  });

  let full = '';
  const streamer = new _StreamerCls(_processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      full += chunk;
      onChunk?.(chunk);
    }
  });

  await _model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    do_sample: false,
    streamer
  });

  return full;
}
