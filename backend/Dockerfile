# syntax=docker/dockerfile:1

# ── Build stage ────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS build

WORKDIR /src

# Resolve deps first so the module cache survives source edits.
COPY go.mod ./
RUN go mod download

COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /out/sealed ./cmd/server

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S sealed && adduser -S sealed -G sealed

COPY --from=build /out/sealed /usr/local/bin/sealed

USER sealed
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/sealed"]
