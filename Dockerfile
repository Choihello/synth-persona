FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsup.config.ts tsconfig.json ./
COPY web/package.json web/package.json
RUN npm ci
COPY src src
COPY cli cli
COPY eval eval
COPY scripts scripts
COPY web web
COPY data data
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist dist
COPY --from=build /app/data data
EXPOSE 8787
# 필요 env: OPENAI_API_KEY, IP_SALT / 선택: PORT, DB_PATH(볼륨), PER_IP_DAILY, DAILY_GLOBAL_CAP
CMD ["node", "dist/web/main.js"]
