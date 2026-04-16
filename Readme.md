# WebGPU Browser-Based Tax AI Progress Summary

## Goal
Built a browser-based AI idea where a tax-knowledge model runs through **WebGPU**, so users can get help directly in the browser without paying per-token API costs.

## Start
On **April 13 at 4 a.m.**, started a proof of concept using **Gemma 4 ONNX** from Hugging Face and tried calling it with WebGPU in the browser.

## Collection
On **April 14 at 4 a.m.**, started building the data pipeline. First, scraped the IRS forms site with **Playwright**, covering **124 pages and 3,088 rows**, and saved the raw results.

## Filtering
Then cleaned that data by removing duplicates and non-English entries. Used **Claude Haiku** to help filter the list and ended up with a final set of English PDF links.

## Download
Created a simple **Node.js script** to download the IRS PDFs. From the larger scraped set, narrowed it to about **1,421 PDFs for Tax Year 2025**.

## Dataset
Started turning PDFs into training material by generating **Q&A pairs**.

Used two approaches:
- **Qwen with Ollama**: about **200 documents in 20 hours**, producing around **10,000 Q&As**
- **Claude Haiku API**: about **241 documents in 2 hours**, also around **10,000 Q&As**

This helped compare local generation versus API-based generation.

## Training
Used roughly **1,000 Q&As** first, mainly to learn the fine-tuning workflow. Tried multiple routes:
- Fine-tuned on the **Mac** first, but ran into format issues and could not convert to ONNX
- Moved to **Google Colab**, but ONNX conversion still failed
- Finally switched to **Unsloth Gemma 4**, and successfully pushed the model to **Hugging Face**

## Blocker
The biggest issue became **ONNX conversion**. The available **Optimum** tooling did not properly support **Gemma 4**. The only known ONNX version online seemed to be created internally by Hugging Face staff. Reached out asking for their script, and in parallel started a **Plan B** by looking at a **Gemma 3 PR** and trying to patch it for Gemma 4 with Claude’s help.

## Fallback
Since ONNX conversion was still failing, moved ahead with a practical browser workaround. Took **8 forms**, found the related PDFs from the 1,421-document list, generated Q&A for just those forms, and passed that into the browser model in a **RAG-like, form-specific context**.

## Product
Built a UI where **Gemma 4 runs in the browser with WebGPU**. When a user selects a form, the app injects the relevant form Q&A so the model can answer questions using form-specific information. Also added support for **field help** and **known issues / form connections** directly in-browser.

## Deploy
By **April 15 at 3 p.m.**, deployed the proof of concept to **GCP** so it could be shared.

## Desktop
Also created a simple **WebView2-based desktop approach** to cache the model in a local cache/database so multiple apps could load it more efficiently, though this part is still untested.

## Next
Still pending:
- Test the **WebView2** flow
- Evaluate model quality with actual **metrics**
- Continue exploring the **fine-tune route**
- Keep pushing on a working **Gemma 4 to ONNX** path

## Overall
This was a strong few days: you moved from a rough WebGPU idea to a working browser-based tax AI proof of concept, built a real IRS document pipeline, generated training data at scale, fine-tuned Gemma 4, deployed a usable demo, and identified ONNX support as the main technical blocker.
