# bookworm, not bullseye: Debian 11 left LTS on 2026-08-31 and its security pool
# started 404ing mid-install, which broke every CI build of this image.
FROM node:25-bookworm

# Install Chromium, Xvfb, fonts, and required X11/graphics dependencies for headless execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    xauth \
    procps \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
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
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Set environment variables
ENV NODE_ENV=production \
    PORT=3002 \
    DISPLAY=:99 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies from the lockfile.
# npm ci (not npm install) so the image gets exactly the audited dependency set:
# npm install may silently resolve newer versions than the lockfile records.
RUN npm ci --omit=dev

# Copy application files
COPY src/ ./src/
COPY entrypoint.sh ./

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

EXPOSE 3002

ENTRYPOINT ["./entrypoint.sh"]
