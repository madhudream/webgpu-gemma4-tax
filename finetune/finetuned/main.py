"""
Convert Fine-Tuned Gemma 4 (MLX) → ONNX
=========================================

The pipeline has two stages:

  Stage 1  MLX → HuggingFace (PyTorch BF16)
  ─────────────────────────────────────────
  irs-gemma4-merged/  contains MLX 4-bit affine-quantised weights.
  PyTorch/transformers cannot load those directly.  Convert first:

      mlx_lm.convert \\
          --hf-path ./irs-gemma4-merged \\
          --mlx-path /tmp/mlx-tmp \\
          --dtype bfloat16 \\
          --out-path ./irs-gemma4-hf

  If ./irs-gemma4-hf already exists you can skip Stage 1.

  Stage 2  HuggingFace → ONNX  (this script)
  ──────────────────────────────────────────
  Recommended (uses Optimum):
      pip install optimum[onnxruntime]
      optimum-cli export onnx \\
          --model ./irs-gemma4-hf \\
          --task text-generation-with-past \\
          ./irs-gemma4-onnx/

  Or run this script directly:
      python main.py [--model ./irs-gemma4-hf] [--output ./irs-gemma4-onnx]

Upload to HuggingFace afterwards:
    huggingface-cli upload your-username/irs-gemma4-onnx ./irs-gemma4-onnx/
"""

import os
import shutil
import argparse
import torch
import torch.nn as nn
from transformers import AutoConfig, AutoProcessor


# =============================================================================
# Wrapper: embed_tokens
# Maps input_ids → dense embeddings (+ optional per-layer embeddings for
# Gemma 4's hidden_size_per_layer_input feature).
# =============================================================================
class EmbedTokensWrapper(nn.Module):
    def __init__(self, lang_model):
        super().__init__()
        inner = lang_model.model          # Gemma4TextModel
        self.embed_tokens = inner.embed_tokens

        # Gemma 4 feeds a small per-layer embedding to each transformer block.
        # The attribute name differs across transformers versions.
        ple_attr = next(
            (a for a in ("per_layer_model_input_emb", "per_layer_inputs_emb",
                         "per_layer_emb", "per_layer_input")
             if hasattr(inner, a)),
            None,
        )
        self.ple = getattr(inner, ple_attr) if ple_attr else None

    def forward(self, input_ids):
        embeds = self.embed_tokens(input_ids)
        if self.ple is not None:
            return embeds, self.ple(input_ids)
        return embeds


# =============================================================================
# Wrapper: decoder_model_merged
# Runs the full language-model forward pass and returns logits.
# use_cache=False keeps the graph static (no KV-cache outputs) which is
# required for the "merged" (prefill + decode in one graph) ONNX variant.
# =============================================================================
class DecoderWrapper(nn.Module):
    def __init__(self, lang_model):
        super().__init__()
        self.lang_model = lang_model

    def forward(self, inputs_embeds, attention_mask, position_ids):
        out = self.lang_model(
            inputs_embeds=inputs_embeds,
            attention_mask=attention_mask,
            position_ids=position_ids,
            use_cache=False,
        )
        return out.logits


# =============================================================================
# Attempt export via Optimum (cleanest path for Transformers.js)
# =============================================================================
def _try_optimum_export(model_path: str, output_dir: str) -> bool:
    try:
        from optimum.exporters.onnx import main_export
    except ImportError:
        print("  optimum not installed — skipping (pip install optimum[onnxruntime])")
        return False

    print("  Running optimum ONNX export (text-generation-with-past)...")
    try:
        main_export(
            model_name_or_path=model_path,
            output=output_dir,
            task="text-generation-with-past",
            do_validation=False,
        )
        print("  ✅ optimum export succeeded")
        return True
    except Exception as exc:
        print(f"  optimum export failed ({exc}); falling back to torch.onnx")
        return False


# =============================================================================
# Manual torch.onnx export (fallback)
# =============================================================================
def _torch_onnx_export(model_path: str, output_dir: str, config) -> bool:
    from transformers import Gemma4ForConditionalGeneration

    print("\nLoading Gemma4ForConditionalGeneration weights (this may take a while)…")
    full_model = Gemma4ForConditionalGeneration.from_pretrained(
        model_path,
        torch_dtype=torch.float32,   # float32 is safest for ONNX tracing
        device_map="cpu",
    ).eval()

    # Gemma 4 is multimodal; for text ONNX we only need the language_model sub-module.
    lang = full_model.language_model.eval()

    text_cfg = config.text_config
    hidden_size = text_cfg.hidden_size   # 2560 for Gemma 4 E4B
    onnx_dir = os.path.join(output_dir, "onnx")
    os.makedirs(onnx_dir, exist_ok=True)

    SEQ = 8  # dummy sequence length for tracing

    # ── 1. embed_tokens ──────────────────────────────────────────────────────
    print("\n[1/2] Exporting embed_tokens.onnx …")
    embed_wrapper = EmbedTokensWrapper(lang).eval()
    dummy_ids = torch.zeros(1, SEQ, dtype=torch.long)

    has_ple = embed_wrapper.ple is not None
    out_names = ["inputs_embeds"] + (["per_layer_inputs"] if has_ple else [])
    dyn_axes: dict = {
        "input_ids":    {0: "batch", 1: "seq"},
        "inputs_embeds": {0: "batch", 1: "seq"},
    }
    if has_ple:
        dyn_axes["per_layer_inputs"] = {0: "batch", 1: "seq"}

    try:
        torch.onnx.export(
            embed_wrapper,
            (dummy_ids,),
            os.path.join(onnx_dir, "embed_tokens.onnx"),
            input_names=["input_ids"],
            output_names=out_names,
            dynamic_axes=dyn_axes,
            opset_version=17,
            do_constant_folding=True,
        )
        print("  ✅ embed_tokens.onnx")
    except Exception as exc:
        print(f"  ❌ embed_tokens export failed: {exc}")
        return False

    # ── 2. decoder_model_merged ───────────────────────────────────────────────
    print("\n[2/2] Exporting decoder_model_merged.onnx …")
    decoder_wrapper = DecoderWrapper(lang).eval()

    dummy_embeds  = torch.zeros(1, SEQ, hidden_size)
    dummy_mask    = torch.ones(1, SEQ, dtype=torch.long)
    dummy_pos_ids = torch.arange(SEQ).unsqueeze(0)

    try:
        torch.onnx.export(
            decoder_wrapper,
            (dummy_embeds, dummy_mask, dummy_pos_ids),
            os.path.join(onnx_dir, "decoder_model_merged.onnx"),
            input_names=["inputs_embeds", "attention_mask", "position_ids"],
            output_names=["logits"],
            dynamic_axes={
                "inputs_embeds":  {0: "batch", 1: "seq"},
                "attention_mask": {0: "batch", 1: "seq"},
                "position_ids":   {0: "batch", 1: "seq"},
                "logits":         {0: "batch", 1: "seq"},
            },
            opset_version=17,
            do_constant_folding=True,
        )
        print("  ✅ decoder_model_merged.onnx")
    except Exception as exc:
        print(f"  ❌ decoder export failed: {exc}")
        print("  Tip: try  optimum-cli export onnx  for more robust Gemma 4 support.")
        return False

    return True


