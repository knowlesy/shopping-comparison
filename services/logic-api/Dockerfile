FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PORT=3001

COPY package*.json ./

RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/index.js"]
