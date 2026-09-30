# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first to leverage layer caching
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copy source code
COPY . .

# VITE_API_BASE_URL is baked in at build time.
# Override via --build-arg or in docker-compose build.args.
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our SPA-aware nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The CSP's connect-src must name the API origin the bundle was built against.
ARG VITE_API_BASE_URL=http://localhost:8080
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
RUN origin=$(echo "$VITE_API_BASE_URL" | sed -E 's#^(https?://[^/]+).*#\1#') \
    && sed -i "s#__API_ORIGIN__#$origin#g" /etc/nginx/snippets/security-headers.conf

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
