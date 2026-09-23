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
# Food types shared with the Logic-API, imported as ../../shared from client/src.
COPY shared/ ./shared/

# Build client production bundle
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve static files with unprivileged nginx (UID 101)
FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx configuration as a template. The entrypoint renders it into
# /etc/nginx/conf.d/default.conf at start-up, substituting LOGIC_API_UPSTREAM only.
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template

# Included by every location in the template. Not a template itself: it contains no
# variables, and envsubst only processes files under /etc/nginx/templates.
COPY client/security-headers.conf /etc/nginx/security-headers.conf

# Default upstream matches the docker-compose service name; k3s overrides it
# from the shoppingwise-config ConfigMap.
ENV LOGIC_API_UPSTREAM=logic-api:3001 \
    NGINX_ENVSUBST_FILTER=^LOGIC_API_

# Copy production bundle from builder stage
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
