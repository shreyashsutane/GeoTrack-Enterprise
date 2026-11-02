# ==============================================================================
# Root Dockerfile for Render / Koyeb / Cloud Deployments
# ==============================================================================

FROM golang:1.26-alpine AS builder

WORKDIR /app

RUN apk add --no-cache ca-certificates git

# Copy Go module files from backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy backend source code
COPY backend/ ./

# Build static binary
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build \
    -ldflags="-s -w" \
    -o /app/bin/server ./cmd/server

# Production Runtime Stage
FROM alpine:3.20

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /home/appuser

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/server /home/appuser/server

# Copy frontend assets if available
COPY frontend/ /home/appuser/frontend/

RUN chown -R appuser:appgroup /home/appuser
USER appuser

ENV PORT=10000
ENV FRONTEND_DIR=/home/appuser/frontend

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:10000/healthz || exit 1

ENTRYPOINT ["/home/appuser/server"]
