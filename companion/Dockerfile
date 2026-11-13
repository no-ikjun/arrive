FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node server.mjs proxy-policy.mjs package.json ./
COPY --chown=node:node public/ ./public/
USER node
ENV HOST=0.0.0.0 PORT=8081
EXPOSE 8081
CMD ["node", "server.mjs"]
