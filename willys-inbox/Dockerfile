ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64

# ---- Builder: compile server + panel ----
FROM node:22-alpine AS builder
WORKDIR /build

COPY app/package.json app/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY app/tsconfig.json ./
COPY app/src ./src
RUN npm run build

COPY app/panel/package.json app/panel/package-lock.json* ./panel/
RUN cd panel && npm install --no-audit --no-fund

COPY app/panel ./panel
RUN cd panel && npm run build

# ---- Runtime: Home Assistant base, node + compiled assets only ----
FROM ghcr.io/home-assistant/base:latest

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN \
    apk add --no-cache \
        nodejs \
    && rm -f /etc/init.d/*

WORKDIR /app
COPY --from=builder /build/dist ./server
COPY --from=builder /build/panel/dist ./panel
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
