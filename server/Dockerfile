# The API needs a persistent process, a writable disk and ffmpeg — none of
# which a serverless runtime provides. A container gives all three.
FROM node:22-slim

# ffmpeg is a hard dependency of the local renderer (the sim-* models).
# Without it those models fail at generate time with a clear error, but the
# product is meant to work with no third-party key, so it ships in the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first so a code-only change does not reinstall dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# Overridden by the platform; declared so `docker run` alone works.
ENV NODE_ENV=production
ENV PORT=8787

# DATA_DIR and STORAGE_DIR point at the mounted disk in production so the
# database and generated media survive a redeploy.
EXPOSE 8787

CMD ["node", "--no-warnings", "src/index.js"]
