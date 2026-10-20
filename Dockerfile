# 요세의 수호자 — 24시간 운영용 컨테이너

# ── ① 빌드 (개발 의존성 필요 — vite) ────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
# 빌드에는 devDependencies(vite)가 필요하므로 --omit=dev 를 쓰지 않는다
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ── ② 실행용 의존성만 따로 설치 ─────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --omit=dev --no-audit --no-fund

# ── ③ 실행 이미지 ───────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./
RUN mkdir -p /app/server/data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/index.js"]
