FROM node:20-alpine
WORKDIR /app

# Copy workspace root and package files
COPY package*.json ./
COPY packages/core/package*.json packages/core/
COPY packages/server/package*.json packages/server/

# Install only core + server workspace dependencies
RUN npm ci --workspace=packages/core --workspace=packages/server

# Copy source code
COPY packages/core packages/core
COPY packages/server packages/server

# Build server (bundles core via esbuild)
RUN cd packages/server && node esbuild.config.mjs

EXPOSE 3456
CMD ["node", "packages/server/dist/index.js"]
