FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PORT=3001

COPY services/logic-api/package*.json ./

RUN npm install --omit=dev

COPY services/logic-api/src/ ./src/
COPY data/ ./data/

EXPOSE 3001

CMD ["node", "src/index.js"]
