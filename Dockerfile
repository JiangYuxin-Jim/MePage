FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production SITE_ROOT=/data HOST=0.0.0.0 ADMIN_HOST=0.0.0.0
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 18731 18732
VOLUME ["/data"]
CMD ["node", "app.js"]
