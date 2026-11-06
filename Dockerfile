# CodeForge website (React site, web editor, code browser, download page, Git proxy) in one small Node image.
#   docker build -t codeforge-site .
#   docker run -p 8080:8080 -e PLAY_STORE_URL=https://play.google.com/store/apps/details?id=... codeforge-site
# To include the Android APK, put it at ./CodeForge.apk before building (or put it in website/downloads/).
FROM node:20-alpine AS build
WORKDIR /src
COPY . .
RUN cd website && npm ci --no-audit --no-fund && (if [ -f /src/CodeForge.apk ]; then APK=/src/CodeForge.apk npm run build -- /site; else npm run build -- /site; fi)

FROM node:20-alpine
WORKDIR /srv
COPY --from=build /site /srv/site
COPY website/server/index.js /srv/server.js
ENV SITE_DIR=/srv/site PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.js"]
