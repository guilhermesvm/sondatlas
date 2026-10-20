FROM node:22.12.0-bookworm-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN npm run build

EXPOSE 8080
CMD ["./node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
