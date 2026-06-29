FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    BROWSER_HEADLESS=true \
    WWEBJS_AUTH_PATH=/data/.wwebjs_auth

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /data/.wwebjs_auth

CMD ["npm", "start"]
