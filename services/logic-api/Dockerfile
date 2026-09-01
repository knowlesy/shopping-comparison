FROM node:22-alpine

WORKDIR /usr/src/app

ARG APP_VERSION=1.3.0
ENV NODE_ENV=production \
    PORT=3001 \
    APP_VERSION=${APP_VERSION} \
    CATALOG_PATH=/usr/src/app/data/catalog.json \
    CONTAMINATION_RULES_PATH=/usr/src/app/data/contamination-rules.json

COPY services/logic-api/package*.json ./

RUN npm install --omit=dev

COPY services/logic-api/src/ ./src/
COPY data/ ./data/
COPY CHANGELOG.md ./

EXPOSE 3001

CMD ["node", "src/index.js"]
