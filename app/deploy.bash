# 1. Build & push (no local Docker needed)
gcloud builds submit --tag gcr.io/webgpu-493415/webgpu-poc --project webgpu-493415

# 2. Deploy to Cloud Run
gcloud run deploy webgpu-poc \
  --image gcr.io/webgpu-493415/webgpu-poc \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --project webgpu-493415