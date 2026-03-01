FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build && npm prune --omit=dev

EXPOSE 4000

CMD ["node", "dist/index.js"]