# =============================================================================
# Copy tokeniser / config files and write README
# =============================================================================
def _copy_artifacts(model_path: str, output_dir: str):
    print("\nCopying tokeniser and config files…")
    for fname in (
        "config.json", "tokenizer.json", "tokenizer_config.json",
        "special_tokens_map.json", "generation_config.json",
        "preprocessor_config.json", "chat_template.jinja",
    ):
        src = os.path.join(model_path, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(output_dir, fname))
            print(f"  copied {fname}")

    with open(os.path.join(output_dir, "README.md"), "w") as fh:
        fh.write("""\
# IRS Tax Assistant — Fine-Tuned Gemma 4 (ONNX)

Fine-tuned on IRS tax documentation for use with Transformers.js + WebGPU.

## Usage (Transformers.js)

```javascript
import { Gemma4ForConditionalGeneration, AutoProcessor } from "@huggingface/transformers";

const model = await Gemma4ForConditionalGeneration.from_pretrained(
    "your-username/irs-gemma4-onnx",
    { dtype: "q4f16", device: "webgpu" }
);
```

## Training details
- Base model: gemma-4-E4B-it
- Method: LoRA (r=16, alpha=32)
- Data: IRS tax documentation Q&A pairs
- Framework: mlx-lm on Apple Silicon
""")


# =============================================================================
# Entry point
# =============================================================================
def export_model(model_path: str, output_dir: str):
    # Guard: warn if caller passed the MLX model by mistake
    cfg_path = os.path.join(model_path, "config.json")
    if os.path.exists(cfg_path):
        import json
        with open(cfg_path) as fh:
            raw = json.load(fh)
        if "quantization" in raw and raw["quantization"].get("mode") == "affine":
            print(
                f"\n⚠️  {model_path} contains MLX 4-bit affine-quantised weights.\n"
                "   PyTorch cannot load these directly.  Pass --model ./irs-gemma4-hf\n"
                "   (the already-converted HuggingFace copy) instead.\n"
                "   See the module docstring for the mlx_lm.convert command.\n"
            )
            return False

    config = AutoConfig.from_pretrained(model_path)

    os.makedirs(output_dir, exist_ok=True)

    # ── Try optimum first ────────────────────────────────────────────────────
    print("\n── Stage 1: attempting optimum export ──────────────────────────────")
    if _try_optimum_export(model_path, output_dir):
        _copy_artifacts(model_path, output_dir)
        _print_summary(output_dir)
        return True

    # ── Fall back to torch.onnx ──────────────────────────────────────────────
    print("\n── Stage 1 (fallback): torch.onnx export ───────────────────────────")
    if not _torch_onnx_export(model_path, output_dir, config):
        return False

    _copy_artifacts(model_path, output_dir)
    _print_summary(output_dir)
    return True


def _print_summary(output_dir: str):
    print(f"\n{'='*60}")
    print(f"Export complete → {output_dir}/")
    print(f"{'='*60}")
    for root, _, files in os.walk(output_dir):
        for f in sorted(files):
            fp = os.path.join(root, f)
            mb = os.path.getsize(fp) / (1024 ** 2)
            print(f"  {os.path.relpath(fp, output_dir):50s}  {mb:7.1f} MB")
    print()
    print("Next steps:")
    print(f"  Validate :  python -c \"import onnxruntime; print('onnxruntime OK')\"")
    print(f"  Upload   :  huggingface-cli upload your-username/irs-gemma4-onnx {output_dir}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export Gemma 4 (HF) → ONNX")
    parser.add_argument(
        "--model", default="./irs-gemma4-hf",
        help="Path to the HuggingFace-format model (NOT the MLX merged folder)",
    )
    parser.add_argument("--output", default="./irs-gemma4-onnx", help="Output directory")
    args = parser.parse_args()

    ok = export_model(args.model, args.output)
    raise SystemExit(0 if ok else 1)