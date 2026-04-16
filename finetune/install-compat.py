# Gemma 4 ONNX Export — Clean Colab Install Steps
# Run each cell in order, restart runtime after Cell 1

# =============================================================================
# CELL 1: Install all dependencies (run this, then RESTART RUNTIME)
# =============================================================================

# Step 1: optimum-onnx from source (new package, replaces old optimum)
!pip uninstall optimum optimum-onnx -y
!pip install git+https://github.com/huggingface/optimum-onnx.git

# Step 2: transformers from source (for gemma4 support, --no-deps to prevent downgrade)
!pip install git+https://github.com/huggingface/transformers.git --no-deps --force-reinstall

# Step 3: huggingface_hub (matching version for transformers 5.6.0)
!pip install --upgrade huggingface_hub

# Step 4: torchvision (must match torch CUDA version)
!pip install torchvision --upgrade --force-reinstall

# Step 5: ONNX tools
!pip install onnx onnxruntime-gpu onnxscript

# >>> RESTART RUNTIME NOW <<<

# =============================================================================
# CELL 2: Verify everything is compatible
# =============================================================================

import transformers
print(f"transformers: {transformers.__version__}")

from transformers import CONFIG_MAPPING
print(f"gemma4: {'✓' if 'gemma4' in CONFIG_MAPPING else '✗'}")

try:
    from optimum.exporters.onnx.__main__ import main_export
    print("main_export: ✓")
except Exception as e:
    print(f"main_export: ✗ — {e}")

import torch
print(f"torch: {torch.__version__}")

import onnx
print(f"onnx: {onnx.__version__}")

# =============================================================================
# CELL 3: HuggingFace login
# =============================================================================

from google.colab import userdata
from huggingface_hub import login
login(token=userdata.get('HF_TOKEN'))

# =============================================================================
# CELL 4: Export to ONNX
# =============================================================================

# NOTE: As of April 2026, optimum-onnx does NOT have gemma4 OnnxConfig.
# main_export will fail with "unsupported architecture".
# Use torch.onnx.export dynamo approach instead:

import torch
import os
from transformers import AutoModelForCausalLM, AutoTokenizer

print("Loading model...")
model = AutoModelForCausalLM.from_pretrained(
    "madhured/irs-gemma4-e2b-merged-unsloth",
    dtype=torch.float16,
    device_map="cpu",
)
model.eval()

lang_model = model.model.language_model
lm_head = model.lm_head

class TextOnlyGemma4(torch.nn.Module):
    def __init__(self, lang_model, lm_head):
        super().__init__()
        self.lang_model = lang_model
        self.lm_head = lm_head
    def forward(self, input_ids, attention_mask):
        outputs = self.lang_model(input_ids=input_ids, attention_mask=attention_mask, use_cache=False)
        return self.lm_head(outputs[0])

text_model = TextOnlyGemma4(lang_model, lm_head).eval()

dummy_ids = torch.tensor([[1, 2, 3, 4, 5]], dtype=torch.long)
dummy_mask = torch.ones(1, 5, dtype=torch.long)

with torch.no_grad():
    out = text_model(dummy_ids, dummy_mask)
    print(f"Forward pass OK — {out.shape}")

os.makedirs("./irs-e2b-onnx", exist_ok=True)

batch = torch.export.Dim("batch", min=1, max=32)
seq = torch.export.Dim("seq", min=1, max=4096)

print("Exporting ONNX (dynamo)... takes 10-15 minutes")
torch.onnx.export(
    text_model, (dummy_ids, dummy_mask),
    "./irs-e2b-onnx/model.onnx",
    input_names=["input_ids", "attention_mask"],
    output_names=["logits"],
    dynamo=True,
    dynamic_shapes={"input_ids": {0: batch, 1: seq}, "attention_mask": {0: batch, 1: seq}},
)
print("model.onnx exported ✓")

# Copy tokenizer + config
tok = AutoTokenizer.from_pretrained("madhured/irs-gemma4-e2b-merged-unsloth")
tok.save_pretrained("./irs-e2b-onnx/")

from huggingface_hub import hf_hub_download
import shutil
for f in ["config.json", "preprocessor_config.json", "processor_config.json"]:
    try:
        p = hf_hub_download("madhured/irs-gemma4-e2b-merged-unsloth", f)
        shutil.copy(p, f"./irs-e2b-onnx/{f}")
    except:
        pass

print("All files ready ✓")

# =============================================================================
# CELL 5: Upload to HuggingFace
# =============================================================================

from huggingface_hub import HfApi

api = HfApi()
api.create_repo("madhured/irs-gemma4-e2b-onnx", exist_ok=True)
api.upload_folder(
    folder_path="./irs-e2b-onnx/",
    repo_id="madhured/irs-gemma4-e2b-onnx",
)
print("Uploaded to madhured/irs-gemma4-e2b-onnx ✓")