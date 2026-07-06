FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    BROWSER_HEADLESS=true \
    WWEBJS_AUTH_PATH=/data/.wwebjs_auth

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN env -u PUPPETEER_EXECUTABLE_PATH -u PUPPETEER_SKIP_DOWNLOAD npm ci --omit=dev
RUN env -u PUPPETEER_EXECUTABLE_PATH -u PUPPETEER_SKIP_DOWNLOAD npx puppeteer browsers install chrome

COPY src ./src

RUN mkdir -p /data/.wwebjs_auth

CMD ["npm", "start"]
