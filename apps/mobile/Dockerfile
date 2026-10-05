# --- Stage 1: builder ---
FROM oven/bun:1 AS builder
WORKDIR /workspace

# Copy the whole workspace manifest structure first to leverage Docker layer caching.
# The .dockerignore excludes node_modules, .expo and dist so only sources are copied.
COPY . .

# Install dependencies (bun workspaces, lockfile-frozen for reproducible builds)
RUN bun install --frozen-lockfile

# Build argument for API URL (set at build time).
# The default keeps z.url() validation happy when building without an explicit URL.
ARG EXPO_PUBLIC_API_URL=http://localhost:3000
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

# Build the web application.
# Must run from apps/mobile so Expo picks up app.config.ts there.
# Expo 57 web export output is 'dist' (static output mode).
RUN cd apps/mobile && bunx expo export --platform web

# --- Stage 2: production ---
FROM nginx:stable-alpine-slim

# Configuration Nginx optimisée pour une SPA (Single Page Application)
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Redirections relatives pour que le port Docker externe (8080) soit conservé
    absolute_redirect off;

    # Compression Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        # L'export statique Expo génère items.html, pas items/index.html.
        # 1. On retire le slash final (/items/ -> /items) pour éviter un 403
        #    (le dossier items/ existe mais n'a pas d'index.html).
        rewrite ^/(.*)/$ /$1 break;
        # 2. On sert la page pré-rendue .html correspondant à la route.
        try_files \$uri \$uri.html \$uri/ /index.html;
    }

    # Cache long terme pour les assets statiques (images, polices, JS/CSS buildés)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Copy only the build result
COPY --from=builder /workspace/apps/mobile/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]