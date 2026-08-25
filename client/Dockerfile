# Multi-stage build for client SPA
# Stage 1: Build production bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests and install
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy client source code and shared data directory
COPY client/ ./client/
COPY data/ ./data/

# Build client production bundle
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve static files with unprivileged nginx (UID 101)
FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy production bundle from builder stage
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
