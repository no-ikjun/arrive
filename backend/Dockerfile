# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY contracts/oryong-demo.json /contracts/oryong-demo.json
COPY contracts/venues/index.json /contracts/venues/index.json
ENV VENUE_CATALOG_INDEX_PATH=/contracts/venues/index.json
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV VENUE_CATALOG_INDEX_PATH=/contracts/venues/index.json
# 배포 스크립트의 docker healthcheck 가 wget 사용
RUN apk add --no-cache wget
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY contracts/oryong-demo.json /contracts/oryong-demo.json
COPY contracts/venues/index.json /contracts/venues/index.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
