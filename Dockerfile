# --- Build stage ---
FROM node:20-slim AS builder

WORKDIR /app

# Install openssl for Prisma during build
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

# CRITICAL: Install openssl and ca-certificates for Prisma and GCP APIs
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Re-generate Prisma client for the production runtime environment
COPY prisma ./prisma/
RUN npx prisma generate

# Copy build artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Cloud Run defaults to port 8080
ENV PORT=8080
EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]
