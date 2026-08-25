FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PORT=3001 \
    CATALOG_PATH=/usr/src/app/data/catalog.json \
    CONTAMINATION_RULES_PATH=/usr/src/app/data/contamination-rules.json

COPY services/logic-api/package*.json ./

RUN npm install --omit=dev

COPY services/logic-api/src/ ./src/
COPY data/ ./data/

EXPOSE 3001

CMD ["node", "src/index.js"]
