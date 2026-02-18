FROM node:20-alpine
WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY packages/core/package*.json packages/core/
COPY packages/server/package*.json packages/server/

# Install everything (root + workspaces, including devDeps for build)
RUN npm install

# Copy source code
COPY packages/core packages/core
COPY packages/server packages/server

# Build server (esbuild bundles core + server into single file)
RUN cd packages/server && node esbuild.config.mjs

EXPOSE 3456
CMD ["node", "packages/server/dist/index.js"]
