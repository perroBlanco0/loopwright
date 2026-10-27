FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      chromium \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

COPY nemotron-client.js tools.js verify.js agent-runner.js ./

ENV WORKSPACE_DIR=/workspace
RUN mkdir -p /workspace

ENTRYPOINT ["node", "agent-runner.js"]
