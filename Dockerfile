# CodeForge website (landing, web editor, code browser, download page, Git proxy).
#   docker build -t codeforge-site .
#   docker run -p 8080:8080 -e PLAY_STORE_URL=https://play.google.com/store/apps/details?id=... codeforge-site
# To include the Android APK, put it at ./CodeForge.apk before building (or mount it at /site/downloads/CodeForge.apk and apk.json).
FROM node:20-alpine AS build
RUN apk add --no-cache python3
WORKDIR /src
COPY . .
RUN if [ -f CodeForge.apk ]; then APK=/src/CodeForge.apk sh tools/site/build-site.sh /site; else sh tools/site/build-site.sh /site; fi

FROM node:20-alpine
WORKDIR /srv
COPY --from=build /site /srv/site
COPY backend/server.js /srv/server.js
ENV SITE_DIR=/srv/site PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.js"]
