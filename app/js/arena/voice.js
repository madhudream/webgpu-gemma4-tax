// ─────────────────────────────────────────────────────────────────────────────
// voice.js — speech-to-text via the browser's Web Speech API
// ─────────────────────────────────────────────────────────────────────────────
//
// Why Web Speech API and not Whisper/Transformers.js?
//   - Built in to Chrome/Edge: no extra ~30 MB Whisper download
//   - Real-time interim results — better UX than batch transcribe
//   - Caveat: the audio stream is sent to the browser vendor's cloud STT
//     service (Google, in Chrome). Note this when showing the user.
//
// API:
//   isSupported()                                 → boolean
//   createSession({ onInterim, onFinal, onError, onEnd })
//                                                 → { start, stop, abort }

const Ctor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function isSupported() {
  return !!Ctor;
}

/**
 * Create a single recognition session. Call start() to begin listening,
 * stop() to stop and emit the final transcript, abort() to cancel.
 *
 * @param {Object} hooks
 * @param {(text:string)=>void} [hooks.onInterim] — fires during recognition
 * @param {(text:string)=>void} [hooks.onFinal]   — fires once at the end
 * @param {(err:string)=>void}  [hooks.onError]
 * @param {()=>void}            [hooks.onEnd]
 */
export function createSession({ onInterim, onFinal, onError, onEnd } = {}) {
  if (!Ctor) {
    throw new Error('SpeechRecognition is not available in this browser');
  }

  const rec = new Ctor();
  rec.lang           = 'en-US';
  rec.interimResults = true;
  rec.continuous     = false;
  rec.maxAlternatives = 1;

  let lastFinal = '';
  let interim   = '';

  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0].transcript;
      if (r.isFinal) lastFinal += t;
      else           interim   += t;
    }
    const combined = (lastFinal + interim).trim();
    if (combined) onInterim?.(combined);
  };

  rec.onerror = (e) => {
    onError?.(e.error || 'unknown error');
  };

  rec.onend = () => {
    const final = lastFinal.trim();
    if (final) onFinal?.(final);
    onEnd?.();
  };

  return {
    start() {
      lastFinal = '';
      interim   = '';
      try { rec.start(); }
      catch (e) { onError?.(String(e?.message || e)); }
    },
    stop() {
      try { rec.stop(); } catch {}
    },
    abort() {
      lastFinal = '';
      interim   = '';
      try { rec.abort(); } catch {}
    }
  };
}
