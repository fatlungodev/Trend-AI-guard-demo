#Updated Build & Run Commands

#1. Build the image:
```text
bash
docker build -t trend-ai-guard .
# Optional: Override repo URL
# docker build --build-arg REPO_URL=https://github.com/your-fork/repo.git -t trend-ai-guard .
```

#2. Run the container: You must provide the .env file at runtime since it's no longer being copied into the image (a security best practice).
```text
bash
docker run -d \
  --name ai-guard \
  -p 3000:3000 \
  -v $(pwd)/auth_session:/app/auth_session \
  --env-file .env \
  trend-ai-guard
```