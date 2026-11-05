# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS base
# Bootstrap HTTPS trust from Node's bundled roots, then install Debian security fixes.
RUN mkdir -p /etc/ssl/certs \
    && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))" \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o APT::Update::Error-Mode=any update \
    && apt-get install --no-install-recommends -y apt libapt-pkg6.0 ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='\${Version}' apt)" ge 2.6.2 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund && mkdir -p node_modules

FROM base AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/worker ./worker
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
